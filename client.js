var http = require('http');
var net = require('net');
var fs = require('fs');

var WebSocket = require('./lib/ws');
var color = require('./lib/color');

var httpServer = http.createServer();
httpServer.on('request', function (req, res) {
  fs.readFile('public/index.html', 'utf-8', function (err, data) {
    if (err) {
      color.red('[Failed to read file]', err);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});
httpServer.on('upgrade', function (req, socket, head) {
  var ws = WebSocket.upgrade(req, socket, 'test');
  ws.on('data', function (data) {
    var port = data.readUInt16BE(0);
    var dataWithoutPort = data.slice(2);
    var proxySocket = proxySockets[port];
    color.green('Sending response data:', dataWithoutPort.length);
    proxySocket && proxySocket.write(dataWithoutPort, 'binary');
  });

  httpServer.ws = ws;
  color.green('Upgraded');
});
httpServer.on('listening', function () {
  color.green('HTTP & WebSocket server listening on 8080.');
});
httpServer.listen(8080);

// HTTP Proxy server on local
var proxyServer = net.createServer();
var proxySockets = {};
proxyServer.on('connection', function(socket) {
  color.magenta('Socket opened with', socket.remoteAddress, socket.remotePort);
  var port = socket.remotePort;
  proxySockets[port] = socket;
  var portBuffer = new Buffer(2);
  portBuffer.writeUInt16BE(port, 0);

  socket.on('data', function (data) {
    color.magenta('Received request data');
    color.magenta(data.toString());
    if (httpServer.ws) {
      // Send data with port number.
      var dataWithPort = Buffer.concat([portBuffer, data]);
      httpServer.ws.send(dataWithPort);
    }
  });
  socket.on('close', function () {
    color.magenta('Socket closed.');
  });
  socket.on('end', function () {
    color.magenta('Socket ended.');
    proxySockets[port] = null;
  });
  socket.on('error', function (e) {
    color.magenta('Error:', e.message);
  });
});
proxyServer.on('listening', function () {
  color.magenta('HTTP proxy server listening on 8124.');
});
proxyServer.listen(8124);

