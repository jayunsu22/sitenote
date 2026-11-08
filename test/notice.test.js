// 작업자 안내·🚚·후기 문자·업체 부탁 (share.js, 11/5) — 이름·번호·비번은 지어낸 것
const assert = require('assert');
const Share = require('../share.js');
const set = { people: { 마바: { phone: '010-1111-2222' }, 사아: { phone: '010-3333-4444' } }, reviewLink: 'https://example.com/r' };
const site = (o) => Object.assign({ id: 'a', name: '하늘마을', date: '2026-11-06', pwLobby: '#0000', days: [{ date: '2026-11-05', staff: ['사아'] }, { date: '2026-11-06', staff: ['마바', '사아', '김정헌'] }] }, o);
let n = Share.workerNotices([site()], set, '2026-11-05');
assert.deepStrictEqual(n.map((x) => x.name), ['마바'], '오늘도 온 사람·사장님은 빼고');
assert.ok(n[0].text.includes('#0000') && n[0].text.includes('내일 작업 안내'));
assert.ok(n[0].missing.includes('세대 비번') && !n[0].missing.includes('필름 번호'), '필름은 묻지 않는다 (11/8)');
// 출입정보만: 필름 번호·현장사진 링크·🚚 줄은 안 보낸다 (사장님 11/8)
const rich = site({ films: [{ place: '방문', code: 'PW0000' }], photoUrl: 'https://example.com/p', filmVendor: true, toilet: '1층' });
const rt = Share.workerNotices([rich], set, '2026-11-05')[0].text;
assert.ok(!rt.includes('PW0000') && !rt.includes('example.com/p') && !rt.includes('업체가 현장으로'), rt);
assert.ok(rt.includes('#0000') && rt.includes('1층'));
// 🚗 픽업: 그날 픽업한 사람은 문자 없이 pickup 표시만, 다른 날·다른 사람은 그대로
const pk = site(Share.pickupPatch(site(), '2026-11-06', '마바', true));
assert.deepStrictEqual(pk.pickup, { '2026-11-06': ['마바'] });
let pn = Share.workerNotices([pk], set, '2026-11-05');
assert.deepStrictEqual(pn.map((x) => [x.name, !!x.pickup, x.text]), [['마바', true, '']]);
assert.deepStrictEqual(Share.pickupOf(pk, '2026-11-05'), []);
assert.deepStrictEqual(Share.pickupPatch(pk, '2026-11-06', '마바', false), { pickup: {} });
assert.deepStrictEqual(Share.pickupPatch(pk, '2026-11-06', '마바', true).pickup['2026-11-06'], ['마바'], '두 번 넣지 않는다');
assert.strictEqual(Share.workerNotices([site({ hide: true })], set, '2026-11-05').length, 0);
assert.strictEqual(Share.workerNotices([site()], set, '2026-11-01').length, 0);
// 🚚
const fv = site({ filmVendor: true, filmStage: 2 });
assert.deepStrictEqual(Share.filmVendorPatch(site({ filmStage: 1 }), true), { filmVendor: true, filmStage: 2 });
assert.deepStrictEqual(Share.filmVendorPatch(site({ filmStage: 3 }), true), { filmVendor: true, filmStage: 3 });
assert.deepStrictEqual(Share.filmVendorPatch(fv, false), { filmVendor: false, filmStage: 1 });
// 표시한 현장은 주문 알림·결재함에 안 뜸
let rep = Share.dailyReport([Object.assign(site({ date: '2026-11-07' }), Share.filmVendorPatch(site({ date: '2026-11-07' }), true))], {}, [], '2026-11-05');
assert.ok(!rep.next.some((x) => x.kind === 'film'));
// 후기 문자: 시공 끝 +2일 아침, 개인고객만
const cust = { id: 'c', name: '구름', date: '2026-11-04', days: [{ date: '2026-11-04', staff: [] }], source: '블로그', owners: [{ name: '이다라', role: '고객', phone: '010-5555-6666' }] };
rep = Share.dailyReport([cust], set, [], '2026-11-05');
assert.deepStrictEqual(rep.next.filter((x) => x.kind === 'review').map((x) => [x.id, x.act]), [['review:c', 'review']]);
assert.strictEqual(Share.dailyReport([cust], set, [], '2026-11-06').next.filter((x) => x.kind === 'review').length, 0);
assert.strictEqual(Share.dailyReport([Object.assign({}, cust, { source: '', owners: [{ name: '업체', phone: '010-5555-6666' }] })], set, [], '2026-11-05').next.filter((x) => x.kind === 'review').length, 0);
assert.ok(Share.reviewSms(cust, set).includes('이다라님') && Share.reviewSms(cust, set).includes('https://example.com/r'));
assert.ok(!Share.reviewSms(cust, {}).includes('http'));
// 업체 부탁: 끝낼 때까지 날마다
const task = { id: 't', title: '계산서 발행', date: '2026-11-01', fromVendor: true, done: false };
assert.ok(Share.dailyReport([], {}, [task], '2026-11-05').next.some((x) => x.id === 'task:t'));
assert.ok(!Share.dailyReport([], {}, [Object.assign({}, task, { done: true })], '2026-11-05').next.some((x) => x.id === 'task:t'));
assert.ok(!Share.dailyReport([], {}, [Object.assign({}, task, { fromVendor: false })], '2026-11-05').next.some((x) => x.id === 'task:t'));
// 👋 안부 인사
const cl = (o) => Object.assign({ id: 'c1', name: '가나인테리어', contacts: [{ name: '가실장', phone: '010-1111-2222' }] }, o);
const st = (d, o) => Object.assign({ id: 's' + d, clientId: 'c1', name: '하늘', date: d, days: [{ date: d, staff: [] }] }, o);
const T = '2026-11-09';
let h = Share.helloList([st('2026-10-20')], [cl()], T);
assert.deepStrictEqual(h.map((x) => [x.name, x.who, x.days, x.phone]), [['가나인테리어', '가실장', 20, '01011112222']]);
assert.strictEqual(Share.helloList([st('2026-10-30')], [cl()], T).length, 0, '2주 안 됨');
assert.strictEqual(Share.helloList([st('2026-10-20'), st('2026-11-20')], [cl()], T).length, 0, '잡힌 현장 있음');
assert.strictEqual(Share.helloList([st('2026-10-20')], [cl({ helloOff: true })], T).length, 0);
assert.strictEqual(Share.helloList([st('2026-10-20')], [cl({ name: '개인고객' })], T).length, 0);
assert.strictEqual(Share.helloList([], [cl()], T).length, 0, '현장이 없던 업체');
assert.strictEqual(Share.helloList([st('2026-10-20')], [cl({ helloAt: '2026-10-20' })], T).length, 0, '보내고 4주 안');
assert.strictEqual(Share.helloList([st('2026-10-01')], [cl({ helloAt: '2026-10-05' })], T).length, 1, '4주 지나면 다시');
assert.ok(Share.helloText(Share.HELLO_TEXT, h[0]).startsWith('안녕하세요 가실장님'));
// 월요일 보고서에만
assert.ok(Share.dailyReport([], {}, [], '2026-11-09').next.some((x) => x.kind === 'hello'));
assert.ok(!Share.dailyReport([], {}, [], '2026-11-10').next.some((x) => x.kind === 'hello'));
console.log('notice ok');

