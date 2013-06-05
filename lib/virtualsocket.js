var WebSocket = require('./ws');

var UUID_LENGTH = 16;

var DATA = 0;
var CLOSE = 1;
var OPEN = 2;

function upgrade(req, socket, head) {
  var ws = WebSocket.upgrade(req, socket, head);

  ws.sendHeader = function (id, header) {
    var headerBuffer = new Buffer(JSON.stringify(header));
    var buf = new Buffer(1 + UUID_LENGTH + headerBuffer.length);
    buf.writeUInt8(OPEN, 0);
    new Buffer(id, 'hex').copy(buf, 1);
    headerBuffer.copy(buf, 1 + UUID_LENGTH);
    this.send(buf);
  };

  ws.sendData = function (id, data) {
    var buf = new Buffer(1 + UUID_LENGTH + data.length);
    buf.writeUInt8(DATA, 0);
    new Buffer(id, 'hex').copy(buf, 1);
    data.copy(buf, 1 + UUID_LENGTH);
    this.send(buf);
  };

  ws.closeId = function (id) {
    var buf = new Buffer(1 + UUID_LENGTH);
    buf.writeUInt8(CLOSE, 0);
    new Buffer(id, 'hex').copy(buf, 1);
    this.send(buf);
  };

  ws.on('data', function (messageWithPort) {
    var type = messageWithPort.readUInt8(0);
    var id = messageWithPort.slice(1, 1 + UUID_LENGTH).toString('hex');
    if (type === DATA) {
      var message = messageWithPort.slice(1 + UUID_LENGTH);
      this.emit('dataWithId', id, message);
    } else if (type === OPEN) {
      var message = messageWithPort.slice(1 + UUID_LENGTH);
      var json = JSON.parse(message.toString());
      this.emit('headerWithId', id, json);
    } else if (type === CLOSE) {
      this.emit('closeId', id);
    }
  });

  return ws;
}

exports.upgrade = upgrade;
