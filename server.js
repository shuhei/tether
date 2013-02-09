var net = require('net');
var http = require('http');

var WebSocket = require('./lib/ws');
var color = require('./lib/color');

var config = {
  SERVER_PORT: parseInt(process.env.SERVER_PORT || 8090),
  DATA_LIMIT: 10000000
};

var httpServer = http.createServer();
var destinationSockets = {};
httpServer.on('upgrade', function (req, socket, head) {
  var ws = WebSocket.upgrade(req, socket, 'proxy');
  ws.on('data', function (message) {
    var srcPort = message.readUInt16BE(0);
    var srcPortBuffer = new Buffer(2);
    srcPortBuffer.writeUInt16BE(srcPort, 0);
    var messageWithoutPort = message.slice(2);
    var dstSocket = destinationSockets[srcPort];

    if (!dstSocket) {
      var lines = message.toString('utf-8', 2).split('\r\n'); // Ignore the 2 bytes at the head.
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
        console.log('[connect]', srcPort, '->', host, port);
        color.green('Connected to', host, ':', port);
        if (isSecure) {
          var connectResponse = new Buffer('HTTP/1.0 200 OK\r\nConnection established\r\n\r\n');
          ws.send(Buffer.concat([srcPortBuffer, connectResponse]));
        } else {
          dstSocket.write(messageWithoutPort, 'binary');
        }
      });
      dstSocket.on('data', function (chunk) {
        var currentIndex = 0;
        while (chunk.length - currentIndex > 0) {
          var lengthToSend = Math.min(chunk.length - currentIndex, config.DATA_LIMIT);
          var bufferToSend = chunk.slice(currentIndex, currentIndex + lengthToSend);
          currentIndex += lengthToSend;
          var chunkWithPort = Buffer.concat([srcPortBuffer, bufferToSend]);
          ws.send(chunkWithPort);
        }
      });
      dstSocket.on('error', function (e) {
        color.red('Error on', host, ':', port, '|', e.message);
        destinationSockets[srcPort] = null;
        // TODO Send back response
      });
      dstSocket.on('end', function () {
        console.log('[end]', srcPort, '->', host, port);
        color.green('Ended:', host, ':', port);
        destinationSockets[srcPort] = null;
      });
      dstSocket.on('close', function () {
        color.green('Closed', host, ':', port);
      });
    } else {
      dstSocket.write(messageWithoutPort, 'binary');
    }
  });

  httpServer.ws = ws;
});
httpServer.on('listening', function () {
  color.green('WS -> HTTP server listening on', config.SERVER_PORT);
});
httpServer.listen(config.SERVER_PORT);
