var http = require('http');
var fs = require('fs');
var uuid = require('node-uuid');
var url = require('url');

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
  httpServer.ws = ws;
  color.green('Upgraded');

  ws.on('headerWithId', function (id, header) {
    color.green(id, 'received response header');
    var response = proxyResponses[id];
    response.writeHead(header.statusCode, header.headers);
  });

  ws.on('dataWithId', function (id, data) {
    color.green(id, 'received response data:', data.length);
    var response = proxyResponses[id];
    response.write(data, 'binary');
  });

  ws.on('closeId', function (id) {
    color.green(id, 'received response end');
    var response = proxyResponses[id];
    response.end();
  });
});

httpServer.on('listening', function () {
  color.green('HTTP & WebSocket server listening on', config.CLIENT_PORT);
});

httpServer.listen(config.CLIENT_PORT);


// HTTP Proxy server on local
var proxyServer = http.createServer();
var proxyResponses = {};

proxyServer.on('request', function(request, response) {
  var id = generateUUID();
  proxyResponses[id] = response;

  var parsed = url.parse(request.url);
  var options = {
    hostname: request.headers.host,
    port: parsed.port || 80,
    path: parsed.path + (parsed.hash || ''),
    method: request.method,
    headers: request.headers
  };
  httpServer.ws.sendHeader(id, options);

  color.magenta(id, 'received request header');
  color.magenta(id, 'sent request header');

  request.on('data', function (data) {
    color.magenta(id, 'received request data:', data.length);
    httpServer.ws.sendData(id, data);
  });

  request.on('end', function () {
    color.magenta(id, 'received request end');
    httpServer.ws.closeId(id);
  });
});

proxyServer.on('listening', function () {
  color.magenta('HTTP proxy server listening on', config.PROXY_PORT);
});

proxyServer.on('connect', function (request, socket) {
  var id = generateUUID();
  // TODO Does this work? Even if so, it's confusing...
  proxyResponses[id] = socket;

  var parsed = url.parse(request.url);
  var options = {
    port: parsed.port || 443,
    host: request.headers.host,
    method: request.method
  };
  httpServer.ws.sendHeader(id, options);

  socket.on('data', function (data) {
    color.blue(id, 'received socket data:', data.length);
    httpServer.ws.sendData(id, data);
  });

  socket.on('end', function () {
    color.blue(id, 'received socket end');
    httpServer.ws.closeId(id);
  });

  socket.on('error', function () {
    color.red(id, 'received socket error');
    httpServer.ws.closeId(id);
  });
});

/*
proxyServer.on('upgrade', function () {
  // TODO Do something 
});
*/

proxyServer.listen(config.PROXY_PORT);

function generateUUID() {
  return uuid.v4().replace(/-/g, '');
}
