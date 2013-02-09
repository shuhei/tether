var http = require('http');

var path = process.argv[2] || 'http://shuheikagawa.com';
var host = path.split('/')[2];
console.log(path, host);

var options = {
  host: 'localhost',
  // host: host,
  port: 8124,
  path: path,
  headers: { Host: host }
};
var isError = false;
var req = http.get(options, function (res) {
  // console.log(res);
  // res.pipe(process.stdout);
  var buffer = "";
  res.setEncoding('utf-8');
  res.on('data', function (data) {
    buffer += data;
  });
  res.on('end', function () {
    if (!isError)
      console.log(buffer);
  });
});
req.on('error', function (e) {
  console.log('---------- Error ----------');
  console.log(e.message);
  console.log(e.stack);
  isError = true;
});