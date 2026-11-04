// 🤖 대화형 비서 (boss_chat.js) — 이름·현장·번호는 지어낸 것
const assert = require('assert');
const B = require('../boss_chat.js');

function runWith(replies, execs, more) {
  const asked = [], ran = [];
  const deps = Object.assign({
    hasSite: (id) => id === 's1', userText: '',
    ask: (h) => { asked.push(h); const r = replies.shift(); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); },
    exec: (a) => { ran.push(a); return Promise.resolve(execs ? execs(a) : { ok: true, text: '함' }); },
  }, more || {});
  return B.run([{ role: 'user', text: '지시' }], deps).then((r) => ({ r, asked, ran }));
}

(async () => {
  // 대화만: 실행 없이 답
  let t = await runWith([{ ok: true, say: '2곳이에요', actions: [], chips: ['더 보기'] }]);
  assert.deepStrictEqual([t.r.say, t.r.chips, t.ran.length], ['2곳이에요', ['더 보기'], 0]);

  // 실행 → 결과를 AI 에게 돌려줌 → 진짜 결과로 답. 첫 답의 say 는 쓰지 않는다
  t = await runWith([
    { ok: true, say: '했어요(미리 한 말)', actions: [{ tool: 'mark_paid', siteId: 's1' }] },
    { ok: true, say: '잔금 표시했어요', actions: [] },
  ]);
  assert.strictEqual(t.r.say, '잔금 표시했어요');
  assert.strictEqual(t.ran.length, 1);
  assert.ok(t.asked[1].some((m) => m.role === 'tool' && m.text.includes('"ok":true')));

  // 없는 현장·모르는 도구는 실행 안 하고 실패로 돌려줌
  t = await runWith([
    { ok: true, actions: [{ tool: 'mark_paid', siteId: 'zz' }, { tool: 'delete_all' }] },
    { ok: true, say: '못 찾았어요', actions: [] },
  ]);
  assert.strictEqual(t.ran.length, 0);
  assert.deepStrictEqual(t.r.results.map((x) => x.ok), [false, false]);

  // 3명까지는 바로, 4명부터는 확인 뒤 — 실행하지 않고 pending
  const three = { tool: 'send_text', names: ['가', '나', '다'], text: '안녕' };
  const four = { tool: 'send_text', names: ['가', '나', '다', '라'], text: '안녕' };
  t = await runWith([{ ok: true, actions: [three] }, { ok: true, say: '보냈어요', actions: [] }]);
  assert.deepStrictEqual([t.ran.length, t.r.pending.length], [1, 0]);
  t = await runWith([{ ok: true, actions: [four] }, { ok: true, say: '네 분께 보낼까요?', actions: [] }]);
  assert.deepStrictEqual([t.ran.length, t.r.pending], [0, [four]]);
  assert.strictEqual(t.r.results[0].waiting, true);

  // 같은 일을 또 시켜도 한 번만 (문자 두 번 방지)
  t = await runWith([{ ok: true, actions: [three] }, { ok: true, actions: [three] }, { ok: true, say: '끝', actions: [] }]);
  assert.strictEqual(t.ran.length, 1);

  // 번호 저장: 사장님이 쓴 글에 있는 번호만
  assert.strictEqual(B.check({ tool: 'save_phone', name: '가', phone: '010-0000-0000' }, { userText: '번호 01000000000', hasSite: () => false }), '');
  assert.ok(B.check({ tool: 'save_phone', name: '가', phone: '010-1111-1111' }, { userText: '번호 01000000000', hasSite: () => false }));

  // 안 하고 했다고 하면 되묻고, 그래도 그러면 사실을 앞에 붙임
  t = await runWith([{ ok: true, say: '문자 보냈어요', actions: [] }, { ok: true, say: '문자 보냈어요', actions: [] }]);
  assert.ok(t.r.say.startsWith('⚠️ 실제로 처리된 건 없어요'));
  t = await runWith([{ ok: true, say: '문자 보냈어요', actions: [] }, { ok: true, say: '번호가 없어 못 보내요', actions: [] }]);
  assert.strictEqual(t.r.say, '번호가 없어 못 보내요');

  // 일부만 나간 문자: 되묻지 않고, 누가 못 받았는지 AI 에게 알림
  t = await runWith([{ ok: true, actions: [three] }, { ok: true, say: '한 분만 보냈어요', actions: [] }],
    () => ({ ok: false, partial: true, people: [{ name: '가', ok: true }, { name: '나', ok: false, why: '번호 없음' }] }));
  assert.strictEqual(t.r.say, '한 분만 보냈어요');
  assert.ok(t.asked[1].some((m) => m.text.includes('번호 없음')));
  // 못 보냈다는 말은 '했다' 는 말이 아니다
  t = await runWith([{ ok: true, say: '번호가 없어 못 보냈어요', actions: [] }]);
  assert.strictEqual(t.asked.length, 1);

  // 말로 시킨 때는 문자 한 명이라도 확인 뒤에
  t = await runWith([{ ok: true, actions: [{ tool: 'send_text', names: ['가'], text: '안녕' }] }, { ok: true, say: '보낼까요?', actions: [] }], null, { confirmSms: true });
  assert.deepStrictEqual([t.ran.length, t.r.pending.length], [0, 1]);

  // 말 끝 '시작해'
  assert.deepStrictEqual(B.goWord('미래타운 세대비번 2222 시작해.'), { text: '미래타운 세대비번 2222', go: true });
  assert.deepStrictEqual(B.goWord('응 시작해요'), { text: '응', go: true });
  assert.deepStrictEqual(B.goWord('시작 해 주세요'), { text: '', go: true });
  assert.strictEqual(B.goWord('시작해야 할 현장 어디야').go, false);
  assert.strictEqual(B.goWord('작업 시작').go, false);
  assert.strictEqual(B.goWord('개시작해').go, false);
  // 문자 확인 말
  assert.deepStrictEqual(['응', '네.', '보내줘', '아니요', '취소', '그래 그런데 내일 보내'].map(B.confirmWord), ['yes', 'yes', 'yes', 'no', 'no', '']);
  assert.strictEqual(B.speakable('👍 바꿨어요 ⚠️ 하늘 · 푸른'), '바꿨어요 하늘 , 푸른');

  assert.strictEqual(B.confirmWord('보내 보내'), 'yes');
  // 내역 줄: 이미 그대로인 일·기다리는 일은 안 적음, 예전 내역은 비번 값 빼고
  assert.deepStrictEqual(B.logItems([{ logs: [{ kind: 'sms', title: '문자' }] }, { same: true, logs: [{ title: 'x' }] }, { waiting: true }]), [{ src: 'me', kind: 'sms', title: '문자' }]);
  const olds = B.oldLogItems([{ id: 'o1', at: '2026-11-04T00:00:00Z', state: 'done', siteName: '하늘', f: { kind: 'field', label: '세대 비번', value: '7777' } }, { id: 'o2', state: 'none' }],
    [{ id: 'm1', at: '2026-11-04T00:00:00Z', cards: [{ ok: true, text: '🔑 하늘 세대 비번: 1111 → 7777' }, { ok: false, text: '실패' }, { ok: true, text: '📨 마바님께 문자 보냄' }] }]);
  assert.deepStrictEqual(olds.map((x) => x.title), ['세대 비번 바꿈', '하늘 세대 비번', '마바님께 문자 보냄']);
  assert.ok(!JSON.stringify(olds).includes('7777'));

  // 11/5 실제 일: 한 줄 시켰는데 AI 가 글만 바꿔 카톡을 3번 — 한 번만 나가고, AI 에게 이미 했다고 알림
  t = await runWith([
    { ok: true, actions: [{ tool: 'send_kakao', client: '가', room: '', text: '일정 A' }] },
    { ok: true, actions: [{ tool: 'send_kakao', client: '가', room: '가', text: '일정 B' }] },
    { ok: true, actions: [{ tool: 'send_kakao', client: '가', room: '가', text: '일정 C' }] },
    { ok: true, say: '곧 보내요', actions: [] }]);
  assert.deepStrictEqual(t.ran.map((a) => a.text), ['일정 A']);
  assert.strictEqual(t.r.say, '곧 보내요');
  assert.ok(t.r.results[1].same && t.r.results[2].same);
  // 다른 방은 나감, 한 답 안의 서로 다른 글은 나감
  t = await runWith([{ ok: true, actions: [{ tool: 'send_kakao', client: '가', text: '1' }, { tool: 'send_kakao', client: '나', text: '2' }, { tool: 'send_kakao', client: '가', text: '3' }] }, { ok: true, say: '끝', actions: [] }]);
  assert.strictEqual(t.ran.length, 3);
  // 문자: 이미 보낸 사람은 빼고 새 사람에게만
  t = await runWith([{ ok: true, actions: [{ tool: 'send_text', names: ['가'], text: '1' }] }, { ok: true, actions: [{ tool: 'send_text', names: ['가', '나'], text: '2' }] }, { ok: true, say: '끝', actions: [] }]);
  assert.deepStrictEqual(t.ran.map((a) => a.names), [['가'], ['나']]);
  // 확인을 기다리는 말로 시킨 카톡도 하나만
  t = await runWith([{ ok: true, actions: [{ tool: 'send_kakao', client: '가', text: 'A' }] }, { ok: true, actions: [{ tool: 'send_kakao', client: '가', text: 'B' }] }, { ok: true, say: '보낼까요?', actions: [] }], null, { confirmSms: true });
  assert.strictEqual(t.r.pending.length, 1);

  // 개인고객 이름으로 찾기·보기 (번호는 안 넘김)
  const pc = B.buildContext({ today: '2026-11-04', sites: [{ id: 's1', name: '하늘', date: '2026-11-05', owners: [{ name: '이다라', phone: '010-0000-0002' }] }], settings: {} });
  assert.deepStrictEqual(pc.sites[0].customer, ['이다라']);
  assert.deepStrictEqual(B.findSites([{ id: 's1', name: '하늘', owners: [{ name: '이다라' }] }], [], '이다라').map((s) => s.id), ['s1']);

  // AI 연결 실패: 처음이면 아무것도 안 함, 실행 뒤면 결과는 남기고 다시 실행 안 함
  t = await runWith([new Error('네트워크')]);
  assert.strictEqual(t.r.failed, true);
  assert.ok(t.r.say.includes('아무것도 처리하지 않았어요'));
  t = await runWith([{ ok: true, actions: [{ tool: 'mark_paid', siteId: 's1' }] }, new Error('네트워크')]);
  assert.deepStrictEqual([t.r.failed, t.ran.length, t.r.results[0].ok], [true, 1, true]);

  // 끝없이 시키면 멈춤
  const many = [0, 1, 2, 3, 4, 5].map((i) => ({ ok: true, actions: [{ tool: 'mark_paid', siteId: 's1', n: i }] }));
  t = await runWith(many);
  assert.strictEqual(t.ran.length, 4);
  assert.ok(t.r.say.includes('여기까지만'));

  // 상태 요약: 고객 번호 없음, 팀원 번호는 있고 없고만, 먼 현장 빠짐
  const ctx = B.buildContext({ today: '2026-11-04', clients: [{ id: 'c', name: '가나' }],
    sites: [{ id: 's1', clientId: 'c', name: '하늘', date: '2026-11-05', custPhone: '01012345678', days: [{ date: '2026-11-05', staff: ['가'] }] },
      { id: 's2', clientId: 'c', name: '옛날', date: '2026-01-01' }],
    settings: { team: ['가', '나'], people: { 가: { phone: '010-0000-0000' } } }, tasks: [{ title: '끝', done: true }, { title: '남음', date: '2026-11-05' }] });
  assert.deepStrictEqual(ctx.sites.map((s) => s.id), ['s1']);
  assert.ok(!JSON.stringify(ctx).includes('01012345678') && !JSON.stringify(ctx).includes('010-0000-0000'));
  assert.deepStrictEqual(ctx.team, [{ name: '가', phone: true }, { name: '나', phone: false }]);
  assert.deepStrictEqual(ctx.tasks, [{ title: '남음', date: '2026-11-05' }]);
  assert.deepStrictEqual(B.findSites([{ id: 's2', clientId: 'c', name: '옛날 아파트' }], [{ id: 'c', name: '가나' }], '가나 옛날').map((s) => s.id), ['s2']);

  // 대화 → AI 대화: 한 일을 undoId 와 함께
  const h = B.toHistory([{ role: 'me', text: '바꿔' }, { role: 'ai', text: '했어요', cards: [{ ok: true, text: '세대 비번', undoId: 'u1' }] }]);
  assert.strictEqual(h[1].role, 'assistant');
  assert.ok(h[1].text.includes('undoId u1'));
  // 📇 업체 연락처 (11/4): 거래처 담당자 + 현장 발주처 담당자 → 이름표, AI 에게는 번호 대신 있고 없고만
(function () {
  var o = { today: '2026-11-04', settings: { team: ['윤인재'], people: {} },
    clients: [{ id: 'c1', name: '지인인테리어', contacts: [{ name: '김사장', phone: '010-1234-5678' }, { name: '', phone: '' }] }, { id: 'c2', name: '빈업체', contacts: [] }],
    sites: [{ id: 's1', clientId: 'c1', name: '벨루가 1층', date: '2026-11-07', owners: [{ name: '', role: '현장소장', phone: '01099998888' }] }] };
  var book = B.contactBook(o);
  assert.deepStrictEqual(book.map(function (c) { return [c.name, c.phone]; }), [['지인인테리어 김사장', '01012345678'], ['벨루가 1층 현장소장', '01099998888']]);
  var ctx = B.buildContext(o);
  assert.deepStrictEqual(ctx.contacts[0], { name: '지인인테리어 김사장', client: '지인인테리어', kind: '업체', phone: true });
  assert.ok(JSON.stringify(ctx).indexOf('1234') === -1, '번호는 AI 에게 안 감');
  assert.deepStrictEqual(ctx.noContact, ['빈업체']);
  assert.strictEqual(B.check({ tool: 'send_text', names: ['지인인테리어 김사장'], text: '토요일 현장 필름 번호 알려주세요' }, { hasSite: function () { return false; } }), '');
})();
console.log('boss_chat ok');
})().catch((e) => { console.error(e); process.exit(1); });  // 💬 카톡 (11/4): 거래처나 방 + 글, 말로 시키면 먼저 묻기
  assert.strictEqual(B.check({ tool: 'send_kakao', client: '류춘화', text: '좋은 하루 되세요' }, { hasSite: () => false }), '');
  assert.ok(B.check({ tool: 'send_kakao', text: '좋은 하루' }, { hasSite: () => false }));
  assert.strictEqual(B.needsConfirm({ tool: 'send_kakao', client: '류춘화', text: 'x' }, false), false);
  assert.strictEqual(B.needsConfirm({ tool: 'send_kakao', client: '류춘화', text: 'x' }, true), true);

