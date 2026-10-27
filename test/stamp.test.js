const assert = require('assert');
const { stampText } = require('../stamp.js');
assert.strictEqual(stampText(new Date(2026, 9, 28, 8, 5)), '26/10/28 오전 8시');
assert.strictEqual(stampText(new Date(2026, 9, 28, 14, 0)), '26/10/28 오후 2시');
assert.strictEqual(stampText(new Date(2026, 0, 3, 12, 30)), '26/01/03 오후 12시');
assert.strictEqual(stampText(new Date(2027, 11, 31, 0, 1)), '27/12/31 오전 12시');
console.log('stamp ok');
