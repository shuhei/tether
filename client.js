var http = require('http');
var net = require('net');
var fs = require('fs');

var VirtualSocket = require('./lib/virtualsocket');
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
    res.end(replaced);
  });
});
httpServer.on('upgrade', function (req, socket, head) {
  var ws = VirtualSocket.upgrade(req, socket, 'proxy');

  ws.on('dataWithPort', function (port, data) {
    var proxySocket = proxySockets[port];
    color.green('Sending response data:', data.length);
    proxySocket && proxySocket.write(data, 'binary');
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
  color.white('[connect]', socket.remotePort);
  var port = socket.remotePort;
  proxySockets[port] = socket;

  socket.on('data', function (data) {
    color.magenta('Received request data:', data.length);
    if (httpServer.ws) {
      httpServer.ws.sendWithPort(port, data);
    }
  });
  socket.on('close', function () {
    color.magenta('Socket closed.');
  });
  socket.on('end', function () {
    color.magenta('Socket ended.');
    proxySockets[port] = null;
    color.white('[end]', port);
  });
  socket.on('error', function (e) {
    color.magenta('Error:', e.message);
  });
});
proxyServer.on('listening', function () {
  color.magenta('HTTP proxy server listening on', config.PROXY_PORT);
});
proxyServer.listen(config.PROXY_PORT);

