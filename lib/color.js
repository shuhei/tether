var red   = '\u001b[31m';
var green = '\u001b[32m';
var yellow = '\u001b[33m';
var blue = '\u001b[34m';
var magenta = '\u001b[35m';
var cyan = '\u001b[36m';
var reset = '\u001b[0m';

function logWithColor(color) {
  if (process.env.NODE_DEBUG) {
    return function () {
      var args = Array.prototype.slice.apply(arguments);
      console.log.call(console, color + args.join(' ') + reset);
    };
  } else {
    return function () {};
  }
}

module.exports = {
  red:     logWithColor(red),
  green:   logWithColor(green),
  yellow:  logWithColor(yellow),
  blue:    logWithColor(blue),
  magenta: logWithColor(magenta),
  cyan:    logWithColor(cyan)
}