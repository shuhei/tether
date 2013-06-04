var net = require('net');
var http = require('http');

var VirtualSocket = require('./lib/virtualsocket');
var color = require('./lib/color');

var config = {
  SERVER_PORT: parseInt(process.env.SERVER_PORT || 8090),
  DATA_LIMIT: 10000000
};

var HTTP_VERBS = 'GET PUT POST DELETE OPTIONS CONNECT UPGRADE PATCH'.split(' ');
var LONGEST_VERB_LENGTH = 7;

var httpServer = http.createServer();
var destinationSockets = {};
var destinationHosts = {};

httpServer.on('upgrade', function (req, socket, head) {
  var ws = httpServer.ws = VirtualSocket.upgrade(req, socket, 'proxy');

  ws.on('dataWithPort', function (srcPort, message) {
    var head = message.slice(0, LONGEST_VERB_LENGTH).toString();
    var hasVerb = false;
    HTTP_VERBS.forEach(function (verb) {
      if (head.indexOf(verb) === 0) hasVerb = true;
    });

    if (hasVerb) {
      var lines = message.toString('utf-8').split('\r\n');
      var isSecure = lines[0].indexOf('CONNECT ') === 0;
      var host, port;
      lines.forEach(function (line) {
        if (line.indexOf('Host: ') === 0) {
          var components = line.substring(6).split(':');
          host = components[0];
          port = parseInt(components[1] || (isSecure ? 443: 80));
        }
      });
      var hostWithPort = host + ':' + port;
      destinationHosts[srcPort] = hostWithPort;

      var dstSocket = destinationSockets[srcPort + ':' + hostWithPort];
      if (dstSocket) {
        color.green('Reusing socket', srcPort, '->', hostWithPort);
        dstSocket.write(message, 'binary');
      } else {
        createSocket(srcPort, message, isSecure, host, port);
      }
    } else {
      var hostWithPort = destinationHosts[srcPort];
      if (!hostWithPort) {
        return color.red('No host for', srcPort);
      }
      var dstSocket = destinationSockets[srcPort + ':' + hostWithPort];
      if (dstSocket) {
        color.green('Sending', srcPort, '->', hostWithPort);
        dstSocket.write(message, 'binary');
      } else {
        color.red('Neither HTTP verb nor socket for srcPort', srcPort);
        console.log(destinationHosts);
        console.log(destinationSockets);
      }
    }
  });

  // ws.on('closePort', function (srcPort) {
  //   var hostWithPort = destinationHosts[srcPort];
  //   var dstSocket = destinationSockets[hostWithPort];
  //   delete destinationHosts[srcPort];
  //   delete destinationSockets[hostWithPort];
  //   if (dstSocket) {
  //     color.green('Ending socket:', srcPort);
  //     dstSocket.end();
  //   }
  // });
});
httpServer.on('listening', function () {
  color.green('WS -> HTTP server listening on', config.SERVER_PORT);
});
httpServer.listen(config.SERVER_PORT);

function createSocket(srcPort, message, isSecure, host, port) {
  var ws = httpServer.ws;
  var hostWithPort = host + ':' + port;
  color.green('Creating socket from', srcPort, '->', hostWithPort);

  dstSocket = destinationSockets[srcPort + ':' + hostWithPort] = net.connect(port, host);
  dstSocket.on('connect', function () {
    color.white('[connect]', srcPort, '->', host, port);
    color.green('Connected to', host, ':', port);
    if (isSecure) {
      var connectResponse = new Buffer('HTTP/1.0 200 OK\r\nConnection established\r\n\r\n');
      ws.sendWithPort(srcPort, connectResponse);
    } else {
      dstSocket.write(message, 'binary');
    }
  });
  dstSocket.on('data', function (chunk) {
    color.yellow('Received data', srcPort, '<-', hostWithPort);
    var currentIndex = 0;
    while (chunk.length - currentIndex > 0) {
      var lengthToSend = Math.min(chunk.length - currentIndex, config.DATA_LIMIT);
      var bufferToSend = chunk.slice(currentIndex, currentIndex + lengthToSend);
      currentIndex += lengthToSend;
      ws.sendWithPort(srcPort, bufferToSend);
    }
  });
  dstSocket.on('error', function (e) {
    color.red('Error on', srcPort, '->', host, ':', port, '|', e.message);
    console.log(destinationHosts);
    console.log(destinationSockets);
    // ws.closePort(srcPort);
  });
  dstSocket.on('end', function () {
    color.green('Received FIN packet:', host, ':', port);
    // Send FIN packet to client ASAP.
    // ws.closePort(srcPort);
  });
  dstSocket.on('close', function (hadError) {
    color.green('Closed', host, ':', port);
    color.white('[close]', srcPort, '->', host, port);
    delete destinationHosts[srcPort];
    delete destinationSockets[srcPort + ':' + hostWithPort];
    ws.closePort(srcPort);
  });
}
