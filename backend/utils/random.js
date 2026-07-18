const crypto = require('crypto');

function pickSide() {
  const buf = crypto.randomBytes(1);
  return buf[0] < 128 ? 'heads' : 'tails';
}

module.exports = { pickSide };
