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
  ws.on('data', function (message) {
    ws.send('Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message.Hey, I got your message. Hey, I got your message.');

    // TODO Forward the data to the proxy server.
  });

  httpServer.ws = ws;
});
httpServer.on('listening', function () {
  color.green('HTTP & WebSocket server listening on 8080.');
});
httpServer.listen(8080);

// HTTP Proxy server on local
var proxyServer = net.createServer();
proxyServer.on('connection', function(connection) {
  if (!connection) {
    return;
  }
  color.magenta('Connection opened with', connection.remoteAddress, connection.remotePort);

  connection.on('data', function (chunk) {
    if (httpServer.ws) {
      httpServer.ws.write(chunk, 'binary');
    }
  });
  connection.on('end', function () {
    color.magenta('Connection closed.');
  });
  connection.on('error', function (e) {
    color.magenta('[error on connection to ' + host + ']', e.message);
    connection && connection.end();
  });
});
proxyServer.on('listening', function () {
  color.magenta('HTTP proxy server listening on 8124.');
});
proxyServer.listen(8124);

