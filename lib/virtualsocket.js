var WebSocket = require('./ws');

function upgrade(req, socket, head) {
  var ws = WebSocket.upgrade(req, socket, head);

  ws.sendWithPort = function (port, data) {
    var buf = new Buffer(2 + data.length);
    buf.writeUInt16BE(port, 0);
    data.copy(buf, 2);
    this.send(buf);
  };
  ws.on('data', function (messageWithPort) {
    var port = messageWithPort.readUInt16BE(0);
    var message = messageWithPort.slice(2);
    this.emit('dataWithPort', port, message);
  });

  return ws;
}

exports.upgrade = upgrade;
