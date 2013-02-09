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

function Parser() {
}

Parser.prototype.addData = function (buffer) {
  if (this.buffer) {
    this.buffer = Buffer.concat([this.buffer, buffer]);
  } else {
    this.buffer = buffer;
  }
};

Parser.prototype.parse = function () {
  if (!this.buffer || this.buffer.length === 0) {
    color.cyan('No buffer to parse.');
    return false;
  }
  if (this.buffer.length < 2) {
    color.cyan('Not enough data to parse.');
    return false;
  }

  var firstByte = this.buffer[0];
  var fin = firstByte >>> 7; // 0 for not final, 1 for final
  var opcode = firstByte & 0x0f; // See payloadTypes
  var payloadType = payloadTypes[opcode];
  color.cyan('fin:', fin, 'opcode:', opcode, 'payloadType:', payloadType);

  var secondByte = this.buffer[1];
  var mask = secondByte >>> 7; // 0 for not masked, 1 for masked
  var payloadLength = secondByte & 0x7f;
  var payLoadOffset = 2;
  if (payloadLength === 0x7e) {
    if (this.buffer.length < 2 + 2) {
      color.cyan('Not enough data to parse.');
      return false;
    }
    payloadLength = this.buffer.readUInt16BE(payLoadOffset);
    payLoadOffset += 2;
  } else if (payloadLength === 0x7f) {
    if (this.buffer.length < 2 + 8) {
      color.cyan('Not enough data to parse.');
      return false;
    }
    var first32 = this.buffer.readUInt32BE(payLoadOffset);
    payLoadOffset += 4;
    var second32 = this.buffer.readUInt32BE(payLoadOffset);
    payLoadOffset += 4;
    payloadLength = first32 * Math.pow(2, 32) + second32;
  }

  color.cyan('mask:', mask, 'payloadLength:', payloadLength, 'byteLength:', this.buffer.length, 'payLoadOffset:', payLoadOffset);

  if (this.buffer.length < payloadLength + payLoadOffset + (mask ? 4 : 0)) {
    color.cyan('Not enough data to parse.');
    return false;
  }

  // Read application data.
  // http://tools.ietf.org/html/rfc6455#section-5.3
  var result = new Buffer(payloadLength);
  if (mask) {
    var maskingKey = this.buffer.readUInt32BE(payLoadOffset);
    for (var i = 0; i < payloadLength; i++) {
      var appData = this.buffer.readUInt8(payLoadOffset + 4 + i);
      var mod = i % 4;
      var masking = (maskingKey >>> (3 - mod) * 8) & 0xff;
      var unmasked = appData ^ masking;
      try {
        result.writeUInt8(unmasked, i);
      } catch (e) {
        color.cyan('Error parsing ws:', i, appData, masking, unmasked);
        throw e;
      }
    }
  } else {
    for (var i = 0; i < payloadLength; i++) {
      var appData = this.buffer.readUInt8(payLoadOffset + i);
      result.writeInt8(appData, i);
    }
  }

  if (this.buffer.length === payloadLength + payLoadOffset + 4) {
    this.buffer = null;
  } else {
    this.buffer = this.buffer.slice(payloadLength + payLoadOffset + 4);
  }

  if (payloadType === 'text') {
    color.cyan('Received:', result.toString());
  } else {
    color.cyan('Received:', payloadType);
  }
  return result;
};

function WebSocket(socket) {
  this.socket = socket;
  this.parser = new Parser();
  this.socket.on('data', this.onData.bind(this));
  this.socket.on('end', this.onEnd.bind(this));
  this.socket.on('close', this.onClose.bind(this));
  this.socket.on('timeout', this.onTimeout.bind(this));
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

  this.parser.addData(receivedData);
  var payload;
  while (payload = this.parser.parse()) {
    this.emit('data', payload);
  }
}

WebSocket.prototype.onEnd = function () {
  color.yellow('WebSocket ended.');
};

WebSocket.prototype.onClose = function (hadError) {
  color.yellow('WebSocket closed', hadError ? 'with' : 'without', 'error');
};

WebSocket.prototype.onTimeout = function () {
  color.yellow('WebSocket timeout.');
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
    throw 'Supports only string and binary!';
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
    headerData[1] = 0x7e;
    headerData.writeUInt16BE(byteLength, 2);
  } else if (byteLength < Math.pow(2, 64)) {
    // Buffer doesn't have writeUInt64BE.
    // Split a 64-bit number into two 32-bit numbers.
    var first32 = Math.floor(byteLength / Math.pow(2, 32));
    var second32 = byteLength - first32 * Math.pow(2, 32);

    headerData = new Buffer(2 + 8);
    headerData[1] = 0x7f;
    headerData.writeUInt32BE(first32, 2);
    headerData.writeUInt32BE(second32, 2 + 4);
  } else {
    throw 'Too long data!';
  }
  // FIN and OPCODE.
  var isFin = true;
  headerData[0] = (isFin ? 0x80 : 0x00) + opcode;

  var responseData = Buffer.concat([headerData, bodyData]);
  color.cyan('Sending data:', responseData.length);
  this.socket.write(responseData);
}

module.exports = WebSocket;
