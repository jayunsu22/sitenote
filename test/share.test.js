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
  films: [{ place: '현관문 뒷면', code: 'PS035' }, { place: '세탁실문 뒷면', code: '중백색' }],
  photoUrl: 'https://songil.netlify.app/g/recABC',
  memo: '입니자 사진은 조대리가 찍어줌'
});

console.log('FIELDS');
test('12개 항목, 순서 고정 (동/호수·평형·주소는 칸이 없다)', () => {
  assert.deepStrictEqual(Share.FIELDS.map(f => f.key),
    ['name','date','pwLobby','pwUnit','gate','carReg','parking','cargoEv','toilet','films','photoUrl','memo']);
});
test('DEFAULT_QUESTIONS에 name/photoUrl/memo 없음, 나머지 9개', () => {
  const k = Object.keys(Share.DEFAULT_QUESTIONS);
  assert.strictEqual(k.length, 9);
  assert.ok(!k.includes('name') && !k.includes('memo') && !k.includes('photoUrl'));
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
    '공동현관: 0000*  세대: 1234*\n' +
    '출입: 정문 방문자 게이트\n' +
    '차량등록 필요 (관리실에 번호 알려줌)\n' +
    '주차: 지상 방문자석\n' +
    '화물EV 사용\n' +
    '화장실: 지하1층 관리실 옆\n' +
    '필름: 현관문 뒷면 PS035, 세탁실문 뒷면 중백색\n' +
    '📷 현장사진: https://songil.netlify.app/g/recABC\n' +
    '입니자 사진은 조대리가 찍어줌');
});
test('비번 하나만 있으면 한 줄에 하나', () => {
  const s = full(); s.pwLobby = '';
  const out = Share.buildShare(s, ['pwLobby','pwUnit']);
  assert.strictEqual(out, '[인천 청학동 시대아파트 104동 910호 13평]\n세대: 1234*');
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
