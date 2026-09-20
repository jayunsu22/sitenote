// 실행: node test/share.test.js
const assert = require('assert');
const Share = require('../share.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}

const blank = () => ({
  id: 's1', clientId: 'c1', color: 0, createdAt: 1, updatedAt: 1,
  name: '', unit: '', size: '', address: '', date: '', pwLobby: '', pwUnit: '', gate: '',
  carReg: { v: '미확인', memo: '' }, parking: '', cargoEv: { v: '미확인', memo: '' },
  toilet: '', films: [], photoUrl: '', memo: ''
});
const full = () => Object.assign(blank(), {
  name: '인천 청학동 시대아파트', unit: '104동 910호', size: '13평',
  address: '인천광역시 부평구 마장로 164', date: '2026-08-18',
  pwLobby: '0000*', pwUnit: '1234*', gate: '정문 방문자 게이트',
  carReg: { v: '필요', memo: '관리실에 번호 알려줌' }, parking: '지상 방문자석',
  cargoEv: { v: '사용', memo: '' }, toilet: '지하1층 관리실 옆',
  note: '앞집이 예민함. 조심조심 들어올 것',
  films: [{ place: '현관문 뒷면', code: 'PS035' }, { place: '세탁실문 뒷면', code: '중백색' }],
  photoUrl: 'https://songil.netlify.app/g/recABC',
  memo: '입니자 사진은 조대리가 찍어줌'
});

console.log('FIELDS');
test('13개 항목, 순서 고정 (동/호수·평형·주소는 칸이 없다)', () => {
  assert.deepStrictEqual(Share.FIELDS.map(f => f.key),
    ['name','date','pwLobby','pwUnit','gate','carReg','parking','cargoEv','toilet','note','films','photoUrl','memo']);
});
test('DEFAULT_QUESTIONS에 name/note/photoUrl/memo 없음, 나머지 9개', () => {
  const k = Object.keys(Share.DEFAULT_QUESTIONS);
  assert.strictEqual(k.length, 9);
  assert.ok(!k.includes('name') && !k.includes('memo') && !k.includes('photoUrl') && !k.includes('note'));
  assert.strictEqual(Share.DEFAULT_QUESTIONS.cargoEv, '짐 옮길 때 화물 엘리베이터 사용해야 하나요?');
});

console.log('isEmpty');
test('텍스트 공백은 빈값', () => { const s = blank(); s.parking = '   '; assert.strictEqual(Share.isEmpty(s, 'parking'), true); });
test('텍스트 값 있으면 채움', () => { assert.strictEqual(Share.isEmpty(full(), 'parking'), false); });
test('선택형 미확인은 빈값', () => { assert.strictEqual(Share.isEmpty(blank(), 'carReg'), true); });
test('선택형 불필요는 채움', () => { const s = blank(); s.carReg.v = '불필요'; assert.strictEqual(Share.isEmpty(s, 'carReg'), false); });
test('films 줄 없음 = 빈값', () => { assert.strictEqual(Share.isEmpty(blank(), 'films'), true); });
test('films 코드 전부 빈 줄 = 빈값', () => { const s = blank(); s.films = [{ place: '현관문', code: '' }]; assert.strictEqual(Share.isEmpty(s, 'films'), true); });
test('films 코드 하나라도 있으면 채움', () => { assert.strictEqual(Share.isEmpty(full(), 'films'), false); });
test('undefined 필드도 빈값', () => { const s = blank(); delete s.toilet; assert.strictEqual(Share.isEmpty(s, 'toilet'), true); });

console.log('titleLine');
// 칸은 뺐지만 예전에 저장한 unit/size 는 제목에 그대로 붙어야 한다
test('현장명+동호수+평형 (예전 데이터)', () => { assert.strictEqual(Share.titleLine(full()), '인천 청학동 시대아파트 104동 910호 13평'); });
test('빈 것 생략', () => { const s = full(); s.size = ''; assert.strictEqual(Share.titleLine(s), '인천 청학동 시대아파트 104동 910호'); });
test('전부 빈 경우 (이름없음)', () => { assert.strictEqual(Share.titleLine(blank()), '(이름없음)'); });
test('현장명에 동호수가 이미 있으면 예전 unit 값을 다시 붙이지 않음', () => {
  const s = full(); s.name = '인천 당하동 그랜드비스타 2동 501호'; s.unit = '2동 501호'; s.size = '';
  assert.strictEqual(Share.titleLine(s), '인천 당하동 그랜드비스타 2동 501호');
});
test('현장명에 평형이 이미 있으면 size 도 안 붙임 (공백 차이 무시)', () => {
  const s = full(); s.name = '시대아파트 104동910호 13평'; s.unit = '104동 910호'; s.size = '13평';
  assert.strictEqual(Share.titleLine(s), '시대아파트 104동910호 13평');
});

console.log('filmOrderText');
test('필름 번호만 한 줄에 하나씩', () => {
  assert.strictEqual(Share.filmOrderText(full()), 'PS035\n중백색');
});
test('빈 줄·공백은 빼고, 같은 번호는 한 번만', () => {
  const s = blank();
  s.films = [{ place: '현관', code: ' px454-2 ' }, { place: '문틀', code: 'ps101' }, { place: '', code: '' },
             { place: '샤시틀', code: 'ps101' }, null];
  assert.strictEqual(Share.filmOrderText(s), 'px454-2\nps101');
});
test('필름 없으면 빈 문자열', () => { assert.strictEqual(Share.filmOrderText(blank()), ''); });

console.log('buildQuestion');
test('빈 항목만 질문으로, 순서는 FIELDS 순', () => {
  const s = full(); s.gate = ''; s.toilet = ''; s.cargoEv.v = '미확인';
  const out = Share.buildQuestion(s, ['gate','toilet','cargoEv','parking'], Share.DEFAULT_QUESTIONS);
  assert.strictEqual(out,
    '[인천 청학동 시대아파트 104동 910호 13평]\n' +
    '- 방문객 차량 출입구가 따로 있나요?\n' +
    '- 짐 옮길 때 화물 엘리베이터 사용해야 하나요?\n' +
    '- 화장실 사용할 곳 위치 알려주세요');
});
test('커스텀 문구 적용', () => {
  const s = blank(); s.name = 'A';
  const out = Share.buildQuestion(s, ['toilet'], Object.assign({}, Share.DEFAULT_QUESTIONS, { toilet: '화장실 어디 써요?' }));
  assert.strictEqual(out, '[A]\n- 화장실 어디 써요?');
});
test('name/photoUrl/memo 키는 무시', () => {
  const s = blank(); s.name = 'A';
  assert.strictEqual(Share.buildQuestion(s, ['name','photoUrl','memo'], Share.DEFAULT_QUESTIONS), '');
});
test('질문할 게 없으면 빈 문자열', () => {
  assert.strictEqual(Share.buildQuestion(full(), ['gate','toilet'], Share.DEFAULT_QUESTIONS), '');
});

console.log('buildShare');
test('채워진 항목만, 형식 고정', () => {
  const keys = Share.FIELDS.map(f => f.key);
  const out = Share.buildShare(full(), keys);
  assert.strictEqual(out,
    '[인천 청학동 시대아파트 104동 910호 13평] 8/18\n' +
    '공동현관비번: 0000*\n' +
    '세대비번: 1234*\n' +
    '출입: 정문 방문자 게이트\n' +
    '차량등록 필요 (관리실에 번호 알려줌)\n' +
    '주차: 지상 방문자석\n' +
    '화물EV 사용\n' +
    '화장실: 지하1층 관리실 옆\n' +
    '⚠ 특이사항: 앞집이 예민함. 조심조심 들어올 것\n' +
    '필름: 현관문 뒷면 PS035, 세탁실문 뒷면 중백색\n' +
    '📷 현장사진: https://songil.netlify.app/g/recABC\n' +
    '입니자 사진은 조대리가 찍어줌');
});
test('비번 하나만 있으면 그 줄만', () => {
  const s = full(); s.pwLobby = '';
  const out = Share.buildShare(s, ['pwLobby','pwUnit']);
  assert.strictEqual(out, '[인천 청학동 시대아파트 104동 910호 13평]\n세대비번: 1234*');
});
test('선택된 키 외에는 안 나옴 (date 미선택이면 제목에 날짜 없음)', () => {
  const out = Share.buildShare(full(), ['parking']);
  assert.strictEqual(out, '[인천 청학동 시대아파트 104동 910호 13평]\n주차: 지상 방문자석');
});
test('빈 항목은 선택돼도 제외', () => {
  const s = full(); s.parking = '';
  assert.strictEqual(Share.buildShare(s, ['parking']), '[인천 청학동 시대아파트 104동 910호 13평]');
});
test('films 코드 빈 줄은 건너뜀', () => {
  const s = full(); s.films.push({ place: '방문', code: '' });
  assert.strictEqual(Share.buildShare(s, ['films']), '[인천 청학동 시대아파트 104동 910호 13평]\n필름: 현관문 뒷면 PS035, 세탁실문 뒷면 중백색');
});
test('선택형 메모 없으면 괄호 없음, 일반사용 표기', () => {
  const s = full(); s.carReg = { v: '불필요', memo: '' }; s.cargoEv = { v: '일반사용', memo: '예약 불필요' };
  assert.strictEqual(Share.buildShare(s, ['carReg','cargoEv']),
    '[인천 청학동 시대아파트 104동 910호 13평]\n차량등록 불필요\n화물EV 일반사용 (예약 불필요)');
});

test('linkUrl: http(s) 없으면 붙이고, 있으면 그대로, 빈값은 빈 문자열', () => {
  assert.strictEqual(Share.linkUrl('songil.netlify.app/g/recABC'), 'https://songil.netlify.app/g/recABC');
  assert.strictEqual(Share.linkUrl('https://songil.netlify.app/g/recABC'), 'https://songil.netlify.app/g/recABC');
  assert.strictEqual(Share.linkUrl('http://a.b/c'), 'http://a.b/c');
  assert.strictEqual(Share.linkUrl('  //songil.netlify.app/g/x '), 'https://songil.netlify.app/g/x');
  assert.strictEqual(Share.linkUrl('   '), '');
});
test('공유문의 사진 링크는 http 없이 넣어도 https:// 가 붙어서 나간다', () => {
  const s = full(); s.photoUrl = 'songil.netlify.app/g/recABC';
  assert.strictEqual(Share.buildShare(s, ['photoUrl']),
    '[인천 청학동 시대아파트 104동 910호 13평]\n📷 현장사진: https://songil.netlify.app/g/recABC');
});
test('현장사진 링크: 비어있으면 공유문에서 빠지고, 있으면 메모 앞줄에', () => {
  const s = full();
  assert.strictEqual(Share.isEmpty(s, 'photoUrl'), false);
  s.photoUrl = '   ';
  assert.strictEqual(Share.isEmpty(s, 'photoUrl'), true);
  assert.strictEqual(Share.buildShare(s, ['photoUrl']), '[인천 청학동 시대아파트 104동 910호 13평]');
});

console.log('sortSites');
test('날짜 없음 우선, 날짜 오름차순, 동률은 최근 생성 우선', () => {
  const mk = (id, date, createdAt) => Object.assign(blank(), { id, date, createdAt });
  const out = Share.sortSites([mk('a','2026-09-20',1), mk('b','',1), mk('c','2026-09-01',1), mk('d','',5), mk('e','2026-09-01',9)]);
  assert.deepStrictEqual(out.map(s => s.id), ['d','b','e','c','a']);
});
test('원본 배열 변경 안 함', () => {
  const arr = [Object.assign(blank(), { id: 'a', date: '2026-01-02' }), Object.assign(blank(), { id: 'b', date: '2026-01-01' })];
  Share.sortSites(arr);
  assert.deepStrictEqual(arr.map(s => s.id), ['a','b']);
});

console.log('nextColor');
test('거래처 내 현장 수 mod 8', () => {
  const sites = [];
  for (let i = 0; i < 9; i++) sites.push(Object.assign(blank(), { id: 's' + i, clientId: 'c1' }));
  sites.push(Object.assign(blank(), { id: 'x', clientId: 'c2' }));
  assert.strictEqual(Share.nextColor(sites, 'c1'), 1);
  assert.strictEqual(Share.nextColor(sites, 'c2'), 1);
  assert.strictEqual(Share.nextColor(sites, 'c3'), 0);
});

console.log('mergeQueue');
test('같은 type+id upsert는 마지막으로 교체', () => {
  let q = [];
  q = Share.mergeQueue(q, { op: 'upsert', type: 'site', id: 's1', data: { a: 1 }, ts: 1 });
  q = Share.mergeQueue(q, { op: 'upsert', type: 'client', id: 'c1', data: {}, ts: 2 });
  q = Share.mergeQueue(q, { op: 'upsert', type: 'site', id: 's1', data: { a: 2 }, ts: 3 });
  assert.strictEqual(q.length, 2);
  assert.deepStrictEqual(q.map(o => o.id), ['c1','s1']);
  assert.strictEqual(q[1].data.a, 2);
});
test('delete는 이전 upsert 제거 후 추가', () => {
  let q = [{ op: 'upsert', type: 'site', id: 's1', data: {}, ts: 1 }];
  q = Share.mergeQueue(q, { op: 'delete', type: 'site', id: 's1', ts: 2 });
  assert.deepStrictEqual(q, [{ op: 'delete', type: 'site', id: 's1', ts: 2 }]);
});
test('원본 큐 변경 안 함', () => {
  const q = [];
  Share.mergeQueue(q, { op: 'upsert', type: 'site', id: 's1', data: {}, ts: 1 });
  assert.strictEqual(q.length, 0);
});

console.log('사진 도우미');
test('dataUrlBytes: base64 실제 바이트 (패딩 반영)', () => {
  assert.strictEqual(Share.dataUrlBytes('data:image/jpeg;base64,QUJD'), 3);      // ABC
  assert.strictEqual(Share.dataUrlBytes('data:image/jpeg;base64,QUJDRA=='), 4);  // ABCD
  assert.strictEqual(Share.dataUrlBytes(''), 0);
  assert.strictEqual(Share.dataUrlBytes(null), 0);
});
test('isImageDataUrl: 이미지 data URL 만 통과', () => {
  assert.ok(Share.isImageDataUrl('data:image/jpeg;base64,QUJD'));
  assert.ok(Share.isImageDataUrl('data:image/png;base64,QUJDRA=='));
  assert.ok(!Share.isImageDataUrl('data:text/html;base64,QUJD'));
  assert.ok(!Share.isImageDataUrl('https://example.com/a.jpg'));
  assert.ok(!Share.isImageDataUrl('data:image/jpeg;base64,"><script>'));
  assert.ok(!Share.isImageDataUrl(''));
});
test('splitChunks / joinChunks: 잘랐다 붙이면 원래대로', () => {
  const big = 'x'.repeat(250);
  const parts = Share.splitChunks(big, 100);
  assert.strictEqual(parts.length, 3);
  assert.deepStrictEqual(parts.map(p => p.length), [100, 100, 50]);
  const rows = parts.map((chunk, i) => ({ i, chunk }));
  assert.strictEqual(Share.joinChunks(rows.slice().reverse()), big, '순서가 섞여도 i 로 정렬');
  assert.strictEqual(Share.joinChunks([]), '');
});
test('joinChunks: 조각이 빠졌으면 버림', () => {
  assert.strictEqual(Share.joinChunks([{ i: 0, chunk: 'a' }, { i: 2, chunk: 'c' }]), '');
  assert.strictEqual(Share.joinChunks([{ i: 1, chunk: 'b' }]), '');
});
test('fmtBytes', () => {
  assert.strictEqual(Share.fmtBytes(900), '900B');
  assert.strictEqual(Share.fmtBytes(50 * 1024), '50KB');
  assert.strictEqual(Share.fmtBytes(2.5 * 1024 * 1024), '2.5MB');
});


console.log('SCHEDULE — 날짜·일차');
test('isIsoDate / addDays: 월말·연말·윤년 경계', () => {
  assert.ok(Share.isIsoDate('2026-09-19'));
  assert.ok(!Share.isIsoDate('2026-9-19'));
  assert.ok(!Share.isIsoDate('2026-02-30'));
  assert.ok(!Share.isIsoDate(''));
  assert.strictEqual(Share.addDays('2026-09-30', 1), '2026-10-01');
  assert.strictEqual(Share.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(Share.addDays('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(Share.addDays('2026-09-19', -1), '2026-09-18');
  assert.strictEqual(Share.addDays('', 1), '');
  assert.strictEqual(Share.addDays('abc', 1), '');
});
test('todayIso: 로컬 날짜', () => {
  assert.strictEqual(Share.todayIso(new Date(2026, 8, 19, 23, 30)), '2026-09-19');
  assert.strictEqual(Share.todayIso(new Date(2026, 0, 5)), '2026-01-05');
});
test('shiftDays: 시작을 옮기면 나머지 일차가 같은 일수만큼 밀리고 인원은 유지', () => {
  const days = [{ date: '2026-09-19', staff: ['김기사'] }, { date: '2026-09-20', staff: ['박기사'] }];
  const out = Share.shiftDays(days, '2026-09-22');
  assert.deepStrictEqual(out, [{ date: '2026-09-22', staff: ['김기사'] }, { date: '2026-09-23', staff: ['박기사'] }]);
  assert.notStrictEqual(out, days, '새 배열');
  assert.strictEqual(days[0].date, '2026-09-19', '원본 유지');
  assert.deepStrictEqual(Share.shiftDays([], '2026-09-22'), [{ date: '2026-09-22', staff: [] }]);
  assert.deepStrictEqual(Share.shiftDays(days, ''), [{ date: '', staff: ['김기사'] }, { date: '2026-09-20', staff: ['박기사'] }], '시작을 지우면 1일차만 비움');
  assert.deepStrictEqual(Share.shiftDays([{ date: '', staff: [] }, { date: '', staff: [] }], '2026-09-22'),
    [{ date: '2026-09-22', staff: [] }, { date: '', staff: [] }], '원래 날짜가 없던 줄은 못 밀어서 그대로');
});

console.log('SCHEDULE — 날짜별 묶기');
const site = (id, name, days, extra) => Object.assign(blank(), { id, name, createdAt: parseInt(id.slice(1), 10), days }, extra || {});
const S = () => [
  site('s1', '군포', [{ date: '2026-09-19', staff: ['김기사', '박기사'] }]),
  site('s2', '인천', [{ date: '2026-09-20', staff: ['김기사'] }, { date: '2026-09-21', staff: ['김기사'] }]),
  site('s3', '부천', [{ date: '2026-09-20', staff: ['김 기사', '최기사'] }]),
  site('s4', '수원', [{ date: '2026-10-05', staff: [] }]),
  site('s5', '미정', [{ date: '', staff: [] }]),
  site('s6', '어제', [{ date: '2026-09-18', staff: ['박기사'] }]),
  site('s7', '이상한날짜', [{ date: '9/25', staff: [] }])
];
test('groupByDate: 14일은 빈 날도 줄이 있고, 그 뒤는 later 로, 어제·날짜없음·잘못된 날짜는 빠짐', () => {
  const g = Share.groupByDate(S(), '2026-09-19', 14);
  assert.strictEqual(g.days.length, 14);
  assert.strictEqual(g.days[0].date, '2026-09-19');
  assert.strictEqual(g.days[13].date, '2026-10-02');
  assert.deepStrictEqual(g.days[0].entries.map(e => e.site.id), ['s1']);
  assert.deepStrictEqual(g.days[1].entries.map(e => e.site.id), ['s2', 's3'], '생성순');
  assert.deepStrictEqual(g.days[1].entries.map(e => [e.dayIndex, e.dayCount]), [[0, 2], [0, 1]]);
  assert.deepStrictEqual(g.days[2].entries.map(e => [e.site.id, e.dayIndex]), [['s2', 1]]);
  assert.strictEqual(g.days[3].entries.length, 0);
  assert.deepStrictEqual(g.later.map(d => d.date), ['2026-10-05']);
  assert.deepStrictEqual(g.later[0].entries.map(e => e.site.id), ['s4']);
  assert.strictEqual(g.laterCount, 1);
  const all = g.days.concat(g.later).flatMap(d => d.entries.map(e => e.site.id));
  ['s5', 's6', 's7'].forEach(id => assert.ok(!all.includes(id), id + ' 는 안 나와야'));
  assert.deepStrictEqual(g.past.map(d => d.date), ['2026-09-18'], '어제는 past 로');
  assert.deepStrictEqual(g.past[0].entries.map(e => e.site.id), ['s6']);
  assert.strictEqual(g.pastCount, 1);
});
test('groupByDate: past 는 최근 날짜가 먼저', () => {
  const sites = [
    site('s1', 'a', [{ date: '2026-09-01', staff: [] }]),
    site('s2', 'b', [{ date: '2026-09-10', staff: [] }, { date: '2026-09-11', staff: [] }]),
    site('s3', 'c', [{ date: '2026-09-05', staff: [] }])
  ];
  const g = Share.groupByDate(sites, '2026-09-19', 14);
  assert.deepStrictEqual(g.past.map(d => d.date), ['2026-09-11', '2026-09-10', '2026-09-05', '2026-09-01']);
  assert.strictEqual(g.pastCount, 4);
  assert.strictEqual(g.laterCount, 0);
});
test('groupByDate: days 가 없는 구버전 현장은 date 를 1일차로 본다', () => {
  const old = Object.assign(blank(), { id: 's9', name: '구버전', date: '2026-09-19' });
  delete old.days;
  const g = Share.groupByDate([old], '2026-09-19', 3);
  assert.deepStrictEqual(g.days[0].entries.map(e => [e.site.id, e.dayIndex, e.dayCount]), [['s9', 0, 1]]);
});
test('findOverlaps: 같은 날 다른 현장의 같은 이름(공백 무시)만', () => {
  const o = Share.findOverlaps(S());
  assert.deepStrictEqual(o, { '2026-09-20': { '김기사': 2 } });
  const same = [site('s1', 'a', [{ date: '2026-09-19', staff: ['김기사'] }, { date: '2026-09-19', staff: ['김기사'] }])];
  assert.deepStrictEqual(Share.findOverlaps(same), {}, '같은 현장 안은 겹침 아님');
  assert.deepStrictEqual(Share.findOverlaps([]), {});
});

console.log('SCHEDULE — 준비 상태');
test('readyCount: 필름은 번호 빈 줄 제외', () => {
  const s = Object.assign(blank(), {
    films: [{ place: 'a', code: 'PS035', ready: true }, { place: 'b', code: '', ready: false }, { place: 'c', code: 'W211' }],
    supplies: [{ name: '본드', ready: true }, { name: '장갑', ready: false }]
  });
  assert.deepStrictEqual(Share.readyCount(s), { films: [1, 2], supplies: [1, 2] });
  assert.deepStrictEqual(Share.readyCount(blank()), { films: [0, 0], supplies: [0, 0] });
});
test('isReady: 필름 수령 + 전부 체크 + 인원 1명 이상', () => {
  const s = Object.assign(blank(), {
    films: [{ place: 'a', code: 'PS035', ready: true }], supplies: [{ name: '본드', ready: true }],
    days: [{ date: '2026-09-19', staff: ['김기사'] }], filmStage: 3
  });
  assert.ok(Share.isReady(s));
  assert.ok(!Share.isReady(Object.assign({}, s, { filmStage: 2 })), '필름 주문 단계면 아직 아님');
  assert.ok(!Share.isReady(Object.assign({}, s, { filmStage: undefined })), '단계 없으면 미확정');
  assert.ok(!Share.isReady(Object.assign(s, { days: [{ date: '2026-09-19', staff: [] }] })), '인원 0');
  assert.ok(!Share.isReady(Object.assign(s, { days: [{ date: '2026-09-19', staff: ['김기사'] }], supplies: [{ name: '본드', ready: false }] })));
  assert.ok(Share.isReady(Object.assign(blank(), { days: [{ date: '', staff: ['김기사'] }], filmStage: 3 })), '필름·부자재 없으면 인원만 보면 됨');
});
test('filmStageOf: 0~3 만, 그 외는 0(미확정)', () => {
  assert.strictEqual(Share.FILM_STAGES.length, 4);
  assert.strictEqual(Share.filmStageOf({ filmStage: 2 }), 2);
  assert.strictEqual(Share.filmStageOf({ filmStage: '3' }), 3);
  assert.strictEqual(Share.filmStageOf({}), 0);
  assert.strictEqual(Share.filmStageOf({ filmStage: 7 }), 0);
  assert.strictEqual(Share.filmStageOf({ filmStage: -1 }), 0);
});

console.log('SCHEDULE — 공유 문구');
test('staffLine: 하루 / 여러 날 / 빈 날 건너뜀 / 전부 빔', () => {
  assert.strictEqual(Share.staffLine({ days: [{ date: '2026-09-19', staff: ['김기사', '박기사'] }] }), '👤 김기사·박기사');
  assert.strictEqual(Share.staffLine({ days: [{ date: '2026-09-19', staff: ['김기사', '박기사'] }, { date: '2026-09-20', staff: ['김기사'] }] }),
    '👤 9/19 김기사·박기사 / 9/20 김기사');
  assert.strictEqual(Share.staffLine({ days: [{ date: '2026-09-19', staff: [] }, { date: '2026-09-20', staff: ['김기사'] }] }), '👤 9/20 김기사');
  assert.strictEqual(Share.staffLine({ days: [{ date: '2026-09-19', staff: [] }] }), '');
  assert.strictEqual(Share.staffLine({}), '');
});
test('datesLine / buildShare 제목: 여러 날이면 날짜를 쉼표로 나열', () => {
  const s = Object.assign(full(), { days: [{ date: '2026-08-18', staff: [] }, { date: '2026-08-19', staff: [] }, { date: '2026-08-21', staff: [] }] });
  assert.strictEqual(Share.datesLine(s), '8/18, 8/19, 8/21');
  assert.strictEqual(Share.datesLine(full()), '8/18');
  assert.strictEqual(Share.buildShare(s, ['name', 'date']).split('\n')[0], '[인천 청학동 시대아파트 104동 910호 13평] 8/18, 8/19, 8/21');
});
test('monthGrid: 2026년 9월은 화요일 시작, 5주', () => {
  const g = Share.monthGrid(2026, 9);
  assert.strictEqual(g.length, 5);
  assert.deepStrictEqual(g[0], [null, null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  assert.deepStrictEqual(g[4], ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', null, null, null]);
  assert.strictEqual(Share.monthGrid(2026, 2)[0][0], '2026-02-01', '일요일 시작이면 빈 칸 없음');
});
test('buildShare: 인원 줄은 제목(날짜) 줄 바로 다음, days 없으면 예전 그대로', () => {
  const s = Object.assign(full(), { days: [{ date: '2026-08-18', staff: ['김기사', '박기사'] }] });
  const lines = Share.buildShare(s, ['name', 'date', 'pwLobby']).split('\n');
  assert.strictEqual(lines[0], '[인천 청학동 시대아파트 104동 910호 13평] 8/18');
  assert.strictEqual(lines[1], '👤 김기사·박기사');
  assert.strictEqual(lines[2], '공동현관비번: 0000*');
  assert.strictEqual(Share.buildShare(full(), ['name', 'date', 'pwLobby']).split('\n').length, 2);
  assert.strictEqual(Share.buildShare(s, ['name', 'pwLobby']).split('\n')[1], '👤 김기사·박기사', '날짜 체크를 안 해도 인원은 나감');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
