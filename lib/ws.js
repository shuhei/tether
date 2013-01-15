var util = require('util');
var events = require('events');
var crypto = require('crypto');

var color = require('./color');

var payloadTypes = {
  0x0: 'continueation',
  0x1: 'text',
  0x2: 'binary',
  0x8: 'connection close',
  0x9: 'ping',
  0xA: 'pong'
};

function WebSocket(socket) {
  this.socket = socket;
  this.socket.on('data', this.onData.bind(this));
}
util.inherits(WebSocket, events.EventEmitter);

WebSocket.upgrade = function (req, socket, protocol) {
  var key = req.headers['sec-websocket-key'];
  color.cyan('Upgraded with key:', key);
  key = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  var headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + key,
    'Sec-Websocket-Protocol: ' + protocol,
    '',
    ''
  ].join('\r\n');
  socket.write(headers);
  return new WebSocket(socket);
};

WebSocket.prototype.onData = function (receivedData) {
  color.cyan('Received data from browser.');
  // Parse message from client.
  var firstByte = receivedData[0];
  var fin = firstByte >>> 7; // 0 for not final, 1 for final
  var opcode = firstByte & 0x0f; // See payloadTypes
  var payloadType = payloadTypes[opcode];
  color.cyan('fin:', fin, 'opcode:', opcode, 'payloadType:', payloadType);

  var secondByte = receivedData[1];
  var mask = secondByte >>> 7; // 0 for not masked, 1 for masked
  var payloadLength = secondByte & 0x7f;
  var payLoadOffset = 2;
  if (payloadLength === 0x7e) {
    payloadLength = receivedData.readUInt16BE(payLoadOffset);
    payLoadOffset += 2;
  } else if (payloadLength === 0x7f) {
    payloadLength = receivedData.readUInt64BE(payLoadOffset);
    payLoadOffset += 8;
  }
  color.cyan('mask:', mask, 'payloadLength:', payloadLength);

  if (!this.buffer) {
    this.buffer = new Buffer(payloadLength);
  }

  // Read application data.
  // http://tools.ietf.org/html/rfc6455#section-5.3
  if (mask) {
    var maskingKey = receivedData.readUInt32BE(payLoadOffset);
    for (var i = 0; i < payloadLength; i++) {
      var appData = receivedData.readUInt8(payLoadOffset + 4 + i);
      var mod = i % 4;
      var masking = (maskingKey >>> (3 - mod) * 8) & 0xff;
      var unmasked = appData ^ masking;
      try {
        this.buffer.writeUInt8(unmasked, i);
      } catch (e) {
        color.cyan('Error parsing ws:', i, appData, masking, unmasked);
        throw e;
      }
    }
  } else {
    for (var i = 0; i < payloadLength; i++) {
      var appData = receivedData.readUInt8(payLoadOffset + i);
      this.buffer.writeInt8(appData, i);
    }
  }
  if (fin) {
    if (payloadType === 'text') {
      color.cyan('Received:', this.buffer.toString());
    } else {
      color.cyan('Received', payloadType)
    }
    this.emit('data', this.buffer);
    this.buffer = null;
  }
}

// Send message to client.
WebSocket.prototype.send = function (data) {
  var opcode, bodyData;
  if (typeof data === 'string') {
    opcode = 0x1;
    bodyData = new Buffer(data);
  } else if (Buffer.isBuffer(data)) {
    opcode = 0x2;
    bodyData = data;
  } else {
    throw 'Supports only String!';
  }
  var byteLength = bodyData.length;

  var headerData;
  var payLoadOffset = 2;

  // Set payload length.
  if (byteLength <= 125) {
    headerData = new Buffer(2);
    headerData[1] = byteLength;
  } else if (byteLength < Math.pow(2, 16)) {
    headerData = new Buffer(2 + 2);
    headerData[1] = 126;
    headerData.writeUInt16BE(byteLength, 2);
  } else {
    // TODO Implement 64-bit uint length.
    // `largeNum.toString(2)` may be helpful
    // to split into two 32-bit uints.
    throw 'Too long data!';
  }
  // FIN and OPCODE.
  var isFin = true;
  headerData[0] = (isFin ? 0x80 : 0x00) + opcode;

  var responseData = Buffer.concat([headerData, bodyData]);
  this.socket.write(responseData);
}

module.exports = WebSocket;
