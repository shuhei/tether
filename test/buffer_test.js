require('chai').should();

var a = new Buffer('Hello, World!');
var b = new Buffer('Hello, World!');

describe('Buffer', function () {
  it('is not equal to another buffer', function () {
    a.should.not.equal(b);
  });

  it('is deeply equal to another buffer', function () {
    a.should.deep.equal(b);
  });
});