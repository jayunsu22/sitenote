// share.js — 순수 함수 모음 (화면·저장소에 의존하지 않음)
// 현장 항목 정의, 빈값 판정, 업자 질문/팀원 공유 문구 생성, 정렬, 색상 순환, 동기화 큐 병합
// 브라우저에서는 전역 Share, node에서는 module.exports 로 노출
(function (root) {
  'use strict';

  // 항목 정의 — 화면 순서 = 배열 순서 = 문구 출력 순서
  // type: text | date | select | films | link | multiline
  // question: 값이 비어있을 때 업자에게 보낼 기본 질문 문구
  //           (name/calRegion/quoteUrl/photoUrl/memo 는 우리가 채우는 칸이라 질문 대상 아님)
  var FIELDS = [
    // 동/호수·평형 칸은 뺐다(2026-09-17). '군포 우륵아파트 704동 606호' 처럼
    // 현장명에 같이 적는 게 빠르다. 예전에 저장한 값은 titleLine 이 그대로 붙여준다.
    // 현장주소 칸도 뺐다(2026-09-17). 네비에 직접 넣는 게 빠르다.
    { key: 'name',    label: '현장명',        type: 'text' },
    // 달력지역 - 일정 화면 '지역 보기' 칸에 뜰 이름. 비워두면 현장명에서 알아서 뽑는다.
    // 뽑은 게 마음에 안 들 때('인천'만 잡힌다든지) 여기에 직접 적으면 그게 뜬다.
    // 공유 문구에는 안 나간다 - 우리가 일정 잡으려고 쓰는 칸이라 업자·팀원과 상관없다
    { key: 'calRegion', label: '달력지역',     type: 'text' },
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
    // 작업 시작시간 — 우리가 알려 주는 칸이라 질문 대상이 아니다. 새 현장은 아래 기본 문구로 채워진다
    { key: 'startTime', label: '작업 시작시간', type: 'text', placeholder: '예: 오전 8시 시작합니다' },
    { key: 'toilet',  label: '화장실',        type: 'text',   question: '화장실 사용할 곳 위치 알려주세요' },
    // 특이사항 전달 - 팀원에게 꼭 알려줄 주의점("앞집이 예민함, 조심조심 들어올 것").
    // 우리가 채우는 칸이라 question 없음. 공유 문구에는 ⚠ 붙여서 나감.
    { key: 'note',    label: '특이사항 전달', type: 'multiline', shareLabel: '⚠ 특이사항',
      placeholder: '팀원에게 전달할 주의점 (예: 앞집이 예민함, 조심조심 들어올 것)' },
    { key: 'films',   label: '필름/시공위치', type: 'films',  question: '시공 위치별 필름 번호 알려주세요' },
    // 현장사진 링크 - 블로그자동화(현장 품질관리)에서 뽑은 사진 갤러리 주소를 붙여넣는 칸.
    // 업자에게 물어볼 항목이 아니라 우리가 채우는 칸이라 question 이 없다.
    // 견적서 링크 - 현장견적 앱에서 '링크 복사'한 주소를 붙여넣는 칸 (2026-09-23).
    // 서버에서 자동으로 끌어오지 않고 손으로 붙여넣는다: 붙여넣기 한 번이면 끝이고
    // 통신·백업키가 없어도 되고, 예전에 발행해 둔 견적도 그냥 붙이면 된다.
    { key: 'quoteUrl', label: '견적서',       type: 'link', placeholder: '견적서 링크 붙여넣기' },
    { key: 'photoUrl', label: '현장사진',     type: 'link', placeholder: '사진 링크 붙여넣기' },
    { key: 'memo',    label: '메모',          type: 'multiline' }
  ];

  // 현장을 새로 만들면 이 문구가 '작업 시작시간' 칸에 들어가 있다 (거의 늘 같아서 매번 적기 번거롭다)
  var DEFAULT_START_TIME = '오전 8시 시작합니다';

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
  // ☑ 된 줄이 하나라도 있으면 그 줄들만 복사한다 (골라서 주문). 하나도 없으면 전부.
  function filmOrderText(site) {
    var seen = {};
    var rows = ((site && site.films) || []).filter(function (r) { return r && str(r.code) !== ''; });
    var picked = rows.filter(function (r) { return r.ready; });
    if (picked.length) rows = picked;
    return rows
      .map(function (r) { return str(r.code); })
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
  // 현장 정보 줄 (주소·비번·출입·주차·필름 …) — has 에 켜진 칸만, FIELDS 순서로.
  // 팀원 공유 문구와 AS 지시 문구가 같이 쓴다
  function infoLines(site, has) {
    var lines = [];
    if (has.address) lines.push('📍 ' + str(site.address));
    if (has.pwLobby) lines.push('공동현관비번: ' + str(site.pwLobby));
    if (has.pwUnit) lines.push('세대비번: ' + str(site.pwUnit));
    if (has.gate) lines.push('출입: ' + str(site.gate));
    if (has.carReg) lines.push(selectLine(FIELD_MAP.carReg, site.carReg));
    if (has.parking) lines.push('주차: ' + str(site.parking));
    if (has.cargoEv) lines.push(selectLine(FIELD_MAP.cargoEv, site.cargoEv));
    if (has.startTime) lines.push('🕗 ' + str(site.startTime));
    if (has.toilet) lines.push('화장실: ' + str(site.toilet));
    if (has.note) lines.push(FIELD_MAP.note.shareLabel + ': ' + str(site.note));
    if (has.films) {
      var fl = site.films
        .filter(function (r) { return r && str(r.code) !== ''; })
        .map(function (r) { return [str(r.place), str(r.code)].filter(Boolean).join(' '); });
      lines.push('필름: ' + fl.join(', '));
    }
    if (has.quoteUrl) lines.push('📄 견적서: ' + linkUrl(site.quoteUrl));
    if (has.photoUrl) lines.push('📷 현장사진: ' + linkUrl(site.photoUrl));
    if (has.memo) lines.push(str(site.memo));
    return lines;
  }

  function buildShare(site, keys) {
    var ks = orderedKeys(keys).filter(function (k) { return !isEmpty(site, k); });
    var has = {};
    ks.forEach(function (k) { has[k] = true; });

    var head = '[' + titleLine(site) + ']' + (has.date ? ' ' + datesLine(site) : '');
    var lines = [head];
    // 날짜별 인원·부족 경고는 '시공날짜' 칸을 체크했을 때만. 체크한 것만 나가야
    // 고르고 복사한 게 맞는다 (예전엔 늘 나가서 '전체가 복사된다' 고 느껴졌다)
    if (has.date) {
      var staff = staffLine(site);
      if (staff) lines.push(staff);
      var short = staffShortLine(site);   // 필요 인원을 못 채운 날이 있으면 바로 아래에 경고 줄
      if (short) lines.push(short);
    }

    lines = lines.concat(infoLines(site, has));
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

  // 날짜별 현장 수 {'2026-09-28': 1} — 달력 칸의 건수 배지에 쓴다.
  // 사장님이 '비어 있는 날'을 찾아 현장을 배정하는 게 이 화면의 주된 쓰임이라,
  // 숫자가 없는 날이 곧 '넣을 수 있는 날' 이 된다.
  function dateCounts(sites) {
    var out = {};
    (sites || []).forEach(function (s) {
      daysOf(s).forEach(function (d) {
        var date = str(d.date);
        if (isIsoDate(date)) out[date] = (out[date] || 0) + 1;
      });
      // AS·추가작업도 그날 잡힌 일이다 — 빈 날을 찾을 때 빠지면 안 된다
      servicesOf(s).forEach(function (v) {
        if (isIsoDate(str(v.date))) out[v.date] = (out[v.date] || 0) + 1;
      });
    });
    return out;
  }

  /* ---------- 시공지역 (2026-09-23) ----------
     AS 를 나갈 때 '그날 어느 동네에 가 있나' 를 달력에서 보려고 뽑는다.
     같은 동네 일이 있는 날에 AS 를 붙이면 한 번 나가서 두 건을 본다.
     따로 적는 칸은 안 만든다 — 한 칸 더 늘리면 안 적게 되고, 현장명에
     이미 '인천 당하동 …' 처럼 적고 계신다. 주소가 있으면 주소를 먼저 본다.
       '인천 당하동 1084-2 그랜드비스타 2동 501호' → 당하동
       '군포 우륵아파트 704동 606호 30평'          → 군포
       '룩스디자인'                                → '' (지역을 안 적은 현장) */
  var 동읍면 = /^[가-힣]{1,5}(동|읍|면|리)$/;   // 가장 좁은 단위 - AS 묶기에 제일 쓸모 있다
  var 시군구 = /^[가-힣]{1,5}(시|군|구)$/;
  // 현장명·주소에서 알아서 뽑은 지역 (달력지역 칸이 비었을 때 쓰는 값)
  function autoRegion(site) {
    var src = str(site && site.address) || str(site && site.name);
    var ts = src.split(/\s+/).filter(Boolean);
    // 한글만 받으므로 '104동' '2동' 같은 건물 동은 저절로 빠진다.
    // '인천 부평구 삼산동 …' 이면 구보다 동이 낫다 - 좁을수록 같이 묶을 만하다
    for (var i = 0; i < ts.length; i++) if (동읍면.test(ts[i])) return ts[i];
    for (var j = 0; j < ts.length; j++) if (시군구.test(ts[j])) return ts[j];
    // 꼬리가 없으면 첫 낱말이 지역이다 ('청라 호반 베르디움', '군포 우륵아파트').
    // 낱말이 하나뿐이면 상호일 뿐이라 지역이 없다고 본다 ('룩스디자인')
    if (ts.length >= 2 && /^[가-힣]{2,4}$/.test(ts[0])) return ts[0];
    return '';
  }
  // 달력에 뜰 지역 — 직접 적은 게 있으면 그것, 없으면 현장명에서 뽑은 것
  function regionOf(site) {
    return str(site && site.calRegion).trim() || autoRegion(site);
  }
  // 날짜별 시공지역 { 'YYYY-MM-DD': ['당하동','부평구'] } — 같은 동네는 한 번만
  function dateRegions(sites) {
    var out = {}, seen = {};
    (sites || []).forEach(function (s) {
      var r = regionOf(s);
      if (!r) return;
      // 현장 날짜 + AS 날짜. AS 도 그 현장 동네로 가는 일이다
      daysOf(s).map(function (d) { return str(d.date); })
        .concat(servicesOf(s).map(function (v) { return str(v.date); }))
        .forEach(function (date) {
          if (!isIsoDate(date) || seen[date + '|' + r]) return;
          seen[date + '|' + r] = 1;
          (out[date] = out[date] || []).push(r);
        });
    });
    return out;
  }

  /* ---------- 날짜별 인원 (2026-09-26) ----------
     달력 '인원 보기' 칸에 쓴다. 그날 사람을 붙여 놨는지, 몇 명 모자란지가 한눈에 보여야
     미리 부를 수 있다 — 전날 밤에 알면 늦다.
       names 그날 나가는 사람 이름 (넣은 순서, 같은 사람은 한 번)
       have  그날 나가는 사람 수 (같은 사람이 두 현장이면 한 명으로 센다 — 몸은 하나다)
       need  그날 현장들의 필요 인원 합 (안 정한 현장은 0)
       short 모자란 수 (need 가 0인 현장뿐이면 0)
       slots 배치 칸 수 (겹쳐 부른 걸 알아보려고 — slots > have 면 같은 사람을 두 번 넣었다)
     AS·추가작업에 붙인 사람도 그날 나가는 사람이라 have 에 넣는다 (필요 인원은 안 따진다) */
  function dateStaff(sites) {
    var out = {};
    var add = function (date, names, need) {
      if (!isIsoDate(date)) return;
      var r = out[date] || (out[date] = { names: [], have: 0, need: 0, short: 0, slots: 0, _seen: {} });
      r.need += need || 0;
      names.forEach(function (n) {
        r.slots += 1;
        var k = n.replace(/\s+/g, '');
        if (!r._seen[k]) { r._seen[k] = 1; r.have += 1; r.names.push(n); }
      });
    };
    (sites || []).forEach(function (s) {
      var need = needStaffOf(s);
      daysOf(s).forEach(function (d) { add(str(d.date), staffOf(d), need); });
      servicesOf(s).forEach(function (v) { add(str(v.date), staffOf(v), 0); });
    });
    Object.keys(out).forEach(function (date) {
      var r = out[date];
      delete r._seen;
      r.short = r.need ? Math.max(0, r.need - r.have) : 0;
    });
    return out;
  }

  /* ---------- AS·추가작업 (2026-09-24) ----------
     끝난 현장에 AS 요청이나 추가작업이 오면 새 현장을 만들지 않고 그 현장 안에 쌓는다.
     비번·주차·필름번호·업자 담당자가 이미 그 현장에 있어서 새로 적을 게 없다.
     현장의 '일차' 로 붙이지 않는 건 원래 작업 표시와 섞이기 때문이다 — 필요 인원 10명인
     현장에 AS 로 1명 가면 1/10 빨간 경고가 뜨고, 필름 단계·'총 4일' 도 틀어진다.
       { id, kind: 'AS'|'추가', request, date: ''|'YYYY-MM-DD', staff: [이름], done, createdAt } */
  function servicesOf(site) {
    return ((site && site.services) || []).filter(function (v) { return v && v.id; });
  }
  function serviceLabel(v) { return v && v.kind === '추가' ? '추가작업' : 'AS'; }
  // 날짜별 AS 건수 { 'YYYY-MM-DD': n } — 달력 칸에 🔧 를 붙인다
  function dateServices(sites) {
    var out = {};
    (sites || []).forEach(function (s) {
      servicesOf(s).forEach(function (v) {
        if (isIsoDate(str(v.date))) out[v.date] = (out[v.date] || 0) + 1;
      });
    });
    return out;
  }
  // 일정 목록에 끼울 AS: 날짜가 오늘 이후이고 아직 안 끝난 것 [{site, service}] — 날짜순, 같은 날은 접수순
  function upcomingServices(sites, from) {
    var out = [];
    (sites || []).forEach(function (s) {
      servicesOf(s).forEach(function (v) {
        if (!v.done && isIsoDate(str(v.date)) && v.date >= from) out.push({ site: s, service: v });
      });
    });
    return out.sort(function (a, b) {
      if (a.service.date !== b.service.date) return a.service.date < b.service.date ? -1 : 1;
      return (a.service.createdAt || 0) - (b.service.createdAt || 0);
    });
  }
  // AS 대기: 안 끝났는데 날짜가 없거나 이미 지난 것 — 잊으면 안 되는 것들.
  // 지난 것(overdue)이 먼저, 그다음 날짜 없는 것을 접수순으로
  function waitingServices(sites, from) {
    var out = [];
    (sites || []).forEach(function (s) {
      servicesOf(s).forEach(function (v) {
        if (v.done) return;
        var d = str(v.date);
        if (!isIsoDate(d)) out.push({ site: s, service: v, overdue: false });
        else if (d < from) out.push({ site: s, service: v, overdue: true });
      });
    });
    return out.sort(function (a, b) {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.overdue && a.service.date !== b.service.date) return a.service.date < b.service.date ? -1 : 1;
      return (a.service.createdAt || 0) - (b.service.createdAt || 0);
    });
  }
  function openServiceCount(site) {
    return servicesOf(site).filter(function (v) { return !v.done; }).length;
  }

  var AS_INFO = ['address', 'pwLobby', 'pwUnit', 'gate', 'carReg', 'parking', 'cargoEv', 'toilet', 'note', 'films'];
  function svcHead(site, v, tail) {
    return '[' + titleLine(site) + '] 🔧 ' + serviceLabel(v) +
      (isIsoDate(str(v.date)) ? ' ' + dayLabel(v.date) : '') + (tail || '');
  }
  function contactsText(client) {
    var cs = ((client && client.contacts) || [])
      .map(function (c) { return [str(c && c.name), str(c && c.phone)].filter(Boolean).join(' '); })
      .filter(Boolean);
    if (!cs.length) return '';
    return '업자' + (str(client && client.name) ? ' ' + str(client.name) : '') + ' · ' + cs.join(', ');
  }
  // 작업자에게: AS 지시 — 요청 내용 + 그 현장 출입 정보(비번·주차·필름 …) + 업자 담당자
  function buildServiceOrder(site, v, client) {
    var has = {};
    AS_INFO.forEach(function (k) { if (!isEmpty(site, k)) has[k] = true; });
    var lines = [svcHead(site, v)];
    if (str(v.request)) lines.push('요청: ' + str(v.request));
    var who = staffOf(v);
    if (who.length) lines.push('👤 ' + who.join('·'));
    lines = lines.concat(infoLines(site, has));
    var cc = contactsText(client);
    if (cc) lines.push(cc);
    return lines.join('\n');
  }
  // 업자에게: AS 방문 안내 — 가는 사람 연락처·차량 + 요청 내용. 담당이 없으면 ''
  function buildServiceVisit(site, v, people, missing) {
    var who = staffOf(v);
    if (!who.length) return '';
    var lines = [svcHead(site, v, ' 방문')];
    who.forEach(function (n) {
      var p = personOf(people, n);
      if (!p.phone && missing) missing.push(n);
      lines.push([p.name, p.phone, p.car ? '(차량 ' + p.car + ')' : ''].filter(Boolean).join(' '));
    });
    if (str(v.request)) lines.push('요청: ' + str(v.request));
    return lines.join('\n');
  }
  // 관리실·차량등록: AS 날 오는 차량 — 현장 차량등록 문구와 같은 모양
  function buildServiceCars(site, v, people, missing) {
    var visit = Object.assign({}, site, { days: [{ date: str(v.date), staff: staffOf(v) }] });
    return buildCarList(visit, people, str(v.date) || todayIso(), missing);
  }

  // 현장 하나 = 목록의 한 줄. 날이 떨어져 있어도(1·2일차 9/28·9/29, 3일차 10/7)
  // 한 현장이면 한 덩어리로 다룬다 — 쪼개 놓으면 같은 현장이 딴 현장으로 읽힌다.
  // { site, dates:[날짜순], dayIndexes, start, end, dayCount, next, 이어짐 }
  //   next  : 오늘 이후로 남은 첫 날 (없으면 '' — 다 지난 현장)
  //   이어짐: 날들이 하루도 안 건너뛰고 붙어 있는가
  function siteSchedule(site, from) {
    var all = daysOf(site);
    var rows = all.map(function (d, i) { return { date: str(d.date), index: i }; })
      .filter(function (x) { return isIsoDate(x.date); })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.index - b.index;
      });
    if (!rows.length) return null;
    var dates = rows.map(function (x) { return x.date; });
    var next = '';
    for (var i = 0; i < dates.length; i++) {
      if (dates[i] >= from) { next = dates[i]; break; }
    }
    var 이어짐 = dates.every(function (d, i) { return i === 0 || addDays(dates[i - 1], 1) === d; });
    return {
      site: site,
      dates: dates,
      dayIndexes: rows.map(function (x) { return x.index; }),
      start: dates[0], end: dates[dates.length - 1],
      dayCount: all.length, next: next, 이어짐: 이어짐
    };
  }

  // 일정 화면용. 남은 날이 창(from 부터 count 일) 안에 있으면 runs,
  // 다 지났으면 past(최근 먼저), 남은 첫 날이 창 뒤면 later.
  // 순서는 '남은 첫 날' 기준 — 목록을 위에서부터 할 일 순서로 읽는다.
  // past/laterCount 는 날 수로 센다 ('지난 일정 4건' 이 4일치라는 뜻)
  function scheduleSites(sites, from, count) {
    var end = addDays(from, count - 1);
    var runs = [], later = [], past = [], laterCount = 0, pastCount = 0;
    (sites || []).slice()
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); })
      .forEach(function (s) {
        var r = siteSchedule(s, from);
        if (!r) return;
        if (!r.next) { past.push(r); pastCount += r.dates.length; return; }
        if (r.next > end) { later.push(r); laterCount += r.dates.length; return; }
        runs.push(r);
      });
    var byNext = function (a, b) { return a.next < b.next ? -1 : (a.next > b.next ? 1 : 0); };
    runs.sort(byNext); later.sort(byNext);
    past.sort(function (a, b) { return a.end < b.end ? 1 : (a.end > b.end ? -1 : 0); });
    return { runs: runs, later: later, laterCount: laterCount, past: past, pastCount: pastCount };
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
  /* 메인 카드의 시공 줄 — '9/18 (3일) 👤 2명' (2026-09-23)
     첫날짜만 봐서는 며칠짜리 일인지, 몇 명 붙는 일인지 알 수가 없다.
     일수는 날짜가 들어간 날만 센다(중복 날짜는 한 번). 아직 날짜를 안 넣은
     2일차 줄까지 세면 '3일' 이라고 거짓말을 하게 된다.
     인원은 정해둔 필요 인원을 쓰고, 안 정했으면 실제 배정한 사람 수를 센다
     (여러 날에 같은 사람이 나오면 한 명으로). 둘 다 없으면 인원은 뺀다. */
  function workSummary(site) {
    var ds = daysOf(site).map(function (d) { return str(d.date); }).filter(isIsoDate);
    var 날짜 = {}, 날수 = 0, 첫날 = '';
    ds.forEach(function (d) {
      if (날짜[d]) return;
      날짜[d] = 1; 날수++;
      if (!첫날 || d < 첫날) 첫날 = d;
    });
    if (!첫날) 첫날 = isIsoDate(site && site.date) ? str(site.date) : '';
    if (!첫날) return '';
    var out = shortDate(첫날);
    if (날수) out += ' (' + 날수 + '일)';
    var n = needStaffOf(site);
    if (!n) {
      var 사람 = {};
      daysOf(site).forEach(function (d) { staffOf(d).forEach(function (x) { 사람[x] = 1; }); });
      n = Object.keys(사람).length;
    }
    if (n) out += ' 👤 ' + n + '명';
    return out;
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
  /* 빈 칸 없이 앞뒤 달 날짜로 채운 격자 (2026-09-23).
     9/30 이 수요일이면 그 줄의 목·금·토가 비어서, 10/1·2·3 에 일이 있어도
     달을 넘겨야 보인다. 달이 바뀌는 자리가 제일 헷갈리는 자리다.
     칸이 이번 달인지는 iso 앞 7글자('2026-09')로 가린다. */
  function monthGridFull(year, month) { // month: 1~12
    var first = new Date(year, month - 1, 1);
    var last = new Date(year, month, 0).getDate();
    var 칸수 = Math.ceil((first.getDay() + last) / 7) * 7;
    var weeks = [], row = [];
    for (var i = 0; i < 칸수; i++) {
      var d = new Date(year, month - 1, 1 - first.getDay() + i);
      row.push(isoOf(d));
      if (row.length === 7) { weeks.push(row); row = []; }
    }
    return weeks;
  }
  /* ---------- 작업자 명부 · 연락처 주고받기 (2026-09-24) ----------
     팀원 명단(settings.team)은 예전처럼 이름만 두고, 연락처·차량번호는 이름으로 찾는
     표(settings.people = { 이름: { phone, car } })에 따로 둔다. 인원 칸에는 명단에 없는
     사람('일당 최기사')도 들어가므로 이름으로 찾는 게 맞고, 명단 모양을 안 바꿔야
     예전 화면·예전 백업이 그대로 돈다.
     아래 문구들은 카톡에 붙여넣을 것 — 업자·작업자·관리실이 서로 연락처를 주고받을 때 쓴다. */
  var 요일 = ['일', '월', '화', '수', '목', '금', '토'];
  function dayLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(iso));
    if (!m) return '';
    return (+m[2]) + '/' + (+m[3]) + '(' + 요일[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] + ')';
  }
  function personOf(people, name) {
    var p = (people && people[str(name)]) || {};
    return { name: str(name), phone: str(p.phone), car: str(p.car) };
  }
  // 현장에 오는 사람과 오는 날 [{name, dates}] — 처음 나온 순.
  // 오늘 이후로 배치된 날이 있으면 그 날들만 (지난 날 인원까지 보내면 누가 오는지 헷갈린다),
  // 없으면 전부. 날짜를 아직 안 정한 날의 인원도 넣는다 (날짜 없이)
  function visitsByPerson(site, today) {
    var t = str(today) || todayIso();
    var days = daysOf(site).map(function (d) { return { date: str(d.date), staff: staffOf(d) }; })
      .filter(function (d) { return d.staff.length; });
    var upcoming = days.filter(function (d) { return isIsoDate(d.date) && d.date >= t; });
    var use = (upcoming.length ? upcoming : days).slice().sort(function (a, b) {
      if (!a.date !== !b.date) return a.date ? -1 : 1;          // 날짜 없는 날은 뒤로
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
    var order = [], dates = {};
    use.forEach(function (d) {
      d.staff.forEach(function (n) {
        if (!dates[n]) { dates[n] = []; order.push(n); }
        if (isIsoDate(d.date) && dates[n].indexOf(d.date) === -1) dates[n].push(d.date);
      });
    });
    return order.map(function (n) { return { name: n, dates: dates[n] }; });
  }
  function datesText(dates) { return dates.length ? ' — ' + dates.map(dayLabel).join(', ') : ''; }

  // 업자에게: 우리 작업자 연락처 (차량번호가 있으면 같이 — 업자가 관리실에 등록해 주는 일이 많다)
  // 오는 사람이 없으면 ''. missing 에는 연락처가 없는 사람 이름을 담아 돌려준다
  function buildWorkerContacts(site, people, today, missing) {
    var v = visitsByPerson(site, today);
    if (!v.length) return '';
    var lines = v.map(function (x) {
      var p = personOf(people, x.name);
      if (!p.phone && missing) missing.push(x.name);
      return [p.name, p.phone, p.car ? '(차량 ' + p.car + ')' : ''].filter(Boolean).join(' ') + datesText(x.dates);
    });
    return '[' + titleLine(site) + '] 작업자 연락처\n' + lines.join('\n');
  }
  // 관리실·차량등록용: 차량번호와 오는 날만 (전화번호는 뺀다). 차량번호 있는 사람이 없으면 ''
  function buildCarList(site, people, today, missing) {
    var lines = [];
    visitsByPerson(site, today).forEach(function (x) {
      var p = personOf(people, x.name);
      if (p.car) lines.push(p.car + ' (' + p.name + ')' + datesText(x.dates));
      else if (missing) missing.push(x.name);
    });
    if (!lines.length) return '';
    return '[' + titleLine(site) + '] 방문 차량\n' + lines.join('\n');
  }
  // 작업자에게: 업자(거래처) 담당자 연락처. 담당자가 없으면 ''
  function buildClientContacts(site, client) {
    var cs = ((client && client.contacts) || [])
      .map(function (c) { return [str(c && c.name), str(c && c.phone)].filter(Boolean).join(' '); })
      .filter(Boolean);
    if (!cs.length) return '';
    var who = str(client && client.name);
    return '[' + titleLine(site) + ']\n업자' + (who ? ' ' + who : '') + '\n' + cs.join('\n');
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
  // 날짜 없는 현장(아직 안 잡힌 일)이 맨 위, 그 다음 날짜 내림차순 —
  // 최근에 한 현장이 맨 위로 온다 (2026-09-23). 지난 현장을 다시 볼 일이
  // 많은데 예전에는 오름차순이라 최근 것이 맨 아래에 처박혔다.
  function sortSites(sites) {
    return sites.slice().sort(function (a, b) {
      var da = str(a.date), db = str(b.date);
      if (!da && db) return -1;
      if (da && !db) return 1;
      if (da !== db) return da > db ? -1 : 1;
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
    dateCounts: dateCounts,
    autoRegion: autoRegion,
    regionOf: regionOf,
    dateRegions: dateRegions,
    siteSchedule: siteSchedule,
    scheduleSites: scheduleSites,
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
    DEFAULT_START_TIME: DEFAULT_START_TIME,
    FILM_STAGES: FILM_STAGES,
    isUrgent: isUrgent,
    filmStageOf: filmStageOf,
    datesLine: datesLine,
    workSummary: workSummary,
    monthGrid: monthGrid,
    monthGridFull: monthGridFull,
    dayLabel: dayLabel,
    personOf: personOf,
    visitsByPerson: visitsByPerson,
    buildWorkerContacts: buildWorkerContacts,
    buildCarList: buildCarList,
    buildClientContacts: buildClientContacts,
    servicesOf: servicesOf,
    serviceLabel: serviceLabel,
    dateServices: dateServices,
    dateStaff: dateStaff,
    upcomingServices: upcomingServices,
    waitingServices: waitingServices,
    openServiceCount: openServiceCount,
    buildServiceOrder: buildServiceOrder,
    buildServiceVisit: buildServiceVisit,
    buildServiceCars: buildServiceCars
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Share;
  else root.Share = Share;
})(typeof window !== 'undefined' ? window : this);
