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
  toilet: '', films: [], quoteUrl: '', photoUrl: '', memo: ''
});
const full = () => Object.assign(blank(), {
  name: '인천 청학동 시대아파트', unit: '104동 910호', size: '13평',
  address: '인천광역시 부평구 마장로 164', date: '2026-08-18',
  pwLobby: '0000*', pwUnit: '1234*', gate: '정문 방문자 게이트',
  carReg: { v: '필요', memo: '관리실에 번호 알려줌' }, parking: '지상 방문자석',
  cargoEv: { v: '사용', memo: '' }, toilet: '지하1층 관리실 옆',
  note: '앞집이 예민함. 조심조심 들어올 것',
  films: [{ place: '현관문 뒷면', code: 'PS035' }, { place: '세탁실문 뒷면', code: '중백색' }],
  quoteUrl: 'https://songil.netlify.app/q/ab12cd34',
  photoUrl: 'https://songil.netlify.app/g/recABC',
  memo: '입니자 사진은 조대리가 찍어줌'
});

console.log('FIELDS');
test('14개 항목, 순서 고정 (동/호수·평형·주소는 칸이 없다)', () => {
  assert.deepStrictEqual(Share.FIELDS.map(f => f.key),
    ['name','date','pwLobby','pwUnit','gate','carReg','parking','cargoEv','toilet','note','films','quoteUrl','photoUrl','memo']);
});
test('DEFAULT_QUESTIONS에 name/note/quoteUrl/photoUrl/memo 없음, 나머지 9개', () => {
  const k = Object.keys(Share.DEFAULT_QUESTIONS);
  assert.strictEqual(k.length, 9);
  assert.ok(!k.includes('name') && !k.includes('memo') && !k.includes('quoteUrl')
    && !k.includes('photoUrl') && !k.includes('note'));
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
test('☑ 된 줄이 있으면 그 줄들만, 없으면 전부', () => {
  const s = blank();
  s.films = [{ place: 'a', code: 'hp604', ready: false }, { place: 'b', code: 'px449', ready: true }, { place: 'c', code: 'px454-2', ready: true }, { place: 'd', code: 'px454-2', ready: false }];
  assert.strictEqual(Share.filmOrderText(s), 'px449\npx454-2');
  s.films.forEach(r => { r.ready = false; });
  assert.strictEqual(Share.filmOrderText(s), 'hp604\npx449\npx454-2');
});

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
test('name/quoteUrl/photoUrl/memo 키는 무시', () => {
  const s = blank(); s.name = 'A';
  assert.strictEqual(Share.buildQuestion(s, ['name','quoteUrl','photoUrl','memo'], Share.DEFAULT_QUESTIONS), '');
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
    '📄 견적서: https://songil.netlify.app/q/ab12cd34\n' +
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
test('견적서 링크: 붙여넣은 주소가 현장사진 바로 앞줄로 나간다', () => {
  const s = full();
  assert.strictEqual(Share.buildShare(s, ['quoteUrl', 'photoUrl']),
    '[인천 청학동 시대아파트 104동 910호 13평]\n' +
    '📄 견적서: https://songil.netlify.app/q/ab12cd34\n' +
    '📷 현장사진: https://songil.netlify.app/g/recABC');
});
test('견적서 링크: 비어있으면 공유문에서 빠진다', () => {
  const s = full(); s.quoteUrl = '   ';
  assert.strictEqual(Share.isEmpty(s, 'quoteUrl'), true);
  assert.strictEqual(Share.buildShare(s, ['quoteUrl']), '[인천 청학동 시대아파트 104동 910호 13평]');
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
test('isUrgent: 시공일 3일 전부터(오늘·지난 날 포함) true, 4일 전은 false, 날짜 없으면 false', () => {
  const t = '2026-09-20';
  assert.ok(Share.isUrgent('2026-09-23', t));
  assert.ok(!Share.isUrgent('2026-09-24', t));
  assert.ok(Share.isUrgent('2026-09-20', t));
  assert.ok(Share.isUrgent('2026-09-01', t), '지났는데 미완료면 계속 급함');
  assert.ok(!Share.isUrgent('', t));
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

console.log('필요 인원 (총 필요 인원 대비 날짜별 배치)');
test('needStaffOf: 숫자만, 0·음수·빈값은 0(미정), 99 넘으면 99', () => {
  assert.strictEqual(Share.needStaffOf({ needStaff: 3 }), 3);
  assert.strictEqual(Share.needStaffOf({ needStaff: '3' }), 3);
  assert.strictEqual(Share.needStaffOf({}), 0);
  assert.strictEqual(Share.needStaffOf({ needStaff: 0 }), 0);
  assert.strictEqual(Share.needStaffOf({ needStaff: -2 }), 0);
  assert.strictEqual(Share.needStaffOf({ needStaff: '가나' }), 0);
  assert.strictEqual(Share.needStaffOf({ needStaff: 500 }), 99);
});
test('staffStatus: 모자람 / 딱 맞음 / 넘침 / 필요 인원 미정', () => {
  const s = { needStaff: 3, days: [{ date: '2026-09-28', staff: ['가', '나'] }, { date: '2026-09-29', staff: ['가', '나', '다'] }, { date: '2026-09-30', staff: ['가', '나', '다', '라'] }] };
  assert.deepStrictEqual(Share.staffStatus(s, 0), { have: 2, need: 3, short: 1, over: 0, ok: false });
  assert.deepStrictEqual(Share.staffStatus(s, 1), { have: 3, need: 3, short: 0, over: 0, ok: true });
  assert.deepStrictEqual(Share.staffStatus(s, 2), { have: 4, need: 3, short: 0, over: 1, ok: true });
  const n = { days: [{ date: '2026-09-28', staff: ['가'] }, { date: '2026-09-29', staff: [] }] };
  assert.deepStrictEqual(Share.staffStatus(n, 0), { have: 1, need: 0, short: 0, over: 0, ok: true });
  assert.deepStrictEqual(Share.staffStatus(n, 1), { have: 0, need: 0, short: 0, over: 0, ok: false });
});
test('staffCountLabel: 필요 인원이 있으면 2/3, 없으면 2명 / 미배정', () => {
  const s = { needStaff: 3, days: [{ date: '2026-09-28', staff: ['가', '나'] }] };
  assert.strictEqual(Share.staffCountLabel(s, 0), '2/3');
  assert.strictEqual(Share.staffCountLabel({ days: [{ date: '', staff: ['가', '나'] }] }, 0), '2명');
  assert.strictEqual(Share.staffCountLabel({ days: [{ date: '', staff: [] }] }, 0), '미배정');
});
test('shortStaffDays: 모자란 날만, 필요 인원 미정이면 빈 배열', () => {
  const s = { needStaff: 3, days: [{ date: '2026-09-28', staff: ['가', '나', '다'] }, { date: '2026-09-29', staff: ['가'] }] };
  assert.deepStrictEqual(Share.shortStaffDays(s), [{ index: 1, date: '2026-09-29', have: 1, need: 3, short: 2 }]);
  assert.deepStrictEqual(Share.shortStaffDays({ days: [{ date: '2026-09-29', staff: [] }] }), []);
});
test('isReady: 필요 인원을 정했으면 날마다 그 수를 채워야 준비 완료', () => {
  const base = { filmStage: 3, films: [], supplies: [], needStaff: 3 };
  const full3 = [{ date: '2026-09-28', staff: ['가', '나', '다'] }, { date: '2026-09-29', staff: ['가', '나', '다'] }];
  assert.ok(Share.isReady(Object.assign({}, base, { days: full3 })));
  assert.ok(!Share.isReady(Object.assign({}, base, { days: [full3[0], { date: '2026-09-29', staff: ['가'] }] })), '2일차 2명 부족');
  assert.ok(Share.isReady(Object.assign({}, base, { needStaff: 0, days: [full3[0], { date: '2026-09-29', staff: [] }] })), '필요 인원 미정이면 예전대로 1명 이상');
});
test('staffLine / staffShortLine: 필요 인원을 정하면 공유 문구에도 나간다', () => {
  const s = { needStaff: 3, days: [{ date: '2026-09-28', staff: ['서영호', '염문철', '문승규'] }, { date: '2026-09-29', staff: ['서영호'] }] };
  assert.strictEqual(Share.staffLine(s), '👤 필요 3명 — 9/28 서영호·염문철·문승규 / 9/29 서영호');
  assert.strictEqual(Share.staffShortLine(s), '⚠ 인원 부족: 9/29 1/3(2명)');
  assert.strictEqual(Share.staffLine({ needStaff: 3, days: [{ date: '2026-09-28', staff: [] }] }), '👤 필요 3명 — 아직 미배정');
  assert.strictEqual(Share.staffShortLine({ days: [{ date: '2026-09-28', staff: [] }] }), '', '필요 인원 미정이면 경고 없음');
  const one = { needStaff: 2, days: [{ date: '2026-09-28', staff: ['서영호', '염문철'] }] };
  assert.strictEqual(Share.staffLine(one), '👤 필요 2명 — 서영호·염문철');
  assert.strictEqual(Share.staffShortLine(one), '');
});
test('buildShare: 인원 줄 다음에 부족 경고 줄', () => {
  const s = Object.assign(full(), { needStaff: 3, days: [{ date: '2026-08-18', staff: ['김기사'] }] });
  const lines = Share.buildShare(s, ['name', 'date', 'pwLobby']).split('\n');
  assert.strictEqual(lines[1], '👤 필요 3명 — 김기사');
  assert.strictEqual(lines[2], '⚠ 인원 부족: 8/18 1/3(2명)');
  assert.strictEqual(lines[3], '공동현관비번: 0000*');
});

// ---------- 날짜별 건수 · 이어진 날 묶기 (2026-09-23 일정 화면) ----------
const siteOn = (id, dates, extra) => Object.assign(blank(), {
  id: id, createdAt: 1, date: dates[0],
  days: dates.map((d) => ({ date: d, staff: [] }))
}, extra || {});

test('dateCounts: 날짜마다 현장 수를 센다 (여러 날 현장은 날마다 1건)', () => {
  const c = Share.dateCounts([
    siteOn('a', ['2026-09-28', '2026-09-29']),
    siteOn('b', ['2026-09-28'])
  ]);
  assert.deepStrictEqual(c, { '2026-09-28': 2, '2026-09-29': 1 });
});
test('dateCounts: 날짜가 없거나 엉터리면 안 센다', () => {
  assert.deepStrictEqual(Share.dateCounts([siteOn('a', ['', '2026-02-30', '헛것'])]), {});
  assert.deepStrictEqual(Share.dateCounts([]), {});
  assert.deepStrictEqual(Share.dateCounts(null), {});
});

test('siteSchedule: 떨어진 날도 한 현장이면 한 덩어리 (일차 번호 유지)', () => {
  const r = Share.siteSchedule(siteOn('a', ['2026-09-28', '2026-09-29', '2026-10-07']), '2026-09-23');
  assert.deepStrictEqual(r.dates, ['2026-09-28', '2026-09-29', '2026-10-07']);
  assert.deepStrictEqual(r.dayIndexes, [0, 1, 2]);
  assert.strictEqual(r.start, '2026-09-28');
  assert.strictEqual(r.end, '2026-10-07');
  assert.strictEqual(r.dayCount, 3);
  assert.strictEqual(r.이어짐, false, '10/7 이 떨어져 있으니 연속이 아니다');
});
test('siteSchedule: 하루도 안 건너뛰면 이어짐', () => {
  assert.strictEqual(Share.siteSchedule(siteOn('a', ['2026-09-28', '2026-09-29']), '2026-09-23').이어짐, true);
  assert.strictEqual(Share.siteSchedule(siteOn('a', ['2026-09-30', '2026-10-01']), '2026-09-23').이어짐, true, '달을 넘겨도 이어짐');
  assert.strictEqual(Share.siteSchedule(siteOn('a', ['2026-09-28']), '2026-09-23').이어짐, true, '하루짜리도 이어짐');
});
test('siteSchedule: next 는 오늘 이후로 남은 첫 날, 다 지났으면 빈 값', () => {
  assert.strictEqual(Share.siteSchedule(siteOn('a', ['2026-09-17', '2026-10-07']), '2026-09-23').next, '2026-10-07');
  assert.strictEqual(Share.siteSchedule(siteOn('a', ['2026-09-23']), '2026-09-23').next, '2026-09-23', '오늘도 남은 날');
  assert.strictEqual(Share.siteSchedule(siteOn('a', ['2026-09-17', '2026-09-18']), '2026-09-23').next, '');
});
test('siteSchedule: 날짜를 거꾸로 넣어도 날짜순, 날짜 없으면 null', () => {
  const r = Share.siteSchedule(siteOn('a', ['2026-09-29', '2026-09-28']), '2026-09-23');
  assert.deepStrictEqual(r.dates, ['2026-09-28', '2026-09-29']);
  assert.deepStrictEqual(r.dayIndexes, [1, 0]);
  assert.strictEqual(Share.siteSchedule(blank(), '2026-09-23'), null);
});

test('scheduleSites: 떨어진 날이 있어도 현장 하나는 카드 하나', () => {
  const g = Share.scheduleSites([siteOn('a', ['2026-09-28', '2026-09-29', '2026-10-07'])], '2026-09-23', 30);
  assert.strictEqual(g.runs.length, 1, '두 장으로 쪼개지 않는다');
  assert.deepStrictEqual(g.runs[0].dates.length, 3);
  assert.strictEqual(g.past.length, 0);
  assert.strictEqual(g.later.length, 0);
});
test('scheduleSites: 지난 날이 섞여 있어도 남은 날이 있으면 목록에 남는다', () => {
  const g = Share.scheduleSites([siteOn('a', ['2026-09-17', '2026-10-07'])], '2026-09-23', 30);
  assert.deepStrictEqual(g.runs.map((r) => r.site.id), ['a']);
  assert.strictEqual(g.pastCount, 0, '한 현장을 지난/앞으로 로 갈라 세지 않는다');
});
test('scheduleSites: 모든 날이 지나야 past, 건수는 날 수로', () => {
  const g = Share.scheduleSites([siteOn('p', ['2026-09-17', '2026-09-18'])], '2026-09-23', 30);
  assert.deepStrictEqual(g.past.map((r) => r.site.id), ['p']);
  assert.strictEqual(g.pastCount, 2);
});
test('scheduleSites: 남은 첫 날이 창 뒤면 later', () => {
  const inWin = Share.scheduleSites([siteOn('a', ['2026-10-22'])], '2026-09-23', 30);
  assert.strictEqual(inWin.runs.length, 1, '10/22 는 30일 창 안');
  const out = Share.scheduleSites([siteOn('a', ['2026-11-05'])], '2026-09-23', 30);
  assert.strictEqual(out.runs.length, 0);
  assert.strictEqual(out.laterCount, 1);
});
test('scheduleSites: 남은 첫 날 순으로 줄 세운다 (할 일 순서)', () => {
  const g = Share.scheduleSites([
    siteOn('늦음', ['2026-10-05']),
    siteOn('빠름', ['2026-09-28']),
    siteOn('지난날섞임', ['2026-09-10', '2026-10-01'])
  ], '2026-09-23', 30);
  assert.deepStrictEqual(g.runs.map((r) => r.site.id), ['빠름', '지난날섞임', '늦음']);
});
test('scheduleSites: past 는 최근 끝난 것이 먼저', () => {
  const g = Share.scheduleSites([
    siteOn('p1', ['2026-09-17']),
    siteOn('p2', ['2026-09-19'])
  ], '2026-09-23', 30);
  assert.deepStrictEqual(g.past.map((r) => r.site.id), ['p2', 'p1']);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
