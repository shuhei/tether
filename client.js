var http = require('http');
var net = require('net');
var fs = require('fs');

var WebSocket = require('./lib/ws');
var color = require('./lib/color');

var config = {
  CLIENT_PORT: parseInt(process.env.LOCAL_PORT || 8080),
  SERVER_HOST: process.env.SERVER_HOST || 'localhost',
  SERVER_PORT: parseInt(process.env.SERVER_PORT || 8090),
  PROXY_PORT: parseInt(process.env.PROXY_PORT || 8124)
};

var httpServer = http.createServer();
httpServer.on('request', function (req, res) {
  fs.readFile('public/index.html', 'utf-8', function (err, data) {
    if (err) {
      color.red('[Failed to read file]', err);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    var replaced = data;
    for (var k in config) {
      var before = new RegExp('#\{' + k + '\}', 'g');
      var after = config[k];
      replaced = replaced.replace(before, after);
    }
    console.log(replaced);
    res.end(replaced);
  });
});
httpServer.on('upgrade', function (req, socket, head) {
  var ws = WebSocket.upgrade(req, socket, 'proxy');
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
  color.green('HTTP & WebSocket server listening on', config.CLIENT_PORT);
});
httpServer.listen(config.CLIENT_PORT);

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
    color.magenta('Received request data:', data.length);
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
  color.magenta('HTTP proxy server listening on', config.PROXY_PORT);
});
proxyServer.listen(config.PROXY_PORT);

