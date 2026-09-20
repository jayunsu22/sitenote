// share.js — 순수 함수 모음 (화면·저장소에 의존하지 않음)
// 현장 항목 정의, 빈값 판정, 업자 질문/팀원 공유 문구 생성, 정렬, 색상 순환, 동기화 큐 병합
// 브라우저에서는 전역 Share, node에서는 module.exports 로 노출
(function (root) {
  'use strict';

  // 항목 정의 — 화면 순서 = 배열 순서 = 문구 출력 순서
  // type: text | date | select | films | link | multiline
  // question: 값이 비어있을 때 업자에게 보낼 기본 질문 문구
  //           (name/photoUrl/memo 는 우리가 채우는 칸이라 질문 대상 아님)
  var FIELDS = [
    // 동/호수·평형 칸은 뺐다(2026-09-17). '군포 우륵아파트 704동 606호' 처럼
    // 현장명에 같이 적는 게 빠르다. 예전에 저장한 값은 titleLine 이 그대로 붙여준다.
    // 현장주소 칸도 뺐다(2026-09-17). 네비에 직접 넣는 게 빠르다.
    { key: 'name',    label: '현장명',        type: 'text' },
    // 시공날짜: 달력에서 여러 날을 고를 수 있다(1일차, 2일차…). 값은 첫날(days[0].date)이고 전체는 site.days 에 있다
    { key: 'date',    label: '시공날짜',      type: 'date',   question: '시공 날짜 언제인가요?' },
    { key: 'pwLobby', label: '공동현관 비번', type: 'text',   question: '공동현관 비번 알려주세요' },
    { key: 'pwUnit',  label: '세대 비번',     type: 'text',   question: '세대 현관 비번 알려주세요' },
    { key: 'gate',    label: '출입구',        type: 'text',   question: '방문객 차량 출입구가 따로 있나요?' },
    { key: 'carReg',  label: '차량등록',      type: 'select', question: '출입 시 차량등록이 필요한가요?',
      options: ['미확인', '필요', '불필요'], shareLabel: '차량등록' },
    { key: 'parking', label: '주차',          type: 'text',   question: '주차는 어디에 하면 되나요?' },
    { key: 'cargoEv', label: '화물 엘리베이터', type: 'select', question: '짐 옮길 때 화물 엘리베이터 사용해야 하나요?',
      options: ['미확인', '사용', '일반사용'], shareLabel: '화물EV' },
    { key: 'toilet',  label: '화장실',        type: 'text',   question: '화장실 사용할 곳 위치 알려주세요' },
    // 특이사항 전달 - 팀원에게 꼭 알려줄 주의점("앞집이 예민함, 조심조심 들어올 것").
    // 우리가 채우는 칸이라 question 없음. 공유 문구에는 ⚠ 붙여서 나감.
    { key: 'note',    label: '특이사항 전달', type: 'multiline', shareLabel: '⚠ 특이사항',
      placeholder: '팀원에게 전달할 주의점 (예: 앞집이 예민함, 조심조심 들어올 것)' },
    { key: 'films',   label: '필름/시공위치', type: 'films',  question: '시공 위치별 필름 번호 알려주세요' },
    // 현장사진 링크 - 블로그자동화(현장 품질관리)에서 뽑은 사진 갤러리 주소를 붙여넣는 칸.
    // 업자에게 물어볼 항목이 아니라 우리가 채우는 칸이라 question 이 없다.
    { key: 'photoUrl', label: '현장사진',     type: 'link' },
    { key: 'memo',    label: '메모',          type: 'multiline' }
  ];

  var FIELD_MAP = {};
  FIELDS.forEach(function (f) { FIELD_MAP[f.key] = f; });

  var DEFAULT_QUESTIONS = {};
  FIELDS.forEach(function (f) { if (f.question) DEFAULT_QUESTIONS[f.key] = f.question; });

  var COLOR_COUNT = 8;

  // 사진(명함·단가표 등) — 저장 전 자동 축소 기준
  // 단가표 숫자가 읽히려면 해상도가 중요하므로 품질보다 픽셀을 먼저 지킨다.
  var PHOTO_MAX_BYTES = 600 * 1024;  // 원본 보관 한도
  var PHOTO_MAX_DIM = 2000;          // 긴 변 기준 픽셀
  var PHOTO_MIN_DIM = 1000;          // 용량이 안 맞아도 여기보다 작게는 안 줄인다
  // 목록 격자에 쓰는 작은 그림 — 폰 저장소(localStorage)와 Airtable 한 칸에 그대로 들어간다
  var PHOTO_THUMB_DIM = 400;
  var PHOTO_THUMB_BYTES = 40 * 1024;
  // Airtable 롱텍스트 한 칸은 10만자 한도 → 원본 base64 는 이 크기로 잘라 여러 행에 나눠 백업
  var PHOTO_CHUNK = 90000;

  // 긴 문자열을 size 글자씩 자름
  function splitChunks(str, size) {
    var out = [];
    str = String(str || '');
    for (var i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
    return out;
  }
  // 조각 행([{i, chunk}])을 순서대로 붙여 원래 문자열로. 빠진 번호가 있으면 '' (불완전한 백업은 버림)
  function joinChunks(rows) {
    var list = (rows || []).slice().sort(function (a, b) { return (a.i || 0) - (b.i || 0); });
    for (var i = 0; i < list.length; i++) if ((list[i].i || 0) !== i) return '';
    return list.map(function (r) { return r.chunk || ''; }).join('');
  }

  // 'data:image/jpeg;base64,...' 의 실제 바이트 수
  function dataUrlBytes(url) {
    var i = String(url || '').indexOf(',');
    if (i < 0) return 0;
    var b64 = url.slice(i + 1);
    var pad = b64.slice(-2) === '==' ? 2 : b64.slice(-1) === '=' ? 1 : 0;
    return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
  }

  // 이미지 data URL 인지 확인 (복원 데이터에 엉뚱한 값이 와도 <img> 에 넣지 않도록)
  function isImageDataUrl(url) {
    return /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(String(url || ''));
  }

  // 파일 크기 표기 (12KB / 1.2MB)
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + 'KB';
    return (n / 1024 / 1024).toFixed(1) + 'MB';
  }

  function str(v) { return (v == null ? '' : String(v)).trim(); }

  // 붙여넣은 링크를 눌러서 열 수 있는 주소로. 주소창에서 복사하면 http(s) 가 빠지는 경우가
  // 많은데, 그대로 카톡에 보내면 링크로 안 잡히는 일이 있어 없으면 https:// 를 붙인다.
  function linkUrl(v) {
    var u = str(v);
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, '');
  }

  // 비어있음 판정: 텍스트는 공백 제거 후 빈 문자열, 선택형은 '미확인', films는 코드가 있는 줄이 하나도 없음
  function isEmpty(site, key) {
    var f = FIELD_MAP[key];
    if (!f || !site) return true;
    var v = site[key];
    if (f.type === 'select') return !v || str(v.v) === '' || v.v === '미확인';
    if (f.type === 'films') return !Array.isArray(v) || !v.some(function (r) { return r && str(r.code) !== ''; });
    return str(v) === '';
  }

  // 제목 줄: 현장명 동호수 평형 (빈 것 생략)
  // 동/호수·평형 칸이 없어진 뒤로는 현장명에 같이 적으므로, 현장명에 이미 들어있는 값은 다시 붙이지 않는다
  // (예전 데이터: unit='2동 501호' + 새로 적은 name='… 2동 501호' → 두 번 나오던 문제)
  function titleLine(site) {
    var name = str(site.name);
    var squash = function (s) { return s.replace(/\s+/g, ''); };
    var parts = [name];
    [str(site.unit), str(site.size)].forEach(function (v) {
      if (v && squash(name).indexOf(squash(v)) === -1) parts.push(v);
    });
    parts = parts.filter(Boolean);
    return parts.length ? parts.join(' ') : '(이름없음)';
  }

  // 필름 번호만 한 줄에 하나씩. 대리점에 주문할 때 붙여넣는 용도라 시공위치는 뺀다.
  // 같은 번호가 여러 줄이면 한 번만(주문은 품목 목록이지 시공 목록이 아니다).
  function filmOrderText(site) {
    var seen = {};
    return ((site && site.films) || [])
      .map(function (r) { return r ? str(r.code) : ''; })
      .filter(function (c) { if (!c || seen[c]) return false; seen[c] = true; return true; })
      .join('\n');
  }

  // 'YYYY-MM-DD' → 'M/D'
  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso));
    if (!m) return str(iso);
    return parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
  }

  // FIELDS 순서대로, 선택된 키만 남김
  function orderedKeys(keys) {
    var set = {};
    (keys || []).forEach(function (k) { set[k] = true; });
    return FIELDS.map(function (f) { return f.key; }).filter(function (k) { return set[k]; });
  }

  // 업자에게 질문: 선택된 키 중 비어있는 항목의 질문 문구만. 질문할 게 없으면 ''
  function buildQuestion(site, keys, questions) {
    var q = questions || DEFAULT_QUESTIONS;
    var lines = orderedKeys(keys)
      // 질문 문구가 정의된 항목만 (name/note/photoUrl/memo 처럼 우리가 채우는 칸은 제외)
      .filter(function (k) { return DEFAULT_QUESTIONS[k] && isEmpty(site, k); })
      .map(function (k) { return '- ' + (str(q[k]) || DEFAULT_QUESTIONS[k]); });
    if (!lines.length) return '';
    return '[' + titleLine(site) + ']\n' + lines.join('\n');
  }

  function selectLine(f, v) {
    var memo = str(v.memo);
    return f.shareLabel + ' ' + v.v + (memo ? ' (' + memo + ')' : '');
  }

  // 팀원에게 공유: 선택된 키 중 채워진 항목만. 제목 줄은 항상 포함(날짜는 date 선택 시 제목 줄 뒤에)
  function buildShare(site, keys) {
    var ks = orderedKeys(keys).filter(function (k) { return !isEmpty(site, k); });
    var has = {};
    ks.forEach(function (k) { has[k] = true; });

    var head = '[' + titleLine(site) + ']' + (has.date ? ' ' + datesLine(site) : '');
    var lines = [head];
    var staff = staffLine(site); // 날짜별 인원 - 체크 여부와 상관없이 있으면 나간다
    if (staff) lines.push(staff);
    var short = staffShortLine(site); // 필요 인원을 못 채운 날이 있으면 바로 아래에 경고 줄
    if (short) lines.push(short);

    if (has.address) lines.push('📍 ' + str(site.address));
    if (has.pwLobby) lines.push('공동현관비번: ' + str(site.pwLobby));
    if (has.pwUnit) lines.push('세대비번: ' + str(site.pwUnit));
    if (has.gate) lines.push('출입: ' + str(site.gate));
    if (has.carReg) lines.push(selectLine(FIELD_MAP.carReg, site.carReg));
    if (has.parking) lines.push('주차: ' + str(site.parking));
    if (has.cargoEv) lines.push(selectLine(FIELD_MAP.cargoEv, site.cargoEv));
    if (has.toilet) lines.push('화장실: ' + str(site.toilet));
    if (has.note) lines.push(FIELD_MAP.note.shareLabel + ': ' + str(site.note));
    if (has.films) {
      var fl = site.films
        .filter(function (r) { return r && str(r.code) !== ''; })
        .map(function (r) { return [str(r.place), str(r.code)].filter(Boolean).join(' '); });
      lines.push('필름: ' + fl.join(', '));
    }
    if (has.photoUrl) lines.push('📷 현장사진: ' + linkUrl(site.photoUrl));
    if (has.memo) lines.push(str(site.memo));
    return lines.join('\n');
  }

  // ---------- 일정 (날짜별 인원·준비 상태) ----------
  // 날짜는 전부 'YYYY-MM-DD' 문자열, 폰 로컬 시간 기준. Date 객체는 계산할 때만 잠깐 쓴다.
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function isIsoDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v));
    if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isoOf(d) === m[0]; // 2026-02-30 같은 건 3월로 넘어가서 걸러짐
  }
  function todayIso(now) { return isoOf(now || new Date()); }
  function addDays(iso, n) {
    if (!isIsoDate(iso)) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return isoOf(new Date(+m[1], +m[2] - 1, +m[3] + n));
  }
  function dayDiff(a, b) { // b - a (일)
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((new Date(+pb[0], +pb[1] - 1, +pb[2]) - new Date(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
  }
  function normName(v) { return str(v).replace(/\s+/g, ''); }
  function staffOf(day) { return ((day && day.staff) || []).map(str).filter(Boolean); }

  // 시작날짜를 옮기면 2일차 이후도 같은 일수만큼 민다. 원본은 건드리지 않고 새 배열.
  // days 가 비었으면 1일차 한 줄을 만든다. 시작을 지우면(newStart='') 1일차만 비우고 나머지는 둔다.
  function shiftDays(days, newStart) {
    var src = Array.isArray(days) ? days : [];
    if (!src.length) return [{ date: str(newStart), staff: [] }];
    var oldStart = str(src[0].date), ns = str(newStart);
    var delta = (isIsoDate(oldStart) && isIsoDate(ns)) ? dayDiff(oldStart, ns) : null;
    return src.map(function (d, i) {
      var date = str(d.date);
      if (i === 0) date = ns;
      else if (delta !== null && isIsoDate(date)) date = addDays(date, delta);
      return { date: date, staff: staffOf(d).slice() };
    });
  }

  // days 가 없는 구버전 현장은 시작날짜 하나짜리로 본다
  function daysOf(site) {
    if (site && Array.isArray(site.days) && site.days.length) return site.days;
    return [{ date: str(site && site.date), staff: [] }];
  }

  // 일정 화면용: from 부터 count 일은 현장이 없어도 줄을 만들고, 그 뒤는 later 로 따로 (있는 날만)
  // from 이전은 past 로 (있는 날만, 최근 날짜가 먼저). 날짜가 아닌 줄은 버린다. 같은 날 안에서는 현장 생성순.
  function groupByDate(sites, from, count) {
    var byDate = {};
    (sites || []).slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }).forEach(function (s) {
      var ds = daysOf(s);
      ds.forEach(function (d, i) {
        var date = str(d.date);
        if (!isIsoDate(date)) return;
        (byDate[date] = byDate[date] || []).push({ site: s, dayIndex: i, dayCount: ds.length });
      });
    });
    var days = [], later = [], laterCount = 0, past = [], pastCount = 0, end = addDays(from, count - 1);
    for (var i = 0; i < count; i++) {
      var iso = addDays(from, i);
      days.push({ date: iso, entries: byDate[iso] || [] });
    }
    Object.keys(byDate).sort().forEach(function (date) {
      if (date < from) { past.unshift({ date: date, entries: byDate[date] }); pastCount += byDate[date].length; return; }
      if (date <= end) return;
      later.push({ date: date, entries: byDate[date] });
      laterCount += byDate[date].length;
    });
    return { days: days, later: later, laterCount: laterCount, past: past, pastCount: pastCount };
  }

  // 같은 날 서로 다른 현장에 같은 이름(공백 무시)이 있으면 {date: {이름: 현장수}} — 2 이상만
  function findOverlaps(sites) {
    var seen = {}; // date -> name -> {siteId: true}
    (sites || []).forEach(function (s) {
      daysOf(s).forEach(function (d) {
        var date = str(d.date);
        if (!isIsoDate(date)) return;
        staffOf(d).forEach(function (n) {
          var k = normName(n);
          var m = (seen[date] = seen[date] || {});
          (m[k] = m[k] || {})[s.id] = true;
        });
      });
    });
    var out = {};
    Object.keys(seen).forEach(function (date) {
      Object.keys(seen[date]).forEach(function (k) {
        var n = Object.keys(seen[date][k]).length;
        if (n >= 2) (out[date] = out[date] || {})[k] = n;
      });
    });
    return out;
  }

  // ---------- 총 필요 인원 (2026-09-20) ----------
  // 현장마다 '이 일을 하려면 총 몇 명이 필요한가'를 하나 정해두고, 날짜별로 몇 명 배치했는지 견준다.
  // 0 = 아직 안 정함 (예전에 만든 현장은 전부 0 이라 예전처럼 동작한다)
  var MAX_NEED_STAFF = 99;
  function needStaffOf(site) {
    var n = parseInt(site && site.needStaff, 10);
    if (!(n > 0)) return 0;
    return Math.min(n, MAX_NEED_STAFF);
  }
  // 그날 배치 현황 — have 배치된 수, need 필요 인원(0이면 안 정함), short 모자란 수, over 넘친 수,
  // ok 채웠는지(필요 인원을 안 정했으면 한 명이라도 있으면 ok)
  function staffStatus(site, dayIndex) {
    var have = staffOf(daysOf(site)[dayIndex]).length, need = needStaffOf(site);
    return {
      have: have, need: need,
      short: need ? Math.max(0, need - have) : 0,
      over: need ? Math.max(0, have - need) : 0,
      ok: need ? have >= need : have > 0
    };
  }
  // 배치/필요 표기 — 필요 인원을 정했으면 '2/3', 아니면 '2명' (아무도 없으면 '미배정')
  function staffCountLabel(site, dayIndex) {
    var st = staffStatus(site, dayIndex);
    if (st.need) return st.have + '/' + st.need;
    return st.have ? st.have + '명' : '미배정';
  }
  // 인원이 모자란 날 [{index, date, have, need, short}] — 필요 인원을 안 정했으면 빈 배열
  function shortStaffDays(site) {
    if (!needStaffOf(site)) return [];
    return daysOf(site).map(function (d, i) {
      var st = staffStatus(site, i);
      return st.short ? { index: i, date: str(d.date), have: st.have, need: st.need, short: st.short } : null;
    }).filter(Boolean);
  }

  // 필름 준비 단계 (2026-09-20): 현장마다 하나. 수령(3)이 아니면 일정 화면에서 빨갛게 깜빡인다
  var FILM_STAGES = ['필름 미확정', '필름 확정', '필름 주문', '필름 수령'];
  function filmStageOf(site) {
    var k = parseInt(site && site.filmStage, 10);
    return (k >= 0 && k < FILM_STAGES.length) ? k : 0;
  }
  // 시공일이 3일 안(오늘·지난 날 포함)이면 '급함' — 이때만 미완료 단계가 깜빡인다. 그 전엔 빨간색만
  var URGENT_DAYS = 3;
  function isUrgent(dateIso, today) {
    if (!isIsoDate(dateIso)) return false;
    return dayDiff(today || todayIso(), dateIso) <= URGENT_DAYS;
  }
  // 준비 카운트: 필름은 번호가 빈 줄 제외
  function readyCount(site) {
    var films = ((site && site.films) || []).filter(function (r) { return r && str(r.code) !== ''; });
    var sup = (site && site.supplies) || [];
    var n = function (arr) { return arr.filter(function (r) { return r && r.ready; }).length; };
    return { films: [n(films), films.length], supplies: [n(sup), sup.length] };
  }
  // 필름·부자재 전부 체크(없으면 통과) + 인원이 한 명이라도 있어야 준비 완료
  // 필름 단계가 '수령'이어야 준비 완료로 본다 (필름이 제 날짜에 없으면 공치는 일이라 가장 중요)
  // 필요 인원을 정해둔 현장은 날마다 그 수를 채워야 준비 완료 (한 명이라도 모자라면 빨간 점)
  function isReady(site) {
    if (filmStageOf(site) !== FILM_STAGES.length - 1) return false;
    var c = readyCount(site);
    if (c.films[0] !== c.films[1] || c.supplies[0] !== c.supplies[1]) return false;
    if (needStaffOf(site)) return !shortStaffDays(site).length;
    return daysOf(site).some(function (d) { return staffOf(d).length > 0; });
  }

  // 시공날짜 요약: 하루면 '9/18', 여러 날이면 '9/18, 9/19, 9/21'
  function datesLine(site) {
    var ds = daysOf(site).map(function (d) { return str(d.date); }).filter(isIsoDate);
    if (!ds.length) return shortDate(site && site.date);
    return ds.map(shortDate).join(', ');
  }
  // 달력 격자: 그 달의 주 단위 배열. 칸은 'YYYY-MM-DD' 또는 null(빈 칸). 일요일 시작
  function monthGrid(year, month) { // month: 1~12
    var first = new Date(year, month - 1, 1);
    var last = new Date(year, month, 0).getDate();
    var weeks = [], row = [];
    for (var i = 0; i < first.getDay(); i++) row.push(null);
    for (var d = 1; d <= last; d++) {
      row.push(year + '-' + pad2(month) + '-' + pad2(d));
      if (row.length === 7) { weeks.push(row); row = []; }
    }
    if (row.length) { while (row.length < 7) row.push(null); weeks.push(row); }
    return weeks;
  }
  // 팀원 공유용 인원 줄. 하루면 '👤 김기사·박기사', 여러 날이면 '👤 9/19 김기사·박기사 / 9/20 김기사'
  // 필요 인원을 정해뒀으면 앞에 '필요 3명 —' 이 붙는다. 인원이 빈 날은 건너뛰고, 전부 비면 ''
  // (필요 인원만 정하고 아무도 안 넣었으면 '👤 필요 3명 — 아직 미배정')
  function staffLine(site) {
    var need = needStaffOf(site);
    var head = '👤 ' + (need ? '필요 ' + need + '명 — ' : '');
    var ds = daysOf(site).filter(function (d) { return staffOf(d).length; });
    if (!ds.length) return need ? head + '아직 미배정' : '';
    if (daysOf(site).length === 1) return head + staffOf(ds[0]).join('·');
    return head + ds.map(function (d) { return shortDate(d.date) + ' ' + staffOf(d).join('·'); }).join(' / ');
  }
  // 팀원 공유용 부족 인원 줄 — '⚠ 인원 부족: 9/19 2/3(1명), 9/20 0/3(3명)'. 모자란 날이 없으면 ''
  function staffShortLine(site) {
    var rows = shortStaffDays(site);
    if (!rows.length) return '';
    return '⚠ 인원 부족: ' + rows.map(function (r) {
      return (r.date ? shortDate(r.date) + ' ' : (r.index + 1) + '일차 ') + r.have + '/' + r.need + '(' + r.short + '명)';
    }).join(', ');
  }

  // 날짜 없는 현장 먼저(미정), 그 다음 날짜 오름차순, 동률은 최근 생성 우선. 원본 유지
  function sortSites(sites) {
    return sites.slice().sort(function (a, b) {
      var da = str(a.date), db = str(b.date);
      if (!da && db) return -1;
      if (da && !db) return 1;
      if (da !== db) return da < db ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  // 새 현장 색: 해당 거래처의 현장 수 mod 8
  function nextColor(sites, clientId) {
    var n = sites.filter(function (s) { return s.clientId === clientId; }).length;
    return n % COLOR_COUNT;
  }

  // 동기화 큐 병합: 같은 type+id 는 마지막 op 로 교체 (delete 도 이전 upsert 를 지우고 뒤에 붙음). 원본 유지
  function mergeQueue(queue, op) {
    var out = (queue || []).filter(function (o) { return !(o.type === op.type && o.id === op.id); });
    out.push(op);
    return out;
  }

  var Share = {
    FIELDS: FIELDS,
    linkUrl: linkUrl,
    FIELD_MAP: FIELD_MAP,
    DEFAULT_QUESTIONS: DEFAULT_QUESTIONS,
    COLOR_COUNT: COLOR_COUNT,
    PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
    PHOTO_MAX_DIM: PHOTO_MAX_DIM,
    PHOTO_MIN_DIM: PHOTO_MIN_DIM,
    PHOTO_THUMB_DIM: PHOTO_THUMB_DIM,
    PHOTO_THUMB_BYTES: PHOTO_THUMB_BYTES,
    PHOTO_CHUNK: PHOTO_CHUNK,
    splitChunks: splitChunks,
    joinChunks: joinChunks,
    dataUrlBytes: dataUrlBytes,
    isImageDataUrl: isImageDataUrl,
    fmtBytes: fmtBytes,
    isEmpty: isEmpty,
    titleLine: titleLine,
    filmOrderText: filmOrderText,
    shortDate: shortDate,
    buildQuestion: buildQuestion,
    buildShare: buildShare,
    sortSites: sortSites,
    nextColor: nextColor,
    mergeQueue: mergeQueue,
    isIsoDate: isIsoDate,
    todayIso: todayIso,
    addDays: addDays,
    shiftDays: shiftDays,
    daysOf: daysOf,
    groupByDate: groupByDate,
    findOverlaps: findOverlaps,
    readyCount: readyCount,
    isReady: isReady,
    staffLine: staffLine,
    staffShortLine: staffShortLine,
    MAX_NEED_STAFF: MAX_NEED_STAFF,
    needStaffOf: needStaffOf,
    staffStatus: staffStatus,
    staffCountLabel: staffCountLabel,
    shortStaffDays: shortStaffDays,
    FILM_STAGES: FILM_STAGES,
    isUrgent: isUrgent,
    filmStageOf: filmStageOf,
    datesLine: datesLine,
    monthGrid: monthGrid
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Share;
  else root.Share = Share;
})(typeof window !== 'undefined' ? window : this);
