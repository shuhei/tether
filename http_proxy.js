var net = require('net');

var color = require('./color');

var server = net.createServer();
server.on('connection', function(source) {
  if (!source) {
    return;
  }
  console.log('Connection opened with', source.remoteAddress, source.remotePort);

  var destination;
  var host, port;
  source.on('data', function (chunk) {
    // color.yellow('[req]', chunk.toString());

    if (!destination) {      
      var lines = chunk.toString().split('\r\n');
      var isSecure = lines[0].indexOf('CONNECT ') === 0;
      lines.forEach(function (line) {
        if (line.indexOf('Host: ') === 0) {
          var components = line.substring(6).split(':');
          host = components[0];
          port = parseInt(components[1] || (isSecure ? 443 : 80));
        }
      });
      console.log('[req]', host, port);
      destination = net.createConnection({ port: port, host: host }, function () {
        if (!destination) {
          return;
        }
        console.log('Socket connected with', destination.remoteAddress, destination.remotePort);
        if (isSecure) {
          // TODO Understand these lines.
          // source.pause();
          source.write('HTTP/1.0 200 OK\r\nConnection: close\r\n\r\n');
          // source.resume();
        } else {
          destination.write(chunk, 'binary');
        }
      });
      destination.on('data', function (chunk) {
        // color.blue('[res]', chunk.toString());
        source.write(chunk, 'binary');
      });
      destination.on('error', function (e) {
        color.magenta('[error on destination to ' + host +']', e.message);
        destination && destination.end();
        destination = null;
        source.end();
      });
    } else {
      destination.write(chunk, 'binary');    
    }
  });
  source.on('end', function () {
    console.log('Connection closed.');
    destination && destination.end();
    destination = null;
  });
  source.on('error', function (e) {
    color.red('[error on connection to ' + host + ']', e.message);
    source && source.end();
    destination && destination.end();
  });
});
server.on('listening', function () {
  console.log('WebSocket -> HTTP server listening on 8090.');
});
server.listen(8090);
