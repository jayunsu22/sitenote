// 작업자 안내·🚚·후기 문자·업체 부탁 (share.js, 11/5) — 이름·번호·비번은 지어낸 것
const assert = require('assert');
const Share = require('../share.js');
const set = { people: { 마바: { phone: '010-1111-2222' }, 사아: { phone: '010-3333-4444' } }, reviewLink: 'https://example.com/r' };
const site = (o) => Object.assign({ id: 'a', name: '하늘마을', date: '2026-11-06', pwLobby: '#0000', days: [{ date: '2026-11-05', staff: ['사아'] }, { date: '2026-11-06', staff: ['마바', '사아', '김정헌'] }] }, o);
let n = Share.workerNotices([site()], set, '2026-11-05');
assert.deepStrictEqual(n.map((x) => x.name), ['마바'], '오늘도 온 사람·사장님은 빼고');
assert.ok(n[0].text.includes('#0000') && n[0].text.includes('내일 작업 안내'));
assert.ok(n[0].missing.includes('세대 비번') && n[0].missing.includes('필름 번호'));
assert.strictEqual(Share.workerNotices([site({ hide: true })], set, '2026-11-05').length, 0);
assert.strictEqual(Share.workerNotices([site()], set, '2026-11-01').length, 0);
// 🚚
const fv = site({ filmVendor: true, filmStage: 2 });
assert.ok(Share.workerInfoText(fv).includes('업체가 현장으로'));
assert.ok(!Share.workerInfoText(site()).includes('업체가 현장으로'));
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
console.log('notice ok');
