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
    color.cyan('Parsed message:', this.buffer.toString());
    this.emit('data', this.buffer);
    this.buffer = null;
  }
}

// Send message to client.
WebSocket.prototype.send = function (message) {
  if (typeof message === 'string') {
    var responseData;
    var payLoadOffset = 2;
    var byteLength = Buffer.byteLength(message);

    // Set payload length.
    if (byteLength <= 125) {
      responseData = new Buffer(byteLength + 2);
      responseData[1] = byteLength;
    } else if (byteLength < Math.pow(2, 16)) {
      responseData = new Buffer(byteLength + 2 + 2);
      responseData[1] = 126;
      responseData.writeUInt16BE(byteLength, payLoadOffset);
      payLoadOffset += 2;
    } else {
      // TODO Implement 64-bit uint length.
      // `largeNum.toString(2)` may be helpful
      // to split into two 32-bit uints.
      throw 'Too long message!';
    }
    // FIN and OPCODE.
    var isFin = true;
    responseData[0] = (isFin ? 0x80 : 0x00) + 0x01;
    // Set payload.
    responseData.write(message, payLoadOffset, byteLength);
    this.socket.write(responseData);
  } else if (message instanceof Buffer) {
    throw 'Supports only String!';
  }
}

// Send data to client.
WebSocket.prototype.write = function (data, encoding) {
  // TODO Check if the socket is writable.
  // TODO Check the best way to send data.
  if (this.socket) {
    this.socket.write(data, encoding);
  }
}

module.exports = WebSocket;
