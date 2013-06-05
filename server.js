var net = require('net');
var http = require('http');

var VirtualSocket = require('./lib/virtualsocket');
var color = require('./lib/color');

var config = {
  SERVER_PORT: parseInt(process.env.SERVER_PORT || 8090),
  DATA_LIMIT: 10000000
};

var httpServer = http.createServer();
var destinationRequests = {};

httpServer.on('upgrade', function (req, socket, head) {
  var ws = httpServer.ws = VirtualSocket.upgrade(req, socket, 'proxy');

  ws.on('headerWithId', function (id, header) {
    color.green(id, 'received request header');
    color.white(header);

    var request = http.request(header);
    destinationRequests[id] = request;
    color.green(id, 'sent request header to', header.hostname);

    request.on('error', function (err) {
      // TODO Retry or do something with Agent.
      // http://qiita.com/items/f4fe9b1573e30d087f16
      color.red(id, 'received request error from', header.hostname);
      color.red(err);
    });

    request.on('response', function (response) {
      ws.sendHeader(id, {
        statusCode: response.statusCode,
        headers: response.headers
      });
      color.green(id, 'received response header');
      color.green(id, 'sent response header');

      response.on('data', function (chunk) {
        color.green(id, 'received response data:', chunk.length);
        var currentIndex = 0;
        while (chunk.length - currentIndex > 0) {
          var lengthToSend = Math.min(chunk.length - currentIndex, config.DATA_LIMIT);
          var bufferToSend = chunk.slice(currentIndex, currentIndex + lengthToSend);
          currentIndex += lengthToSend;
          ws.sendData(id, bufferToSend);
        }
      });

      response.on('end', function () {
        color.green(id, 'received response end');
        ws.closeId(id);
      });

      response.on('error', function () {
        color.red(id, 'received response error');
        // TODO with error?
        ws.closeId(id);
      });
    });
  });

  ws.on('dataWithId', function (id, message) {
    color.green(id, 'received request data');
    var request = destinationRequests[id];
    request.write(message, 'binary');
  });

  ws.on('closeId', function (id) {
    color.green(id, 'received request end');
    var request = destinationRequests[id];
    request.end();

    // TODO delete response from the object.
  });
});
httpServer.on('listening', function () {
  color.green('WS -> HTTP server listening on', config.SERVER_PORT);
});
httpServer.listen(config.SERVER_PORT);

