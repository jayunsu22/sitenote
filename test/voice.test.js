// node test/voice.test.js — 🎤 음성 입력의 숫자 바꾸기 (화면 없는 부분)
const assert = require('assert');
const V = require('../voice.js');
assert.strictEqual(V.toDigits('공일공 일이삼사 오육칠팔', true), '01012345678');
assert.strictEqual(V.toDigits('010-1234-5678', true), '010-1234-5678');
assert.strictEqual(V.toDigits('3만 5천'), '35000');
assert.strictEqual(V.toDigits('12만원'), '120000');
assert.strictEqual(V.toDigits('150000'), '150000');
assert.strictEqual(V.toDigits('2.5'), '2.5');
console.log('voice ok');