// 결재함 카드가 앱 기록으로 이미 끝났는가 (11/5)
(function () {
  const D = Share.reportItemDone;
  const base = { id: 's1', name: '현장', date: '2026-11-07', days: [{ date: '2026-11-07', staff: ['가'] }], needStaff: 1 };
  const film = { id: 'film:s1', kind: 'film', siteId: 's1' };
  assert.strictEqual(D(film, '2026-11-05', [Object.assign({}, base, { filmStage: 1 })], {}, []), false, '필름 주문 전');
  assert.strictEqual(D(film, '2026-11-05', [Object.assign({}, base, { filmStage: 2 })], {}, []), true, '필름 주문 후');
  const ask = { id: 'ask:s1', kind: 'ask', siteId: 's1' };
  assert.strictEqual(D(ask, '2026-11-05', [Object.assign({}, base, { pwLobby: '1', pwUnit: '2' })], {}, []), false, '화장실 빈칸');
  assert.strictEqual(D(ask, '2026-11-05', [Object.assign({}, base, { pwLobby: '1', pwUnit: '2', toilet: '실내' })], {}, []), true, '다 채움');
  const pay = { id: 'pay:s1', kind: 'pay', siteId: 's1' };
  assert.strictEqual(D(pay, '2026-11-05', [base], {}, []), false);
  assert.strictEqual(D(pay, '2026-11-05', [Object.assign({}, base, { payDone: '2026-11-05' })], {}, []), true);
  const task = { id: 'task:t1', kind: 'task', siteId: '' };
  assert.strictEqual(D(task, '2026-11-05', [], {}, [{ id: 't1', done: false }]), false);
  assert.strictEqual(D(task, '2026-11-05', [], {}, [{ id: 't1', done: true }]), true);
  assert.strictEqual(D({ id: 'as:s1:v1', kind: 'as', siteId: 's1' }, '2026-11-05', [Object.assign({}, base, { services: [{ id: 'v1', date: '2026-11-05', done: true }] })], {}, []), true);
  assert.strictEqual(D({ id: 'review:s1', kind: 'review', siteId: 's1' }, '2026-11-05', [base], {}, []), false, '후기는 사람이 정함');
  assert.strictEqual(D({ id: 'hello:x', kind: 'hello' }, '2026-11-05', [base], {}, []), false, '안부도 사람이 정함');
  console.log('reportItemDone ok');
})();
