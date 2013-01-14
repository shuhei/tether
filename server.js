var net = require('net');
var http = require('http');

var WebSocket = require('./lib/ws');
var color = require('./lib/color');

var httpServer = http.createServer();
httpServer.on('upgrade', function (req, socket, head) {
  var ws = WebSocket.upgrade(req, socket, 'proxy');
  ws.on('data', function (message) {
    ws.send('Hey, this is WS -> HTTP server.');
    
    // TODO Forward the data to the proxy server.
  });

  httpServer.ws = ws;
});
httpServer.on('listening', function () {
  color.green('WS -> HTTP server listening on 8090.');
});
httpServer.listen(8090);
