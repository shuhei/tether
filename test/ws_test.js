var events = require('events');
var util = require('util');
var chai = require('chai');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
chai.should();
chai.use(sinonChai);

var WebSocket = require('../lib/ws');

function repeatString(str, count) {
  var result = '';
  for (var i = 0; i < count; i++) {
    result += str;
  }
  return result;
}

function MockSocket() {}
util.inherits(MockSocket, events.EventEmitter);
MockSocket.prototype.write = function () {};

describe('MockSocket', function () {
  it('emits an event', function () {
    var socket = new MockSocket();
    var callback = sinon.spy();
    socket.on('data', callback);
    socket.emit('data', 'hello');
    callback.should.have.been.calledWith('hello');
  });
});

describe('WebSocket', function () {
  var mockSocket;
  beforeEach(function () {
    mockSocket = new MockSocket();
    sinon.spy(mockSocket, 'write');
  });

  describe('upgrade', function () {
    it('returns upgrade response', function () {
      var mockReq = {
        headers: { 'sec-websocket-key': 'test' }
      };
      var ws = WebSocket.upgrade(mockReq, mockSocket, 'test');

      var expectedResponse = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Accept: tNpbgC8ZQDOcSkHAWopKzQjJ1hI=',
        'Sec-Websocket-Protocol: test',
        '',
        ''
      ].join('\r\n');
      mockSocket.write.should.have.been.calledWith(expectedResponse);
    });
  });

  describe('send', function () {
    var ws;
    beforeEach(function () {
      ws = new WebSocket(mockSocket);
    });

    it('sends payload shorter than 126', function () {
      ws.send('Hello, World!');

      var actual = mockSocket.write.getCall(0).args[0];
      actual[0].should.equal(0x81);
      actual[1].should.equal(13);
      actual.toString('utf-8', 2).should.equal('Hello, World!');
    });

    it('sends UTF-8 payload', function () {
      ws.send('こんにちは、世界！');

      var actual = mockSocket.write.getCall(0).args[0];
      actual[0].should.equal(0x81);
      actual[1].should.equal(27);
      actual.toString('utf-8', 2).should.equal('こんにちは、世界！');
    });

    it('sends payload longer than 125 and shorter than 2^16', function () {
      var message = repeatString('abcdefghijklmnopqrstuvwxyz', 5);
      ws.send(message);

      var actual = mockSocket.write.getCall(0).args[0];
      actual.length.should.equal(130 + 2 + 2);
      actual[0].should.equal(0x81);
      actual[1].should.equal(126);
      actual.readUInt16BE(2).should.equal(130);
      actual.toString('utf-8', 2 + 2).should.equal(message);
    });

    it('throws error for payload longer than or equal to 2^16', function () {
      var message = repeatString('abcdefghijklmnopqrstuvwxyz', 2521);
      ws.send.bind(ws, message).should.throw();
    });
  });

  describe('data event', function () {
    it('receives data', function () {
      var ws = new WebSocket(mockSocket);
      var callback = sinon.spy();
      ws.on('data', callback);

      var data = new Buffer(2 + 4 + 5);
      data[0] = 0x81; // FIN and OPCODE
      data[1] = 0x80 + 5; // Mask flag and payload length
      // TODO Mask with some key!
      data.writeUInt32BE(0x00000000, 2); // Masking key
      data.write('hello', 2 + 4);
      mockSocket.emit('data', data);

      callback.should.have.been.calledOnce;
      callback.getCall(0).args[0].should.deep.equal(new Buffer('hello'));
    });
  });
});
