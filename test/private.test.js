// 👤 개인고객 (share.js) — 이름·번호는 지어낸 것
const assert = require('assert');
const Share = require('../share.js');
assert.ok(Share.isPrivateClient({ name: '개인 고객' }));
assert.ok(!Share.isPrivateClient({ name: '가나디자인' }));
assert.ok(!Share.isPrivateClient(null));

const s = (o) => Object.assign({ id: 'a', name: '하늘마을 305호', date: '2026-11-01', days: [{ date: '2026-11-01', staff: [] }, { date: '2026-11-02', staff: [] }], owners: [{ name: '이다라', role: '고객', phone: '010-0000-0002' }] }, o);
assert.deepStrictEqual(Share.privateCustomer(s()).name, '이다라');
assert.strictEqual(Share.privateCustomer({ owners: [] }).name, '');

// 끝남 = 시공 지남 + 잔금 받음
assert.strictEqual(Share.privateDone(s({ payDone: '2026-11-03' }), '2026-11-04'), true);
assert.strictEqual(Share.privateDone(s(), '2026-11-04'), false, '잔금을 안 받으면 계속 진행');
assert.strictEqual(Share.privateDone(s({ payDone: '2026-11-01' }), '2026-11-02'), false, '마지막 날은 아직 진행');
assert.strictEqual(Share.privateDone(s({ settleLog: { x: { 입금일: '2026-11-03' } } }), '2026-11-04'), true);
assert.strictEqual(Share.privateDone(s({ days: [], date: '' }), '2026-11-04'), false, '날짜 미정은 진행');

// 찾기
assert.ok(Share.privateMatch(s(), '이다라'));
assert.ok(Share.privateMatch(s(), '하늘 305'));
assert.ok(Share.privateMatch(s(), '0000-0002'));
assert.ok(Share.privateMatch(s(), '01000000002'));
assert.ok(!Share.privateMatch(s(), '푸른숲'));
assert.ok(!Share.privateMatch(s({ owners: [] }), '이다라'));

// 전에 시공한 번호
const list = [s({ id: 'a', date: '2026-03-01' }), s({ id: 'b', date: '2026-10-01' }), s({ id: 'c', owners: [{ name: '남', phone: '010-1111-1111' }] })];
assert.deepStrictEqual(Share.sitesByPhone(list, '01000000002').map((x) => x.id), ['b', 'a']);
assert.deepStrictEqual(Share.sitesByPhone(list, '010 0000 0002', 'b').map((x) => x.id), ['a']);
assert.deepStrictEqual(Share.sitesByPhone(list, '010').map((x) => x.id), [], '번호가 덜 적히면 안 찾음');
console.log('private ok');
// 업체에 빈칸 묻기: 빈칸 + 안 답한 확인 질문
const items = Share.siteAskItems({ pwLobby: '1', films: [{ code: 'ps1' }], checks: { door: { v: '안 닿음' } }, askOn: { pwLobby: 1, pwUnit: 1, toilet: 1, films: 1, door: 1, overlap: 1, off: 1 } }, { checks: [{ id: 'door', text: '문', ok: false }, { id: 'overlap', text: '공정', ok: false }, { id: 'xmark', text: 'X', ok: true }, { id: 'off', text: '끔', off: true }] });
assert.deepStrictEqual(items.missing, ['pwUnit', 'toilet']);
assert.deepStrictEqual(items.checks.map((c) => c.id), ['overlap']);
assert.deepStrictEqual(Share.siteAskItems({ films: [] }, {}), { missing: [], checks: [] }, '11/13: 기본은 이 현장은 안 물음');
assert.deepStrictEqual(Share.siteAskItems({ films: [], askOn: { pwLobby: 1, pwUnit: 1, toilet: 1, films: 1, door: 1, overlap: 1, xmark: 1, off: 1 } }, {}).missing, ['pwLobby', 'pwUnit', 'toilet', 'films']);
assert.ok(Share.siteAskItems({ films: [], askOn: { pwLobby: 1, pwUnit: 1, toilet: 1, films: 1, door: 1, overlap: 1, xmark: 1, off: 1 } }, {}).checks.length > 0, '설정이 없으면 기본 질문');
