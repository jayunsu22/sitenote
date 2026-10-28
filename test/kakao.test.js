// 카톡 정리 (kakao.js) — 붙여넣은 카톡 글 읽기 · 이미 읽은 메시지 거르기 · 필름 반영 · 빈 날
const assert = require('assert');
const K = require('../kakao.js');
// PC 카톡 복사
const pc = `--------------- 2026년 10월 28일 화요일 ---------------
[pk디자인 대리] [오전 9:12] 세대비번 1902*0427이에요
[pk디자인 대리] [오전 9:15] 화장실은 지하1층
관리실 옆 쓰시면 돼요
[섬세한손길] [오전 9:16] 넵
[pk디자인 대리] [오전 9:20] 사진`;
let m = K.parse(pc, '2026-10-01');
assert.strictEqual(m.length, 3);
assert.deepStrictEqual([m[0].d, m[0].t, m[0].who, m[0].text], ['2026-10-28', '오전 9:12', 'pk디자인 대리', '세대비번 1902*0427이에요']);
assert.strictEqual(m[1].text, '화장실은 지하1층\n관리실 옆 쓰시면 돼요');
// 휴대폰 내보내기 두 모양
const mob = `2026년 10월 29일 오후 2:05, 대표실장 : 월곡 작은방 문틀 들떴대요
2026. 10. 29. 오후 2:06, 대표실장 : 사진 보낼게요`;
m = K.parse(mob, '2026-10-01');
assert.deepStrictEqual(m.map((x) => [x.d, x.t, x.who]), [['2026-10-29', '오후 2:05', '대표실장'], ['2026-10-29', '오후 2:06', '대표실장']]);
// 이름 없이 복사한 글
m = K.parse('현관 PS010으로 갈게요\n방문은 3개요', '2026-10-28');
assert.strictEqual(m.length, 1); assert.strictEqual(m[0].text, '현관 PS010으로 갈게요\n방문은 3개요');
// 이미 읽은 것 거르기 — 같은 대화를 더 길게 다시 붙여도 새 줄만
const first = K.parse(pc, '2026-10-01');
const seen = K.remember([], first);
const again = K.parse(pc + '\n[pk디자인 대리] [오전 11:40] 23일은 오후 1시부터 가능해요', '2026-10-01');
const nw = K.fresh(again, seen);
assert.strictEqual(nw.length, 1); assert.strictEqual(nw[0].t, '오전 11:40');
// 방: 따로 정한 게 없으면 담당자 이름마다
assert.deepStrictEqual(K.rooms({ contacts: [{ name: '대표실장' }, { name: '대리' }, { name: '' }] }), ['대표실장', '대리']);
assert.deepStrictEqual(K.rooms({ kakaoRooms: ['대표실장방', '대리방'], contacts: [{ name: 'x' }] }), ['대표실장방', '대리방']);
// 필름: 같은 위치는 번호만 바꾸고 없는 위치는 더한다
const f = K.mergeFilms([{ place: '현관', code: 'PW08', ready: true }], [{ place: '현관', code: 'PS010' }, { place: '방문 3', code: 'PS010' }]);
assert.deepStrictEqual(f.map((r) => [r.place, r.code, r.ready]), [['현관', 'PS010', false], ['방문 3', 'PS010', false]]);
// 이미 같은 값이면 안 보여준다
assert.strictEqual(K.sameAsSite({ kind: 'field', field: 'pwUnit', value: '1902*0427' }, { pwUnit: '1902*0427' }), true);
assert.strictEqual(K.sameAsSite({ kind: 'field', field: 'carReg', value: '필요' }, { carReg: { v: '미확인' } }), false);
// 빈 날: 일요일·현장 있는 날 빼고
const add = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10).replace(/.*/, () => { const y = x.getFullYear(), mo = x.getMonth() + 1, da = x.getDate(); return y + '-' + String(mo).padStart(2, '0') + '-' + String(da).padStart(2, '0'); }); };
const free = K.freeDays([{ days: [{ date: '2026-10-30' }] }], '2026-10-28', 3, add);   // 10/29 목, 10/30 금(현장), 10/31 토, 11/1 일
assert.deepStrictEqual(free, ['2026-10-29', '2026-10-31', '2026-11-02']);
console.log('kakao ok');
