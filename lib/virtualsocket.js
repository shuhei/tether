var WebSocket = require('./ws');

var DATA = 0;
var CLOSE = 1;

function upgrade(req, socket, head) {
  var ws = WebSocket.upgrade(req, socket, head);

  ws.sendWithPort = function (port, data) {
    var buf = new Buffer(1 + 2 + data.length);
    buf.writeUInt8(DATA, 0);
    buf.writeUInt16BE(port, 1);
    data.copy(buf, 1 + 2);
    this.send(buf);
  };
  ws.closePort = function (port) {
    var buf = new Buffer(1 + 2);
    buf.writeUInt8(CLOSE, 0);
    buf.writeUInt16BE(port, 1);
    this.send(buf);
  };
  ws.on('data', function (messageWithPort) {
    var type = messageWithPort.readUInt8(0);
    var port = messageWithPort.readUInt16BE(1);
    if (type === DATA) {
      var message = messageWithPort.slice(1 + 2);
      this.emit('dataWithPort', port, message);
    } else if (type === CLOSE) {
      this.emit('closePort', port);
    }
  });

  return ws;
}

exports.upgrade = upgrade;
