var net = require('net');
var http = require('http');

var WebSocket = require('./lib/ws');
var color = require('./lib/color');

var config = {
  SERVER_PORT: parseInt(process.env.SERVER_PORT || 8090)
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
        color.green('Connected to', host, ':', port);
        if (isSecure) {
          // ws.send('HTTP/1.0 200 OK\r\nConnection: close\r\n\r\n');
          var connectResponse = new Buffer('HTTP/1.0 200 OK\r\nConnection established\r\n\r\n');
          ws.send(Buffer.concat([srcPortBuffer, connectResponse]));
        } else {
          dstSocket.write(messageWithoutPort, 'binary');
        }
      });
      dstSocket.on('data', function (chunk) {
        // console.log(chunk.toString());
        var chunkWithPort = Buffer.concat([srcPortBuffer, chunk]);
        ws.send(chunkWithPort);
      });
      dstSocket.on('error', function (e) {
        color.red('Error on', host, ':', port, '|', e.message);
        destinationSockets[srcPort] = null;
        // TODO Review this flow.
      });
      dstSocket.on('end', function () {
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
