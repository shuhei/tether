var net = require('net');
var http = require('http');

var VirtualSocket = require('./lib/virtualsocket');
var color = require('./lib/color');

var config = {
  SERVER_PORT: parseInt(process.env.SERVER_PORT || 8090),
  DATA_LIMIT: 10000000
};

var httpServer = http.createServer();
var destinationSockets = {};
httpServer.on('upgrade', function (req, socket, head) {
  var ws = VirtualSocket.upgrade(req, socket, 'proxy');

  ws.on('dataWithPort', function (srcPort, message) {
    var dstSocket = destinationSockets[srcPort];

    if (!dstSocket) {
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

      color.green('Request is for', host, ':', port);
      dstSocket = destinationSockets[srcPort] = net.connect(port, host);
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
        var currentIndex = 0;
        while (chunk.length - currentIndex > 0) {
          var lengthToSend = Math.min(chunk.length - currentIndex, config.DATA_LIMIT);
          var bufferToSend = chunk.slice(currentIndex, currentIndex + lengthToSend);
          currentIndex += lengthToSend;
          ws.sendWithPort(srcPort, bufferToSend);
        }
      });
      dstSocket.on('error', function (e) {
        color.red('Error on', host, ':', port, '|', e.message);
        destinationSockets[srcPort] = null;
        ws.closePort(srcPort);
      });
      dstSocket.on('end', function () {
        color.green('Received FIN packet:', host, ':', port);
        destinationSockets[srcPort] = null;
        // Send FIN packet to client ASAP.
        ws.closePort(srcPort);
      });
      dstSocket.on('close', function (hadError) {
        color.green('Closed', host, ':', port);
        color.white('[close]', srcPort, '->', host, port);
      });
    } else {
      dstSocket.write(message, 'binary');
    }
  });

  ws.on('closePort', function (port) {
    var dstSocket = destinationSockets[port];
    if (dstSocket) {
      color.green('Ending socket:', port);
      dstSocket.end();
    }
  });

  httpServer.ws = ws;
});
httpServer.on('listening', function () {
  color.green('WS -> HTTP server listening on', config.SERVER_PORT);
});
httpServer.listen(config.SERVER_PORT);
