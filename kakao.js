/* 카톡 정리 (2026-10-28 사장님) — 업체 카톡방 대화를 붙여넣으면 클로드/제미나이가 현장별로 앱 칸에 넣을 것만 뽑는다.
   이 파일은 화면·네트워크 없는 순수 함수만 (node 테스트: test/kakao.test.js). 화면은 app.js 의 renderKakao.
   - 카톡방은 거래처 안에 여러 개 (pk디자인: 대표실장방 · 대리방). 방마다 이미 읽은 메시지를 기억해서 같은 대화를 다시 붙여도 새 것만 보낸다
   - 붙여넣는 글 모양: PC 카톡 복사 "[이름] [오전 9:12] 내용" / 휴대폰 내보내기 "2026년 10월 28일 오전 9:12, 이름 : 내용"
     / "2026. 10. 28. 오전 9:12, 이름 : 내용". 날짜 줄("2026년 10월 28일 화요일")은 다음 메시지들의 날짜. 모르는 줄은 앞 메시지에 이어 붙인다 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Kakao = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var pad = function (n) { n = Number(n); return (n < 10 ? '0' : '') + n; };
  var iso = function (y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };
  var DATE_LINE = /^[-=\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*[가-힣]요일)?[-=\s]*$/;
  var PC_LINE = /^\[([^\]]+)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s?(.*)$/;
  var EXPORT_KO = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*([^:]+?)\s:\s(.*)$/;
  var EXPORT_DOT = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*([^:]+?)\s:\s(.*)$/;
  // 입장·나감·사진 같은 알림 줄은 버린다
  var SKIP = /^(사진|동영상|이모티콘|삭제된 메시지입니다\.?|사진 \d+장)$/;

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function parse(text, today) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var out = [], date = today || '', cur = null;
    var push = function (m) { cur = m; out.push(m); };
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (!line.trim()) { if (cur) cur.text += '\n'; return; }
      var m;
      if ((m = DATE_LINE.exec(line))) { date = iso(m[1], m[2], m[3]); cur = null; return; }
      if ((m = PC_LINE.exec(line))) { push({ d: date, t: m[2] + ' ' + m[3] + ':' + m[4], who: m[1].trim(), text: m[5] }); return; }
      if ((m = EXPORT_KO.exec(line) || EXPORT_DOT.exec(line))) {
        date = iso(m[1], m[2], m[3]);
        push({ d: date, t: m[4] + ' ' + m[5] + ':' + m[6], who: m[7].trim(), text: m[8] });
        return;
      }
      if (cur) { cur.text += (cur.text && !/\n$/.test(cur.text) ? '\n' : '') + line; return; }
      push({ d: date, t: '', who: '', text: line });   // 이름·시간 없이 복사한 글
    });
    return out.map(function (m) { return { d: m.d, t: m.t, who: m.who, text: m.text.replace(/\n+$/, '').trim() }; })
      .filter(function (m) { return m.text && !SKIP.test(m.text); })
      .map(function (m) {
        // 이름·시간이 없는 글은 날짜를 빼고 비교한다 (같은 글을 다른 날 다시 붙여도 '이미 읽음')
        m.key = hash((m.t ? m.d + '|' + m.t + '|' : '') + m.who + '|' + m.text);
        return m;
      });
  }

  // 방마다 이미 읽은 키 — 안 읽은 메시지만 돌려준다
  function fresh(msgs, seen) {
    var set = {};
    (seen || []).forEach(function (k) { set[k] = true; });
    var once = {};
    return (msgs || []).filter(function (m) { if (set[m.key] || once[m.key]) return false; once[m.key] = true; return true; });
  }
  var SEEN_MAX = 3000;
  function remember(seen, msgs) {
    var list = (seen || []).concat((msgs || []).map(function (m) { return m.key; }));
    var uniq = [], set = {};
    for (var i = list.length - 1; i >= 0 && uniq.length < SEEN_MAX; i--) if (!set[list[i]]) { set[list[i]] = true; uniq.push(list[i]); }
    return uniq.reverse();
  }

  // 방 목록: 따로 정한 방이 없으면 거래처 담당자 이름마다 한 방
  function rooms(client) {
    var c = client || {};
    var list = Array.isArray(c.kakaoRooms) && c.kakaoRooms.length ? c.kakaoRooms
      : (c.contacts || []).map(function (ct) { return String((ct && ct.name) || '').trim(); }).filter(Boolean);
    var seen = {};
    return list.map(function (n) { return String(n || '').trim(); }).filter(function (n) { if (!n || seen[n]) return false; seen[n] = true; return true; });
  }

  // 앱 칸 이름 (AI 가 돌려주는 field) — 화면에 쓰는 말
  var FIELD_LABEL = { pwLobby: '공동현관 비번', pwUnit: '세대 비번', barrier: '입구차단기', gate: '출입구', carReg: '차량등록',
    parking: '주차', cargoEv: '화물 엘리베이터', toilet: '화장실', startTime: '작업 시작시간' };
  var KIND_LABEL = { field: '', films: '🎞 필름', schedule: '📅 일정', note: '⚠ 특이사항', as: '🛠 AS 요청', other: '💬 기타' };
  var FIELD_ICON = { pwLobby: '🔑', pwUnit: '🔑', barrier: '🚧', gate: '🚗', carReg: '🚗', parking: '🅿️', cargoEv: '🛗', toilet: '🚻', startTime: '⏰' };
  function label(it) { return it.kind === 'field' ? (FIELD_ICON[it.field] || '📝') + ' ' + (FIELD_LABEL[it.field] || it.field) : KIND_LABEL[it.kind] || it.kind; }

  // 필름 반영: 같은 위치(공백·숫자 빼고 비교)는 번호만 바꾸고, 없는 위치는 새 줄
  function mergeFilms(cur, add) {
    var norm = function (p) { return String(p || '').replace(/[\s\d개]+/g, ''); };
    var out = (cur || []).map(function (r) { return Object.assign({}, r); });
    (add || []).forEach(function (f) {
      var at = out.findIndex(function (r) { return norm(r.place) && norm(r.place) === norm(f.place); });
      if (at >= 0) { if (f.code && out[at].code !== f.code) { out[at].code = f.code; out[at].ready = false; out[at].orderedAt = ''; } }
      else out.push({ place: f.place || '', code: f.code || '', ready: false, orderedAt: '' });
    });
    return out;
  }

  // 받은 값이 이미 칸에 있는 값과 같으면 보여줄 필요 없음
  function sameAsSite(it, site) {
    if (!site) return false;
    if (it.kind === 'field') {
      var v = site[it.field];
      if (v && typeof v === 'object') v = v.v;
      return String(v || '').replace(/\s/g, '') === String(it.value || '').replace(/\s/g, '');
    }
    if (it.kind === 'films') {
      var now = JSON.stringify(mergeFilms(site.films, []).map(function (r) { return [r.place, r.code]; }));
      return now === JSON.stringify(mergeFilms(site.films, it.films).map(function (r) { return [r.place, r.code]; }));
    }
    return false;
  }

  // 일정이 비어 있는 날 (AS 날짜 제안) — 일요일 빼고, 현장이 하나도 없는 날
  function freeDays(sites, from, n, addDays) {
    var busy = {};
    (sites || []).forEach(function (s) {
      (s.days || []).forEach(function (d) { if (d && d.date) busy[d.date] = true; });
      (s.services || []).forEach(function (v) { if (v && v.date && !v.done) busy[v.date] = true; });
    });
    var out = [], d = from;
    for (var i = 0; i < 40 && out.length < (n || 3); i++) {
      d = addDays(d, 1);
      var dow = new Date(d + 'T00:00:00').getDay();
      if (dow !== 0 && !busy[d]) out.push(d);
    }
    return out;
  }

  return { parse: parse, fresh: fresh, remember: remember, rooms: rooms, hash: hash, FIELD_LABEL: FIELD_LABEL, label: label,
    mergeFilms: mergeFilms, sameAsSite: sameAsSite, freeDays: freeDays };
});
