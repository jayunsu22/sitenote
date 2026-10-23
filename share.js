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
    // 발주처 담당자 (2026-10-14) — 이 현장을 맡긴 쪽 사람들(현장소장·집주인·경리 …). 여러 명.
    // 우리가 채우는 칸이라 질문 대상이 아니다. 팀원 공유는 체크했을 때만 나간다(고객 번호가 기사님께 퍼지지 않게)
    { key: 'owners',  label: '발주처 담당자', type: 'contacts', shareLabel: '🏢 발주처 담당자' },
    // 달력지역 - 일정 화면 '지역 보기' 칸에 뜰 이름. 비워두면 현장명에서 알아서 뽑는다.
    // 뽑은 게 마음에 안 들 때('인천'만 잡힌다든지) 여기에 직접 적으면 그게 뜬다.
    // 공유 문구에는 안 나간다 - 우리가 일정 잡으려고 쓰는 칸이라 업자·팀원과 상관없다
    { key: 'calRegion', label: '달력지역',     type: 'text' },
    // 시공날짜: 달력에서 여러 날을 고를 수 있다(1일차, 2일차…). 값은 첫날(days[0].date)이고 전체는 site.days 에 있다
    { key: 'date',    label: '시공날짜',      type: 'date',   question: '시공 날짜 언제인가요?' },
    { key: 'pwLobby', label: '공동현관 비번', type: 'text',   question: '공동현관 비번 알려주세요' },
    { key: 'pwUnit',  label: '세대 비번',     type: 'text',   question: '세대 현관 비번 알려주세요' },
    // 입구차단기 (2026-09-28) — 단지 입구 차량 차단기. 경비호출이 대부분이고, 비번을 누르는 단지도 있다.
    // 새 현장·예전 현장 모두 '경비호출' 로 채워져 있다(DEFAULT_BARRIER). 비번이면 고쳐 적는다
    { key: 'barrier', label: '입구차단기',    type: 'text',   question: '입구 차단기는 어떻게 통과하나요? (경비호출 / 비번)',
      placeholder: '예: 경비호출 / 비번 1234#' },
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
  // 새 현장의 '입구차단기' 칸 기본값
  var DEFAULT_BARRIER = '경비호출';

  var FIELD_MAP = {};
  FIELDS.forEach(function (f) { FIELD_MAP[f.key] = f; });

  var DEFAULT_QUESTIONS = {};
  FIELDS.forEach(function (f) { if (f.question) DEFAULT_QUESTIONS[f.key] = f.question; });

  var COLOR_COUNT = 8;
  // 거래처 탭 색 (2026-10-18) — 업체마다 탭에 색을 줘서 한눈에 갈린다. -1 = 기본(색 없음)
  var TAB_COLORS = 8;
  function tabColorOf(client) {
    var n = parseInt(client && client.tabColor, 10);
    return (n >= 0 && n < TAB_COLORS) ? n : -1;
  }

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
    if (key === WORKER_KEY) return !workerLink(site);
    var f = FIELD_MAP[key];
    if (!f || !site) return true;
    var v = site[key];
    if (f.type === 'select') return !v || str(v.v) === '' || v.v === '미확인';
    if (f.type === 'films') return !Array.isArray(v) || !v.some(function (r) { return r && str(r.code) !== ''; });
    if (f.type === 'contacts') return !ownerRows(v).length;
    return str(v) === '';
  }

  /* 기사접속 링크 (2026-10-22) — 현장업무(관리자 앱)에 연결된 현장이면 기사님이 여는 작업 화면 주소.
     관리자 앱의 [기사접속 링크복사] 와 같은 주소다 (songil /w/<현장업무 id>?n=<현장명 base64url>).
     팀원 공유 문구에 비번과 같이 실어 보낸다 — 따로 복사해 두 번 붙여넣던 걸 한 번에.
     FIELDS 칸이 아니라 현장명 줄의 체크로 고른다. 연결 안 된 현장은 '' */
  var WORKER_KEY = 'workerLink';
  var WORKER_APP_URL = 'https://songil.netlify.app/w/';
  function base64Url(text) {
    var bin = unescape(encodeURIComponent(String(text || '')));
    var b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    return b64.split('+').join('-').split('/').join('_').split('=').join('');
  }
  function workerLink(site) {
    var id = str(site && site.adminId);
    if (!id) return '';
    var t = titleLine(site);
    return WORKER_APP_URL + encodeURIComponent(id) + (t && t !== '(이름없음)' ? '?n=' + base64Url(t) : '');
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

  /* 내비에 붙여넣을 주소 (2026-10-08). 현장명을 쓴다 — 주소 칸은 없애고 현장명에
     '군포 우륵아파트 704동 606호 30평' 처럼 적는다. 내비 검색은 아파트 이름과 동까지면 충분하고,
     '606호' '30평' 이 붙으면 검색이 안 되거나 엉뚱한 데가 나온다. 그래서 호수·평형은 뺀다.
     예전에 적어둔 주소 칸이 있으면 그걸 먼저 쓴다. 동이 따로 칸(unit)에 있으면 붙여준다. */
  function navAddress(site) {
    if (!site) return '';
    var base = str(site.address) || str(site.name);
    var 빼기 = function (t) {
      return t.replace(/(^|\s)\d+\s*호(?=[\s,)]|$)/g, '$1').replace(/\s*\d+(\.\d+)?\s*평(형)?/g, '')
        .replace(/\s*\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
    };
    var out = 빼기(base);
    var 동 = /(\d+)\s*동/.exec(str(site.unit));
    if (동 && !/\d+\s*동/.test(out)) out += ' ' + 동[1] + '동';
    return out.trim();
  }

  // 필름 번호만 한 줄에 하나씩. 대리점에 주문할 때 붙여넣는 용도라 시공위치는 뺀다.
  // 같은 번호가 여러 줄이면 한 번만(주문은 품목 목록이지 시공 목록이 아니다).
  // ☑ 된 줄이 하나라도 있으면 그 줄들만 복사한다 (골라서 주문). 하나도 없으면 전부.
  function filmOrderText(site) {
    var seen = {};
    var rows = ((site && site.films) || []).filter(function (r) { return r && str(r.code) !== ''; });
    var picked = rows.filter(function (r) { return r.ready; });
    if (picked.length) rows = picked;
    // 같은 필름인지는 대소문자·띄어쓰기를 무시하고 본다 ('예림 hp602' = '예림  HP602').
    // 적힌 모양은 처음 나온 줄 그대로 쓴다
    return rows
      .map(function (r) { return str(r.code); })
      .filter(function (c) {
        var k = c.replace(/\s+/g, ' ').toLowerCase();
        if (!c || seen[k]) return false; seen[k] = true; return true;
      })
      .join('\n');
  }
  // 필름 '줄 추가' 에 들어갈 새 줄 (2026-09-29): 시공위치는 빈칸, 필름명은 바로 위 줄 것.
  // 시공위치만 다르고 필름은 같은 경우가 많다. 위 줄 필름이 비었으면 그 위에서 마지막으로 적은 것
  function newFilmRow(films) {
    var list = Array.isArray(films) ? films : [];
    var code = '';
    for (var i = list.length - 1; i >= 0 && !code; i--) code = str(list[i] && list[i].code);
    return { place: '', code: code, ready: false };
  }

  // 'YYYY-MM-DD' → 'M/D'
  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso));
    if (!m) return str(iso);
    return parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
  }

  /* 필름 주문 문자 본문 (2026-10-19) — 받는 사람이 어느 현장인지 바로 알게 제목 한 줄을 붙인다.
     필름명은 filmOrderText 와 같은 규칙(☑ 체크한 줄이 있으면 그것만, 같은 번호는 한 번) */
  function filmOrderMessage(site) {
    var 필름 = filmOrderText(site);
    if (!필름) return '';
    var 이름 = titleLine(site);
    return (이름 && 이름 !== '(이름없음)' ? '[' + 이름 + ']\n' : '') + 필름;
  }

  /* 전화·문자 주소 (2026-10-19) — 번호가 붙는 자리는 어디든 📞 와 💬 를 같이 단다.
     번호에서 숫자와 +(국가번호) 만 남긴다. 번호가 없으면 빈 문자열 — 부르는 쪽에서 버튼을 흐리게 한다.
     문자 본문의 구분자는 폰마다 다르다: 아이폰 sms:번호&body=… / 안드로이드 sms:번호?body=… */
  function phoneDigits(phone) { return str(phone).replace(/[^0-9+]/g, ''); }
  function telHref(phone) {
    var num = phoneDigits(phone);
    return num ? 'tel:' + num : '';
  }
  function smsHref(phone, body, ios) {
    var num = phoneDigits(phone);
    if (!num) return '';
    var 본문 = str(body);
    return 'sms:' + num + (본문 ? (ios ? '&' : '?') + 'body=' + encodeURIComponent(본문) : '');
  }
  function isIosUA(ua) { return /iP(hone|ad|od)/.test(str(ua)); }

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
    return ['[' + titleLine(site) + ']'].concat(lines).join(ITEM_GAP);
  }
  /* 복사 문구의 항목 사이 (2026-09-28): 빈 줄 하나. 카톡에서 줄이 붙어 있으면 항목이 한 덩어리로
     보여 눈에 안 들어온다 — 팀원 공유·업자 질문 두 문구에 쓴다 */
  var ITEM_GAP = '\n\n';

  function selectLine(f, v) {
    var memo = str(v.memo);
    return f.shareLabel + ' ' + v.v + (memo ? ' (' + memo + ')' : '');
  }

  // 팀원에게 공유: 선택된 키 중 채워진 항목만. 제목 줄은 항상 포함(날짜는 date 선택 시 제목 줄 뒤에)
  // 현장 정보 줄 (주소·비번·출입·주차·필름 …) — has 에 켜진 칸만, FIELDS 순서로.
  // 팀원 공유 문구와 AS 지시 문구가 같이 쓴다
  // 발주처 담당자 중 이름이나 번호가 있는 줄만
  function ownerRows(v) {
    return (Array.isArray(v) ? v : []).filter(function (r) { return r && (str(r.name) || str(r.phone)); });
  }
  function ownerLine(r) {
    return (str(r.name) + (str(r.role) ? '(' + str(r.role) + ')' : '') + ' ' + str(r.phone)).trim();
  }
  function infoLines(site, has) {
    var lines = [];
    if (has.owners) lines.push(FIELD_MAP.owners.shareLabel + ':\n' + ownerRows(site.owners).map(ownerLine).join('\n'));
    if (has.address) lines.push('📍 ' + str(site.address));
    if (has.pwLobby) lines.push('공동현관비번: ' + str(site.pwLobby));
    if (has.pwUnit) lines.push('세대비번: ' + str(site.pwUnit));
    if (has.barrier) lines.push('입구차단기: ' + str(site.barrier));
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
      // 위치마다 한 줄 (2026-09-29). 쉼표로 이어 붙이면 카톡에서 한 덩어리로 보여 어느 문에 뭘 붙일지 안 보인다
      lines.push('필름:\n' + fl.join('\n'));
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
    var sil = siliconeShareLine(site);
    if (sil) lines.push(sil);
    // 기사접속 링크는 맨 끝에, 위로 빈 줄 두 개 띄워 따로 보이게 (2026-10-22 사장님)
    var wl = (keys || []).indexOf(WORKER_KEY) >= 0 ? workerLink(site) : '';
    return lines.join(ITEM_GAP) + (wl ? '\n\n\n🔗 기사접속: ' + wl : '');
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
       slots 배치 칸 수 (겹쳐 부른 걸 알아보려고 — slots > have 면 같은 사람을 두 번 넣었다)
     필요 인원은 현장 전체를 두고 정하는 수라 '그날 몇 명 필요' 로 쪼갤 수 없다. 여기서는 안 따진다
     AS·추가작업에 붙인 사람도 그날 나가는 사람이라 have 에 넣는다 (필요 인원은 안 따진다) */
  function dateStaff(sites) {
    var out = {};
    var add = function (date, names) {
      if (!isIsoDate(date)) return;
      var r = out[date] || (out[date] = { names: [], have: 0, slots: 0, _seen: {} });
      names.forEach(function (n) {
        r.slots += 1;
        var k = n.replace(/\s+/g, '');
        if (!r._seen[k]) { r._seen[k] = 1; r.have += 1; r.names.push(n); }
      });
    };
    (sites || []).forEach(function (s) {
      daysOf(s).forEach(function (d) { add(str(d.date), staffOf(d)); });
      servicesOf(s).forEach(function (v) { add(str(v.date), staffOf(v)); });
    });
    Object.keys(out).forEach(function (date) { delete out[date]._seen; });
    return out;
  }

  /* ---------- 인원 고르기 (2026-10-24 사장님) ----------
     팀원이 20명이 넘어 찾기 힘들다 → ⭐ 자주(최근 한 달 많이 들어간 순) + 나머지 가나다(첫 자음별) + 이름·초성 검색 */
  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  // 글자마다 초성 하나 (한글 아닌 글자는 그대로) — 이름과 길이가 같아 칠할 자리를 그대로 쓴다
  function choseong(name) {
    return Array.prototype.map.call(str(name), function (ch) {
      var c = ch.charCodeAt(0) - 0xAC00;
      return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
    }).join('');
  }
  var DOUBLE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
  // 가나다 묶음 머리 (된소리는 예사소리로, 한글이 아니면 '기타')
  function nameInitial(name) {
    var c = choseong(str(name).trim()).charAt(0);
    if (DOUBLE[c]) c = DOUBLE[c];
    return CHO.indexOf(c) !== -1 ? c : '기타';
  }
  // 검색어가 이름 어디에 맞나 → [시작, 길이] 또는 null. 자음만 치면 초성으로, 아니면 글자 그대로 (대소문자 무시)
  function nameMatch(name, q) {
    var n = str(name), k = str(q).replace(/\s+/g, '');
    if (!k) return [0, 0];
    if (/^[ㄱ-ㅎ]+$/.test(k)) {
      var i = choseong(n).indexOf(k);
      return i === -1 ? null : [i, k.length];
    }
    var j = n.toLowerCase().indexOf(k.toLowerCase());
    return j === -1 ? null : [j, k.length];
  }
  // 사람별로 오늘 앞뒤 days 일 안 일정에 들어간 날 수 (현장 일차 + AS) → { 이름: 횟수 }
  function staffFrequency(sites, today, days) {
    var n = days || 30, from = addDays(today, -n), to = addDays(today, n), out = {};
    var add = function (date, names) {
      if (!isIsoDate(date) || date < from || date > to) return;
      names.forEach(function (x) { out[x] = (out[x] || 0) + 1; });
    };
    (sites || []).forEach(function (s) {
      daysOf(s).forEach(function (d) { add(str(d.date), staffOf(d)); });
      servicesOf(s).forEach(function (v) { add(str(v.date), staffOf(v)); });
    });
    return out;
  }
  // 그날 다른 현장(이 현장 빼고)이나 AS 에 이미 들어간 사람들
  function busyElsewhere(sites, date, siteId) {
    var out = [];
    if (!isIsoDate(date)) return out;
    (sites || []).forEach(function (s) {
      if (!s) return;
      var push = function (names) { names.forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); }); };
      if (s.id !== siteId) daysOf(s).forEach(function (d) { if (str(d.date) === date) push(staffOf(d)); });
      servicesOf(s).forEach(function (v) { if (str(v.date) === date) push(staffOf(v)); });
    });
    return out;
  }
  var KO = function (a, b) { return a.localeCompare(b, 'ko'); };
  /* 고르기 화면 나누기 → { fav: [{name, n}], groups: [{ini, names}] }. fav 는 횟수 많은 순 max 명,
     나머지는 가나다로 첫 자음별 묶음 (fav 에 나온 사람은 빠진다) */
  function staffPickGroups(names, freq, max) {
    var uniq = [];
    (names || []).forEach(function (x) { var v = str(x); if (v && uniq.indexOf(v) === -1) uniq.push(v); });
    var fav = uniq.filter(function (x) { return (freq || {})[x] > 0; })
      .sort(function (a, b) { return (freq[b] - freq[a]) || KO(a, b); })
      .slice(0, max == null ? 6 : max)
      .map(function (x) { return { name: x, n: freq[x] }; });
    var inFav = fav.map(function (f) { return f.name; });
    var groups = [], byIni = {};
    uniq.filter(function (x) { return inFav.indexOf(x) === -1; }).sort(KO).forEach(function (x) {
      var ini = nameInitial(x);
      if (!byIni[ini]) { byIni[ini] = { ini: ini, names: [] }; groups.push(byIni[ini]); }
      byIni[ini].names.push(x);
    });
    groups.sort(function (a, b) { return a.ini === '기타' ? 1 : b.ini === '기타' ? -1 : KO(a.ini, b.ini); });
    return { fav: fav, groups: groups };
  }

  /* ---------- AS·추가작업 (2026-09-24) ----------
     끝난 현장에 AS 요청이나 추가작업이 오면 새 현장을 만들지 않고 그 현장 안에 쌓는다.
     비번·주차·필름번호·업자 담당자가 이미 그 현장에 있어서 새로 적을 게 없다.
     현장의 '일차' 로 붙이지 않는 건 원래 작업 표시와 섞이기 때문이다 — 필요 인원 10명인
     현장에 AS 로 1명 가면 1/10 빨간 경고가 뜨고, 필름 단계·'총 4일' 도 틀어진다.
       { id, kind: 'AS'|'추가', request, date: ''|'YYYY-MM-DD', staff: [이름], customer: 고객명, phone: 고객 연락처, bizContact: 고른 업자 담당자, done, createdAt } */
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

  var AS_INFO = ['address', 'pwLobby', 'pwUnit', 'barrier', 'gate', 'carReg', 'parking', 'cargoEv', 'toilet', 'note', 'films'];
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
  // 업자 담당자 하나를 가리키는 값 - 이름, 이름이 없으면 번호 (AS 의 bizContact 에 저장)
  function contactKey(c) { return str(c && c.name) || str(c && c.phone); }
  function clientContactsOf(client) {
    return ((client && client.contacts) || []).filter(function (c) { return contactKey(c); });
  }
  // AS 지시에 넣을 업자 담당자 (2026-10-02). 업자 담당자가 여럿이면 엉뚱한 사람 번호가 가지 않게
  // 접수 화면에서 한 명을 고른다. 1명뿐이면 그 사람, 없으면 '' (넣을 것 없음),
  // 여럿인데 안 골랐으면(또는 고른 사람이 거래처에서 지워졌으면) null - 복사를 막는다
  function serviceBizContact(client, v) {
    var cs = clientContactsOf(client);
    if (cs.length <= 1) return cs[0] || '';
    var key = str(v && v.bizContact);
    return cs.find(function (c) { return contactKey(c) === key; }) || null;
  }
  // 작업자에게: AS 지시 — 요청 내용 + 그 현장 출입 정보(비번·주차·필름 …) + 업자 담당자(고른 한 명)
  function buildServiceOrder(site, v, client) {
    var has = {};
    AS_INFO.forEach(function (k) { if (!isEmpty(site, k)) has[k] = true; });
    var lines = [svcHead(site, v)];
    if (str(v.request)) lines.push('요청: ' + str(v.request));
    // 작업자가 고객과 직접 시간을 맞추고 도착 전화를 하므로 요청 바로 아래에 둔다
    var 고객 = [str(v.customer), str(v.phone)].filter(Boolean).join(' ');
    if (고객) lines.push('📞 고객 ' + 고객);
    var who = staffOf(v);
    if (who.length) lines.push('👤 ' + who.join('·'));
    // 챙길 부자재·공구 (2026-10-05) — AS 는 재료가 현장마다 달라 접수할 때 골라 둔다
    var tools = (v.tools || []).map(str).filter(Boolean);
    if (tools.length) lines.push('🧰 챙길 것: ' + tools.join(', '));
    lines = lines.concat(infoLines(site, has));
    var bc = serviceBizContact(client, v);
    var cc = bc ? contactsText({ name: client && client.name, contacts: [bc] }) : '';
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

  /* ---------- 총 필요 인원 (2026-09-20, 뜻 바로잡음 2026-09-26) ----------
     '이 현장을 끝내려면 사람이 모두 몇 명 들어가야 하나' — **며칠에 걸쳐 들어가는 사람을 다 더한 수**다.
     10명짜리 현장이면 1일차 1명 + 2일차 5명 + 3일차 4명 = 10명이면 다 채운 것이다.
     (날마다 10명씩이 아니다 — 예전에는 날마다 견줘서 다 채운 현장을 '부족' 이라고 했다.)
     같은 사람이 이틀 나오면 두 번 센다. 0 = 아직 안 정함 (예전 현장은 전부 0) */
  var MAX_NEED_STAFF = 99;
  function needStaffOf(site) {
    var n = parseInt(site && site.needStaff, 10);
    if (!(n > 0)) return 0;
    return Math.min(n, MAX_NEED_STAFF);
  }
  // 그날 들어간 사람 수
  function dayStaffCount(site, dayIndex) { return staffOf(daysOf(site)[dayIndex]).length; }
  // 현장 전체에 들어간 사람 수 (날마다 더한다 — 같은 사람이 이틀 나오면 2)
  function staffTotal(site) {
    return daysOf(site).reduce(function (n, d) { return n + staffOf(d).length; }, 0);
  }
  // 현장 배치 현황 — have 다 더한 수, need 총 필요 인원(0이면 안 정함), short 모자란 수, over 넘친 수
  function staffStatus(site) {
    var have = staffTotal(site), need = needStaffOf(site);
    return {
      have: have, need: need,
      short: need ? Math.max(0, need - have) : 0,
      over: need ? Math.max(0, have - need) : 0,
      ok: need ? have >= need : have > 0
    };
  }
  // 현장 전체 표기 — 필요 인원을 정했으면 '10/10', 아니면 '4명' (아무도 없으면 '미배정')
  function staffTotalLabel(site) {
    var st = staffStatus(site);
    if (st.need) return st.have + '/' + st.need;
    return st.have ? st.have + '명' : '미배정';
  }
  // 그날 표기 — 언제나 '5명' (날마다 필요 인원을 따로 정하지 않는다)
  function staffCountLabel(site, dayIndex) {
    var n = dayStaffCount(site, dayIndex);
    return n ? n + '명' : '미배정';
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
  /* 필름 주문 늦음 (2026-10-24 사장님) — 시공 첫날 2일 전까지 '필름 주문' 단계가 안 됐으면 빨간불.
     첫날이 지났는데 아직이어도 계속 켠다 (그게 더 급하다) */
  var FILM_ORDER_DAYS = 2;
  function filmOrderLate(site, today) {
    var d = site && site.date;
    return isIsoDate(d) && filmStageOf(site) < 2 && dayDiff(today || todayIso(), d) <= FILM_ORDER_DAYS;
  }
  /* 실리콘 (2026-10-24 사장님) — 현장 하나에 한 번: 없음 / 내가 쏨 / 다른 사람.
     다른 사람이 쏘면 내 일이 아니라 그걸로 끝. 내가 쏠 때만 고른 색(여러 개)이 부자재에
     '실리콘 백색' 줄로 들어가고, 실리콘은 당일 보충이 안 돼 필름처럼 시공 2일 전부터 빨간불 */
  var SILICONE_COLORS = ['백색', '투명', '회색', '아이보리', '블랙'];
  var SILICONE_DAYS = 2;
  function siliconeOf(site) {
    var v = (site && site.silicone) || {};
    var who = v.who === 'me' || v.who === 'other' ? v.who : '';
    var colors = [];
    (Array.isArray(v.colors) ? v.colors : []).forEach(function (c) {
      var x = str(c);
      if (x && colors.indexOf(x) === -1) colors.push(x);
    });
    return { who: who, colors: colors };
  }
  function siliconeName(color) { return '실리콘 ' + str(color); }
  // 내가 쏘는데 아직 부자재 체크가 안 된 색들
  function siliconeLeft(site) {
    var sc = siliconeOf(site);
    if (sc.who !== 'me') return [];
    var sup = (site && site.supplies) || [];
    return sc.colors.filter(function (c) {
      return !sup.some(function (r) { return r && r.ready && str(r.name) === siliconeName(c); });
    });
  }
  function isSiliconeSupply(site, name) {
    var sc = siliconeOf(site);
    return sc.who === 'me' && sc.colors.some(function (c) { return siliconeName(c) === str(name); });
  }
  // 첫날 2일 전부터(지나도 계속) 못 챙긴 색이 있으면 빨간불
  function siliconeLate(site, today) {
    var d = site && site.date;
    return isIsoDate(d) && siliconeLeft(site).length > 0 && dayDiff(today || todayIso(), d) <= SILICONE_DAYS;
  }
  function siliconeShareLine(site) {
    var sc = siliconeOf(site);
    return sc.who === 'me' && sc.colors.length ? '🧴 실리콘: 사장님이 쏨 (' + sc.colors.join(' · ') + ')' : '';
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
    var st = staffStatus(site);
    return st.ok;
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
    var st = staffStatus(site);
    if (st.need) out += ' 👤 ' + st.have + '/' + st.need + '명';
    else if (st.have) out += ' 👤 ' + st.have + '명';
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
  /* 공휴일 — 날짜 옆에 빨간색으로 띄운다 (일요일도 빨강).
     설·추석·부처님오신날은 음력이라 해마다 날이 바뀌고, 대체공휴일·선거일·임시공휴일은
     나라에서 정해 발표하므로 셈으로 못 낸다. 해마다 여기에 다음 해 것을 적어 넣는다. */
  var HOLIDAYS = {
    '2025-01-01': '신정', '2025-01-27': '임시공휴일', '2025-01-28': '설날', '2025-01-29': '설날', '2025-01-30': '설날',
    '2025-03-01': '삼일절', '2025-03-03': '대체공휴일', '2025-05-05': '어린이날·부처님오신날', '2025-05-06': '대체공휴일',
    '2025-06-03': '대통령선거', '2025-06-06': '현충일', '2025-08-15': '광복절', '2025-10-03': '개천절',
    '2025-10-05': '추석', '2025-10-06': '추석', '2025-10-07': '추석', '2025-10-08': '대체공휴일', '2025-10-09': '한글날',
    '2025-12-25': '성탄절',
    '2026-01-01': '신정', '2026-02-16': '설날', '2026-02-17': '설날', '2026-02-18': '설날',
    '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-05': '어린이날', '2026-05-24': '부처님오신날',
    '2026-05-25': '대체공휴일', '2026-06-03': '지방선거', '2026-06-06': '현충일', '2026-08-15': '광복절',
    '2026-08-17': '대체공휴일', '2026-09-24': '추석', '2026-09-25': '추석', '2026-09-26': '추석',
    '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
    '2027-01-01': '신정', '2027-02-06': '설날', '2027-02-07': '설날', '2027-02-08': '설날', '2027-02-09': '대체공휴일',
    '2027-03-01': '삼일절', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날', '2027-06-06': '현충일',
    '2027-08-15': '광복절', '2027-08-16': '대체공휴일', '2027-09-14': '추석', '2027-09-15': '추석', '2027-09-16': '추석',
    '2027-10-03': '개천절', '2027-10-04': '대체공휴일', '2027-10-09': '한글날', '2027-10-11': '대체공휴일',
    '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
    '2028-01-01': '신정', '2028-01-25': '설날', '2028-01-26': '설날', '2028-01-27': '설날', '2028-03-01': '삼일절',
    '2028-04-12': '국회의원선거', '2028-05-02': '부처님오신날', '2028-05-05': '어린이날', '2028-06-06': '현충일',
    '2028-08-15': '광복절', '2028-10-02': '추석', '2028-10-03': '추석·개천절', '2028-10-04': '추석',
    '2028-10-05': '대체공휴일', '2028-10-09': '한글날', '2028-12-25': '성탄절'
  };
  function holidayName(iso) { return HOLIDAYS[str(iso)] || ''; }
  // 빨간 날 — 일요일이거나 공휴일
  function isRedDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(iso));
    if (!m) return false;
    return !!HOLIDAYS[str(iso)] || new Date(+m[1], +m[2] - 1, +m[3]).getDay() === 0;
  }
  // 기사 정보 칸: 전화·차량은 카톡 문구에 쓰이고, 경력·페이·사는곳·메모는 사장님이 보는 용도라 문구에는 절대 안 나간다
  // photo 는 사진 자체가 아니라 사진 한 장의 id (사진은 다른 사진들과 같은 곳에 저장된다, 2026-10-16)
  var PERSON_KEYS = ['phone', 'car', 'career', 'pay', 'home', 'memo', 'grade', 'photo'];
  // 페이(일당) — 8~30 만원, 숫자만 쓴다. '일 28만 식대포함' 처럼 적어둔 예전 값은 숫자만 남긴다 (2026-10-16)
  var PAY_MIN = 8, PAY_MAX = 30;
  function payOf(v) {
    var m = /\d+/.exec(str(v));
    if (!m) return '';
    var n = parseInt(m[0], 10);
    return (n >= PAY_MIN && n <= PAY_MAX) ? String(n) : '';
  }
  var PERSON_GRADES = ['A', 'B', 'C', 'F'];   // 기사 등급 — 사장님이 보는 용도, 카톡 문구에는 안 나간다
  function gradeOk(v) { return PERSON_GRADES.indexOf(str(v)) !== -1 ? str(v) : ''; }
  function personOf(people, name) {
    var p = (people && people[str(name)]) || {};
    var out = { name: str(name) };
    PERSON_KEYS.forEach(function (k) { out[k] = k === 'grade' ? gradeOk(p[k]) : k === 'pay' ? payOf(p[k]) : str(p[k]); });
    return out;
  }
  // 한 사람의 칸을 일부만 바꾼 새 표를 돌려준다(원본은 안 바뀐다). 6칸이 모두 비면 그 이름을 지운다
  function mergePerson(people, name, patch) {
    var out = Object.assign({}, people || {});
    var n = str(name);
    if (!n) return out;
    var cur = personOf(people, n), next = {}, any = false;
    PERSON_KEYS.forEach(function (k) {
      var given = Object.prototype.hasOwnProperty.call(patch || {}, k);
      var v = !given ? cur[k] : k === 'grade' ? (str(patch[k]) === '' ? '' : (gradeOk(patch[k]) || cur[k])) : k === 'pay' ? payOf(patch[k]) : str(patch[k]);
      next[k] = v;
      if (next[k]) any = true;
    });
    if (any) out[n] = next; else delete out[n];
    return out;
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
  // 팀원 공유용 부족 인원 줄 — '⚠ 인원 부족: 10명 중 6명 (4명 더 필요)'. 다 채웠으면 ''
  function staffShortLine(site) {
    var st = staffStatus(site);
    if (!st.short) return '';
    return '⚠ 인원 부족: ' + st.need + '명 중 ' + st.have + '명 (' + st.short + '명 더 필요)';
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

  // ---------- 현장 후기 (2026-09-27) ----------
  // 현장이 끝나면 정해둔 질문에 답하고 태그를 달아 두었다가, 태그·질문별로 모아 보며 다음 현장을 고친다.
  // site.review = { answers: { 질문문구: 답 }, tags: [태그] }. 답은 질문 문구로 찾는다 —
  // 설정에서 질문을 지우거나 바꿔도 적어 둔 답은 그대로 남는다.
  /* ---------- 팀원 작업내역 (2026-10-23) ----------
     설정 › 팀원 명단에서 한 사람이 언제 어느 현장에서 일했는지 첫 작업부터 모아 본다 — 새로 들어온 기사의
     성장을 확인하려고. 자료는 현장의 날짜별 인원(days[].staff)과 AS·추가작업 출동(services[].staff).
     N일차 = 오늘까지 일한 날의 수(같은 날 두 현장이어도 하루). 경과 = 첫 작업부터 오늘까지 달력 날 수.
     AS 발생 = 이 사람이 시공한 현장에 그날 뒤로 AS 가 잡힌 것 (본인 AS 출동이 아니라 품질 신호) */
  function personHistory(sites, name, today) {
    var me = normName(name);
    today = isIsoDate(today) ? today : todayIso();
    var ent = [];
    var others = function (staff) { return (staff || []).map(str).filter(function (n) { return n && normName(n) !== me; }); };
    var mine = function (staff) { return (staff || []).some(function (n) { return normName(n) === me; }); };
    (sites || []).forEach(function (s) {
      if (!s) return;
      var days = (s.days || []).filter(function (d) { return d && isIsoDate(d.date); });
      days.forEach(function (d, i) {
        if (!mine(d.staff)) return;
        ent.push({ date: d.date, site: s, kind: '시공', with: others(d.staff), dayNo: i + 1, dayCount: days.length });
      });
      (s.services || []).forEach(function (v) {
        if (!v || !isIsoDate(v.date) || !mine(v.staff)) return;
        ent.push({ date: v.date, site: s, kind: v.kind === '추가' ? '추가' : 'AS', with: others(v.staff), request: str(v.request) });
      });
    });
    ent.forEach(function (e) {
      e.asAfter = e.kind !== '시공' ? 0 : (e.site.services || []).filter(function (v) {
        return v && v.kind !== '추가' && isIsoDate(v.date) && v.date > e.date;
      }).length;
    });
    ent.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : str(a.site.name).localeCompare(str(b.site.name)); });
    var past = ent.filter(function (e) { return e.date <= today; });
    var upcoming = ent.filter(function (e) { return e.date > today; });
    var dates = [];
    past.forEach(function (e) { if (dates.indexOf(e.date) === -1) dates.push(e.date); });
    past.forEach(function (e) { e.workDayNo = dates.indexOf(e.date) + 1; });
    var first = dates[0] || '';
    // 최근 8주 (월요일 시작) 일한 날 수
    var dow = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)).getDay();
    var thisMon = addDays(today, -((dow + 6) % 7));
    var weeks = [];
    for (var k = 7; k >= 0; k--) {
      var st = addDays(thisMon, -7 * k), en = addDays(st, 6);
      weeks.push({ start: st, count: dates.filter(function (d) { return d >= st && d <= en; }).length });
    }
    var pc = {};
    past.forEach(function (e) { e.with.forEach(function (n) { (pc[n] = pc[n] || {})[e.date] = true; }); });
    var partners = Object.keys(pc).map(function (n) { return { name: n, days: Object.keys(pc[n]).length }; })
      .sort(function (a, b) { return b.days - a.days || a.name.localeCompare(b.name); });
    var siteIds = {}, asIds = {};
    past.forEach(function (e) { if (e.kind === '시공') { siteIds[e.site.id] = true; if (e.asAfter) asIds[e.site.id] = true; } });
    return {
      first: first, last: dates[dates.length - 1] || '', workDays: dates.length, workedToday: dates.indexOf(today) !== -1,
      elapsed: first ? dayDiff(first, today) + 1 : 0,
      thisMonth: dates.filter(function (d) { return d.slice(0, 7) === today.slice(0, 7); }).length,
      weeks: weeks, partners: partners, sites: Object.keys(siteIds).length, asSites: Object.keys(asIds).length,
      past: past.slice().reverse(), upcoming: upcoming,
    };
  }

  /* 현장업무(관리자 앱) 작업 기록 (2026-10-23, 2026-10-24 탭 두 개로 줄임) — n8n worker-history 가 준 tasks 로
     품목별 경험(품목을 누르면 현장별로 펼침)과 현장별 경험을 낸다.
     tasks: [{ 현장ID, 현장명, 시공일자, 품목, 뒷정리, 밑작업, 시공, 밑작업완료, 시공완료, 전사진, 후사진 }]
     품목은 구역을 떼고 묶는다 ('방2샤시 2' → '샤시', '거실화장실문' → '화장실문'). 뒷정리(현장세팅·마무리)는 뺀다 */
  function itemKind(n) {
    var k = str(n).replace(/^\s*\d+층\s*/, '').replace(/^\s*(방\d+|안방|거실|주방|현관|드레스룸|다용도실|세탁실)\s*/, '')
      .replace(/\s*\d+\s*$/, '').trim();
    return k.length > 1 ? k : str(n).replace(/\s*\d+\s*$/, '').trim();   // '현관문' 이 '문' 이 되면 안 된다
  }
  /* sites = 이 앱의 현장 목록, name = 기사 이름. 이 앱 현장에 현장업무가 이어져 있으면(adminId) 날짜는
     그 기사가 실제로 일한 첫날(인원 칸), 아니면 현장업무의 시공일자. 현장업무 기록이 없는 이 앱 현장도 현장별에 남긴다.
     돌려줌: { kinds: [{ name, 밑, 밑완료, 시, 시완료, rows: [{ 현장ID, 현장명, date, 품목, 밑작업, 밑작업완료, 시공, 시공완료 }] }],
               sites: [{ key, siteId, 현장명, date, items: [...같은 줄], cleanup, noAdmin }] } — 둘 다 최근 순 */
  function workerExperience(tasks, sites, name) {
    var me = normName(name);
    var byAdmin = {}, byName = {}, workDate = {}, matched = {};
    (sites || []).forEach(function (s) {
      if (!s) return;
      var d = ((s.days || []).find(function (x) { return x && isIsoDate(x.date) && (x.staff || []).some(function (n) { return normName(n) === me; }); }) || {}).date || '';
      workDate[s.id] = d;
      if (s.adminId) byAdmin[s.adminId] = s;
      else byName[normName(titleLine(s))] = s;   // 현장업무를 안 이었으면 이름이 같은 현장으로 짝짓는다
    });
    var kinds = {}, siteMap = {};
    var siteOf = function (t) {
      var key = t.현장ID || ('nm:' + t.현장명);
      if (!siteMap[key]) {
        var local = (t.현장ID && byAdmin[t.현장ID]) || byName[normName(t.현장명)];
        if (local) matched[local.id] = true;
        siteMap[key] = { key: key, siteId: local ? local.id : '', 현장명: local ? titleLine(local) : str(t.현장명),
          date: (local && workDate[local.id]) || (isIsoDate(t.시공일자) ? t.시공일자 : ''), items: [], cleanup: 0, noAdmin: false };
      }
      return siteMap[key];
    };
    (tasks || []).forEach(function (t) {
      if (!t) return;
      var s = siteOf(t);
      if (t.뒷정리) { s.cleanup++; return; }
      var row = { 현장ID: t.현장ID || '', siteId: s.siteId, 현장명: s.현장명, date: s.date, 품목: str(t.품목),
        밑작업: !!t.밑작업, 밑작업완료: !!t.밑작업완료, 시공: !!t.시공, 시공완료: !!t.시공완료 };
      s.items.push(row);
      var k = itemKind(t.품목);
      var e = kinds[k] || (kinds[k] = { name: k, 밑: 0, 밑완료: 0, 시: 0, 시완료: 0, rows: [] });
      if (row.밑작업) { e.밑++; if (row.밑작업완료) e.밑완료++; }
      if (row.시공) { e.시++; if (row.시공완료) e.시완료++; }
      e.rows.push(row);
    });
    // 현장업무 기록이 없는 이 앱 현장 (연결 안 했거나 그 현장에서 맡은 품목이 없다)
    (sites || []).forEach(function (s) {
      if (!s || !workDate[s.id]) return;
      if (matched[s.id]) return;
      siteMap['local:' + s.id] = { key: 'local:' + s.id, siteId: s.id, 현장명: titleLine(s), date: workDate[s.id], items: [], cleanup: 0, noAdmin: true };
    });
    var byDate = function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : str(a.현장명).localeCompare(str(b.현장명)) || str(a.품목).localeCompare(str(b.품목)); };
    var kindList = Object.keys(kinds).map(function (k) { kinds[k].rows.sort(byDate); return kinds[k]; })
      .sort(function (a, b) { return (b.밑 + b.시) - (a.밑 + a.시) || a.name.localeCompare(b.name); });
    var siteList = Object.keys(siteMap).map(function (k) { return siteMap[k]; }).filter(function (s) { return s.items.length || s.noAdmin; }).sort(byDate);
    return { kinds: kindList, sites: siteList };
  }

  /* 하루 평가 저장값 (2026-10-23). 작업내역에서 평가 칸은 뺐지만(2026-10-24 사장님) 이미 매긴 값은 버리지 않고 둔다 */
  function normalizeEvals(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (name) {
      var n = str(name), days = raw[name];
      if (!n || !days || typeof days !== 'object') return;
      Object.keys(days).forEach(function (d) {
        var v = days[d] || {}, s = Math.round(Number(v.s) || 0), note = str(v.n);
        if (!isIsoDate(d)) return;
        if (s < 0 || s > 5) s = 0;
        if (!s && !note) return;
        (out[n] = out[n] || {})[d] = { s: s, n: note };
      });
    });
    return out;
  }

  var DEFAULT_REVIEW_QUESTIONS = ['시공후기', '개선사항은 무엇인가?', '견적과 다른 부분은 어떤 것이었나?'];
  var DEFAULT_REVIEW_TAGS = ['도배시공후', '바닥시공후'];
  var REVIEW_TAG_MAX = 5;

  function normalizeReview(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var answers = {};
    if (r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)) {
      Object.keys(r.answers).forEach(function (q) { answers[q] = r.answers[q] == null ? '' : String(r.answers[q]); });
    }
    var tags = [];
    (Array.isArray(r.tags) ? r.tags : []).forEach(function (t) {
      var v = String(t == null ? '' : t).trim();
      if (v && tags.indexOf(v) === -1 && tags.length < REVIEW_TAG_MAX) tags.push(v);
    });
    return { answers: answers, tags: tags };
  }
  function filledAnswers(site) {
    var a = (site && site.review && site.review.answers) || {};
    return Object.keys(a).filter(function (q) { return String(a[q] || '').trim(); });
  }
  function reviewHasContent(site) {
    return filledAnswers(site).length > 0 || !!(site && site.review && (site.review.tags || []).length);
  }
  function lastWorkDate(site) {
    var ds = (site && site.days || []).map(function (d) { return d && d.date; }).filter(isIsoDate).sort();
    return ds.length ? ds[ds.length - 1] : '';
  }
  // 시공 날짜가 모두 지났는데(오늘 작업 중이면 아직) 후기가 비었으면 알려 준다
  function reviewNeeded(site, today) {
    var last = lastWorkDate(site);
    return !!last && last < today && !reviewHasContent(site);
  }
  // 후기 탭에 보일 질문: 설정 질문 + 설정엔 없어졌지만 이 현장에 답이 남은 질문
  function reviewQuestionsOf(site, questions) {
    var out = (questions || []).slice();
    filledAnswers(site).forEach(function (q) { if (out.indexOf(q) === -1) out.push(q); });
    return out;
  }
  // 모아보기: 후기 있는 현장만, 마지막 시공일 최신순(날짜 없는 현장은 뒤).
  // question 을 주면 그 질문의 답이 있는 현장만, 그 답만 보인다
  function collectReviews(sites, opt) {
    var tag = opt && opt.tag, question = opt && opt.question;
    var out = [];
    (sites || []).forEach(function (s) {
      if (!reviewHasContent(s)) return;
      var tags = (s.review && s.review.tags) || [];
      if (tag && tags.indexOf(tag) === -1) return;
      var a = s.review.answers || {};
      var items = filledAnswers(s).filter(function (q) { return !question || q === question; })
        .map(function (q) { return { q: q, a: a[q] }; });
      if (question && !items.length) return;
      out.push({ site: s, lastDate: lastWorkDate(s), tags: tags.slice(), items: items });
    });
    return out.sort(function (x, y) {
      if (!x.lastDate !== !y.lastDate) return x.lastDate ? -1 : 1;
      return y.lastDate.localeCompare(x.lastDate);
    });
  }

  /* ---------- 할 일 (2026-10-14) ----------
     직접 넣는 할 일은 store 에 저장하고, 자동 할 일은 저장하지 않고 화면을 그릴 때마다 현장 상태로 계산한다.
     자동 할 일은 '오늘' 에만 뜬다 — 조건이 풀리면(필름 주문, 인원 채움, 부자재 체크) 저절로 사라진다.
     기준 일수는 설정(taskRules)에서 바꾼다. 시공 첫날이 지난 현장은 만들지 않는다 */
  var DEFAULT_TASK_RULES = { filmDays: 3, staffDays: 3, supplyDays: 1 };
  var MAX_TASK_DAYS = 14;
  function normalizeTaskRules(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    Object.keys(DEFAULT_TASK_RULES).forEach(function (k) {
      var v = Number(r[k]);
      out[k] = (isFinite(v) && v >= 0 && v <= MAX_TASK_DAYS && str(r[k]) !== '') ? Math.floor(v) : DEFAULT_TASK_RULES[k];
    });
    return out;
  }
  // 오늘부터 iso 까지 n 일 이하 남았나 (오늘 포함, 지난 날 제외)
  function within(today, iso, n) {
    if (!isIsoDate(iso)) return false;
    var d = dayDiff(today, iso);
    return d >= 0 && d <= n;
  }
  /* ---------- 필름 거래처(주문처) 2026-10-19 ----------
     필름을 주문하는 곳. 한솔·레놀릿처럼 주문처마다 담당자가 여러 명이고, 현장에서 필름명을 복사해
     그 담당자에게 바로 전화한다. settings.filmVendors = [{ id, name, people: [{ name, phone }] }] */
  function normalizeVendor(raw, i) {
    var v = raw && typeof raw === 'object' ? raw : {};
    var people = (Array.isArray(v.people) ? v.people : []).map(function (p) {
      return { name: str(p && p.name), phone: str(p && p.phone) };
    }).filter(function (p) { return p.name || p.phone; });
    return { id: str(v.id) || ('v' + (i + 1) + '_' + str(v.name).replace(/\s+/g, '')), name: str(v.name), people: people };
  }
  function filmVendors(settings) {
    return (((settings || {}).filmVendors) || []).map(normalizeVendor).filter(function (v) { return v.name; });
  }
  // 이 현장 필름명에 이름이 들어 있는 주문처 (한솔 콘크리트화이트 → 한솔). 없으면 null
  function vendorForSite(site, vendors) {
    var 글 = ((site && site.films) || []).map(function (r) { return str(r && r.code); }).join(' ').replace(/\s+/g, '').toLowerCase();
    if (!글) return null;
    var hit = (vendors || []).filter(function (v) {
      var n = v.name.replace(/\s+/g, '').toLowerCase();
      return n && 글.indexOf(n) !== -1;
    });
    return hit.length ? hit[0] : null;
  }

  /* ---------- 내 차 재고 (2026-10-19) ----------
     본드·장갑 같은 상비 부자재는 현장마다 '준비'하는 게 아니라 차에 싣고 다니다가 현장에서 꺼내 쓴다(불출).
     그래서 보충은 현장이 아니라 '나'에게 붙는 할 일이다 — 현장이 3곳이어도 할 일은 하나.
     목록은 설정의 부자재 기본 항목(settings.supplyDefaults = 차 상비품)을 그대로 쓰고,
     모자란 것만 settings.stockLow = { 품목명: true } 로 표시해 둔다. */
  function stockNames(settings) {
    var out = [], 본 = {};
    (((settings || {}).supplyDefaults) || []).forEach(function (n) {
      var v = str(n);
      if (v && !본[v]) { 본[v] = true; out.push(v); }
    });
    return out;
  }
  function isStockItem(settings, name) { return stockNames(settings).indexOf(str(name)) !== -1; }
  // 지금 모자란 상비품 이름들 (목록에서 빠진 이름은 무시)
  function stockLowNames(settings) {
    var low = ((settings || {}).stockLow) || {};
    return stockNames(settings).filter(function (n) { return !!low[n]; });
  }
  // 부족 표시를 켜고 끈 새 표를 돌려준다 (원본은 안 바뀐다)
  function setStockLow(settings, name, low) {
    var out = Object.assign({}, ((settings || {}).stockLow) || {});
    var n = str(name);
    if (!n) return out;
    if (low) out[n] = true; else delete out[n];
    return out;
  }

  function autoTasks(sites, today, rules, holds, settings) {
    var r = normalizeTaskRules(rules);
    var out = [];
    var make = function (kind, id, title, link) {
      out.push({ id: id, auto: true, kind: kind, title: title, date: today, time: '', link: link, done: false });
    };
    (sites || []).forEach(function (s) {
      if (!s || !s.id) return;
      var name = titleLine(s);
      var siteLink = { type: 'site', id: s.id, siteId: s.id, label: name };
      var first = str(s.date);
      if (within(today, first, r.filmDays) && filmStageOf(s) < 2) make('film', 'auto:film:' + s.id, '필름 주문: ' + name, siteLink);
      var st = staffStatus(s);
      if (within(today, first, r.staffDays) && st.short > 0) make('staff', 'auto:staff:' + s.id, '인원 모집: ' + name + ' (' + st.short + '명 부족)', siteLink);
      /* 현장 자재: 차에 늘 싣고 다니는 상비품(설정의 부자재 기본 항목)은 뺀다 —
         그건 아래 '차 보충' 할 일 하나로 본다. 그 현장에만 챙겨야 하는 것만 현장 할 일로 */
      var 특수 = (s.supplies || []).filter(function (x) {
        return x && str(x.name) && !x.ready && !isStockItem(settings, x.name) && !isSiliconeSupply(s, x.name);
      }).map(function (x) { return str(x.name); });
      // 실리콘은 보충에 시간이 걸려 따로, 2일 전부터 (부자재 기준 일수와 무관)
      var 실 = siliconeLeft(s);
      if (within(today, first, SILICONE_DAYS) && 실.length) {
        make('silicone', 'auto:silicone:' + s.id, '실리콘 준비: ' + name + ' (' + 실.join('·') + ')', siteLink);
      }
      if (within(today, first, r.supplyDays) && 특수.length) {
        make('supply', 'auto:supply:' + s.id, '현장 자재 챙기기: ' + name + ' (' + 특수.join('·') + ')', siteLink);
      }
      servicesOf(s).forEach(function (v) {
        if (v.done || !within(today, str(v.date), r.supplyDays)) return;
        var ready = v.toolsReady || [];
        var left = (v.tools || []).some(function (t) { return ready.indexOf(t) === -1; });
        if (!left) return;
        make('supply', 'auto:supply:' + s.id + ':' + v.id, serviceLabel(v) + ' 부자재: ' + name,
          { type: 'service', id: v.id, siteId: s.id, label: name + ' ' + serviceLabel(v) });
      });
    });
    // 차 보충 — 상비품 중 '부족' 으로 표시해 둔 게 있으면 하루에 하나 (현장과 무관한 내 할 일)
    var 모자란 = stockLowNames(settings);
    if (모자란.length) {
      out.push({ id: 'auto:stock', auto: true, kind: 'stock', date: today, time: '', link: null, done: false,
        title: '차 보충: ' + 모자란.join('·'), stockLow: 모자란 });
    }
    // 대기 인원이 남은 날 — 현장 배정을 잊지 않게 (인원 모집과 같은 기준 일수)
    Object.keys(holds || {}).sort().forEach(function (iso) {
      if (!within(today, iso, r.staffDays)) return;
      var open = heldOpen(holds, sites, iso);
      if (!open.length) return;
      out.push({ id: 'auto:hold:' + iso, auto: true, kind: 'hold', holdDate: iso, date: today, time: '', link: null, done: false,
        title: '인원 배정: ' + dayLabel(iso) + ' 대기 ' + open.length + '명 (' + open.join('·') + ')' });
    });
    return out;
  }
  // 밴드에 올리는 인원 모집 문구. 현장명·주소는 넣지 않는다(공개 게시판) — 동네 이름만
  function buildRecruitText(site) {
    var st = staffStatus(site);
    var days = daysOf(site).map(function (d) { return str(d.date); }).filter(isIsoDate).map(dayLabel);
    var lines = ['🙋 필름시공 같이 일하실 분 구합니다'];
    if (days.length) lines.push('📅 ' + days.join(', '));
    var rg = regionOf(site);
    if (rg) lines.push('📍 ' + rg);
    if (st.short) lines.push('👥 ' + st.short + '명');
    lines.push('가능하신 분 댓글이나 연락 주세요');
    return lines.join('\n');
  }
  /* ---------- 대기 인원 (2026-10-14) ----------
     사람을 먼저 그날로 잡아 두고 현장은 나중에 정한다. holds = { 'YYYY-MM-DD': [이름…] }.
     대기 = 잡아 둔 사람 − 그날 현장·AS 에 이미 들어간 사람. 현장에 넣으면 저절로 대기에서 빠진다 */
  var HOLD_KEEP_DAYS = 30;
  function normalizeHolds(raw, today) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    var oldest = isIsoDate(today) ? addDays(today, -HOLD_KEEP_DAYS) : '';
    Object.keys(raw).forEach(function (iso) {
      if (!isIsoDate(iso) || (oldest && iso < oldest)) return;
      var seen = {}, names = [];
      (Array.isArray(raw[iso]) ? raw[iso] : []).forEach(function (n) {
        var v = str(n), k = normName(v);
        if (v && !seen[k]) { seen[k] = 1; names.push(v); }
      });
      if (names.length) out[iso] = names;
    });
    return out;
  }
  function heldOpen(holds, sites, iso) {
    var list = (holds && holds[iso]) || [];
    if (!list.length) return [];
    var busy = {};
    (sites || []).forEach(function (s) {
      daysOf(s).forEach(function (d) { if (str(d.date) === iso) staffOf(d).forEach(function (n) { busy[normName(n)] = 1; }); });
      servicesOf(s).forEach(function (v) { if (str(v.date) === iso) staffOf(v).forEach(function (n) { busy[normName(n)] = 1; }); });
    });
    return list.filter(function (n) { return !busy[normName(n)]; });
  }

  /* ---------- 하루 수익 (2026-10-14) ----------
     사장님이 그날 인건비·자재비 등을 빼고 남은 돈을 직접 적는다. income = { 'YYYY-MM-DD': [{ id, amt(원), memo }] }.
     지난 날 기록이라 오래돼도 지우지 않는다. 금액 0·잘못된 날짜는 버린다 */
  function normalizeIncome(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (iso) {
      if (!isIsoDate(iso)) return;
      var list = [];
      (Array.isArray(raw[iso]) ? raw[iso] : []).forEach(function (e, i) {
        if (!e) return;
        var amt = Math.round(Number(e.amt) || 0);
        if (!amt) return;
        list.push({ id: str(e.id) || (iso + '-' + i), amt: amt, memo: str(e.memo) });
      });
      if (list.length) out[iso] = list;
    });
    return out;
  }
  function incomeOfDay(income, iso) {
    return ((income && income[iso]) || []).reduce(function (a, e) { return a + (Number(e.amt) || 0); }, 0);
  }
  // 'YYYY-MM' 한 달 합계와 적은 날 수
  function incomeOfMonth(income, ym) {
    var total = 0, days = 0;
    Object.keys(income || {}).forEach(function (iso) {
      if (iso.slice(0, 7) !== ym) return;
      var d = incomeOfDay(income, iso);
      if (d) { total += d; days++; }
    });
    return { total: total, days: days };
  }
  // 그 달 1일부터 iso 날까지 쌓인 합계 (달력 칸 아랫줄)
  function incomeRunning(income, iso) {
    var ym = String(iso).slice(0, 7), total = 0;
    Object.keys(income || {}).forEach(function (d) {
      if (d.slice(0, 7) === ym && d <= iso) total += incomeOfDay(income, d);
    });
    return total;
  }
  // 달력 칸용 짧은 표시: 400000 → '40만', 425000 → '42.5만', 85000 → '8.5만', -50000 → '-5만', 3000 → '3천'
  function manwon(amt) {
    var n = Math.round(Number(amt) || 0);
    if (!n) return '';
    var sign = n < 0 ? '-' : '', a = Math.abs(n);
    if (a < 10000) return sign + Math.round(a / 1000) + '천';
    var v = Math.round(a / 1000) / 10;   // 만원 단위, 소수 한 자리
    return sign + (v % 1 ? v.toFixed(1) : String(v)) + '만';
  }
  // 입력 칸: '40' 또는 '40만' 은 40만원, '425000' 처럼 큰 수는 원 단위로 본다. '-5' 는 -5만원(손해 본 날)
  function parseManwon(text) {
    var t = String(text == null ? '' : text).replace(/[,\s원]/g, '');
    var m = /^(-?)(\d+(?:\.\d+)?)(만)?$/.exec(t);
    if (!m) return 0;
    var v = parseFloat(m[2]);
    var won = (m[3] || v < 10000) ? Math.round(v * 10000) : Math.round(v);
    return m[1] ? -won : won;
  }
  function wonText(amt) {
    var n = Math.round(Number(amt) || 0);
    return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
  }

  // 같은 날 안의 순서: 시각 있는 것(이른 순) → 오전 → 오후 → 시간 없음
  function taskTimeKey(t) {
    var v = str(t && t.time);
    if (/^\d{2}:\d{2}$/.test(v)) return '1' + v;
    if (v === '오전') return '2';
    if (v === '오후') return '3';
    return '4';
  }
  function byTime(a, b) { return taskTimeKey(a).localeCompare(taskTimeKey(b)) || (a.createdAt || 0) - (b.createdAt || 0); }
  // 일정 화면용 묶기. overdue = 날짜가 지났는데 안 끝남(위 빨간 상자), undated = 날짜 없고 안 끝남,
  // byDate = 날짜마다 { open, done }. 지난 날짜의 안 끝난 할 일은 overdue 로만 간다
  function taskGroups(tasks, today) {
    var g = { overdue: [], undated: [], byDate: {} };
    var day = function (iso) { return g.byDate[iso] || (g.byDate[iso] = { open: [], done: [] }); };
    (tasks || []).forEach(function (t) {
      if (!t) return;
      var d = str(t.date);
      if (!isIsoDate(d)) { if (!t.done) g.undated.push(t); return; }
      if (t.done) { day(d).done.push(t); return; }
      if (d < today) { g.overdue.push(t); day(d); return; }
      day(d).open.push(t);
    });
    g.overdue.sort(function (a, b) { return a.date.localeCompare(b.date) || byTime(a, b); });
    g.undated.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    Object.keys(g.byDate).forEach(function (k) { g.byDate[k].open.sort(byTime); g.byDate[k].done.sort(byTime); });
    return g;
  }

  /* ---------- 필름 겹침 (2026-10-22) ----------
     필름 번호가 비슷해서 가까운 날짜 현장끼리 같은 필름을 두 번 시키는 일이 잦다.
     번호는 공백·하이픈·대소문자를 빼고 비교한다(PW-881 = pw 881). 필름 줄마다 orderedAt('YYYY-MM-DD' | '') 로 주문을 남긴다.
     현장의 '필름 시점' 은 시공 첫날(site.date) — 필름은 첫날 전에 와 있어야 한다 */
  var FILM_NEAR_DAYS = 7;     // 앞뒤 이만큼 안이면 '겹침'
  function filmKey(code) { return str(code).replace(/[\s\-_.]/g, '').toUpperCase(); }
  // 한 현장 안에서 번호별로 한 번 — 같은 번호 줄이 여럿이면 모두 주문돼야 '주문'(가장 늦은 날짜)
  function siteFilmKeys(site) {
    var out = [], byKey = {};
    ((site && site.films) || []).forEach(function (r) {
      var k = filmKey(r && r.code);
      if (!k) return;
      var o = isIsoDate(r.orderedAt) ? r.orderedAt : '';
      if (!byKey[k]) { byKey[k] = { key: k, code: str(r.code), orderedAt: o, all: !!o }; out.push(byKey[k]); return; }
      var e = byKey[k];
      e.all = e.all && !!o;
      if (o && o > e.orderedAt) e.orderedAt = o;
    });
    /* 상태는 필름 전체 보기(filmStatus)와 같은 규칙 — 단계 띠에서 '주문'·'수령' 을 누르면 줄마다 주문을
       안 찍어도 주문한 것이다 (2026-10-24: 다 시켰는데 '그쪽 미주문' 이 뜨던 문제) */
    var st = filmStageOf(site);
    return out.map(function (e) {
      var at = e.all ? e.orderedAt : '';
      return { key: e.key, code: e.code, orderedAt: at, status: st >= 3 ? '수령' : (st === 2 || at) ? '주문' : '미주문' };
    });
  }
  function near(a, b) { return isIsoDate(a) && isIsoDate(b) && Math.abs(dayDiff(a, b)) <= FILM_NEAR_DAYS; }
  // 이 현장의 이 번호가 가까운 날 다른 현장에도 있나 → [{ site, date, orderedAt }]
  function filmOverlaps(sites, site, code) {
    var k = filmKey(code);
    if (!k || !site || !isIsoDate(site.date)) return [];
    var out = [];
    (sites || []).forEach(function (s) {
      if (!s || s.id === site.id || !near(site.date, s.date)) return;
      siteFilmKeys(s).forEach(function (e) { if (e.key === k) out.push({ site: s, date: s.date, orderedAt: e.orderedAt, status: e.status }); });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  }
  /* 겹침 경고 한 줄 (2026-10-24 사장님: 간단하게) — '10/23(금) 소사역 푸르지오 현장(pk디자인)'.
     현장명에서 동·호수는 뗀다. clientName 은 거래처 이름 (없으면 괄호 없이) */
  function siteShortName(site) {
    var t = titleLine(site).replace(/\s*\d+\s*동.*$/, '').trim();
    return t || titleLine(site);
  }
  function filmOverlapText(x, clientName) {
    var c = str(clientName);
    return dayLabel(x.date) + ' ' + siteShortName(x.site) + ' 현장' + (c ? '(' + c + ')' : '');
  }
  /* 현장 화면·할 일 창용 겹침 (2026-10-24 사장님) — 이미 끝난 현장은 빼고 앞으로 남은 일정만.
     그쪽 마지막 작업일이 오늘 전이면 지나간 일정 (오늘 작업 중이면 아직 남은 것) */
  function filmOverlapsAhead(sites, site, code, today) {
    var t = today || todayIso();
    return filmOverlaps(sites, site, code).filter(function (x) {
      var last = lastWorkDate(x.site) || str(x.date);
      return last >= t;
    });
  }
  // 모아보기: today 부터 days 일 안에 시작하는 현장의 필름을 번호별로. 두 곳 이상 쓰는 번호 먼저, 그다음 이른 날짜
  function filmBoard(sites, today, days) {
    var end = addDays(today, (days || 14) - 1);
    var groups = {}, order = [];
    (sites || []).filter(function (s) { return s && isIsoDate(s.date) && s.date >= today && s.date <= end; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)); })
      .forEach(function (s) {
        siteFilmKeys(s).forEach(function (e) {
          if (!groups[e.key]) { groups[e.key] = { key: e.key, code: e.code, uses: [] }; order.push(groups[e.key]); }
          groups[e.key].uses.push({ site: s, date: s.date, orderedAt: e.orderedAt, status: e.status });
        });
      });
    var idx = function (g) { return order.indexOf(g); };
    return order.slice().sort(function (a, b) {
      var da = a.uses.length > 1 ? 0 : 1, db = b.uses.length > 1 ? 0 : 1;
      return (da - db) || (idx(a) - idx(b));
    });
  }
  // 모아보기에서 아직 안 시킨 번호만 (번호마다 한 줄)
  function filmBoardText(board) {
    return (board || []).filter(function (g) { return g.uses.some(function (u) { return u.status === '미주문'; }); })
      .map(function (g) { return g.code; }).join('\n');
  }
  // 달력 '필름' 보기: 시공 첫날 칸에 그 현장 필름 번호. 앞뒤 7일 안 다른 현장에도 있으면 dup
  function dateFilms(sites) {
    var out = {};
    (sites || []).forEach(function (s) {
      if (!s || !isIsoDate(s.date)) return;
      siteFilmKeys(s).forEach(function (e) {
        (out[s.date] = out[s.date] || []).push({ code: e.code, dup: filmOverlaps(sites, s, e.code).length > 0 });
      });
    });
    return out;
  }
  /* 날짜별 주문 내역 (2026-10-22) — 사용자: '날짜별로 주문한 내역이 나와야 겹치는 걸 확인할 수 있다'.
     today 기준 days 일 전부터 주문한 줄을 주문한 날짜별로(최근 먼저). 같은 날·같은 현장·같은 번호는 한 줄(시공위치는 모아 적음).
     dup = 그 기간에 이 번호를 주문한 현장 수 (2 이상이면 겹침) */
  function filmOrderLog(sites, today, days) {
    var from = addDays(today, -((days || 30) - 1));
    var byDate = {}, sitesByKey = {};
    (sites || []).forEach(function (s) {
      ((s && s.films) || []).forEach(function (r) {
        var k = filmKey(r && r.code), o = r && r.orderedAt;
        if (!k || !isIsoDate(o) || o < from || o > today) return;
        (sitesByKey[k] = sitesByKey[k] || {})[s.id] = 1;
        var day = byDate[o] = byDate[o] || {};
        var id = s.id + '|' + k;
        if (!day[id]) day[id] = { code: str(r.code), key: k, site: s, siteDate: str(s.date), places: [] };
        if (str(r.place) && day[id].places.indexOf(str(r.place)) === -1) day[id].places.push(str(r.place));
      });
    });
    return Object.keys(byDate).sort().reverse().map(function (date) {
      var items = Object.keys(byDate[date]).map(function (id) {
        var it = byDate[date][id];
        var n = Object.keys(sitesByKey[it.key]).length;
        return { code: it.code, key: it.key, site: it.site, siteDate: it.siteDate, places: it.places.join(', '), dup: n > 1 ? n : 0 };
      });
      return { date: date, items: items };
    });
  }
  // 이 번호를 최근 days 일 안에 다른 현장에서 주문한 기록 → [{ site, orderedAt }] (최근 먼저)
  function filmOrderedBefore(sites, site, code, today, days) {
    var k = filmKey(code);
    if (!k) return [];
    var from = addDays(today, -((days || 30) - 1));
    var out = [];
    (sites || []).forEach(function (s) {
      if (!s || (site && s.id === site.id)) return;
      var best = '';
      ((s.films) || []).forEach(function (r) {
        var o = r && r.orderedAt;
        if (filmKey(r && r.code) === k && isIsoDate(o) && o >= from && o <= today && o > best) best = o;
      });
      if (best) out.push({ site: s, orderedAt: best });
    });
    return out.sort(function (a, b) { return a.orderedAt < b.orderedAt ? 1 : -1; });
  }
  /* 필름 전체 보기 (2026-10-22) — 사용자: '필름칸에 넣어진 모든 필름넘버를 알려주고 주문/수령 단계를 표시'.
     시공 첫날이 today-back ~ today+ahead 인 현장의 번호 있는 줄 전부를 시공 날짜별 → 현장별로.
     줄 단계: 현장 단계 수령(3) → '수령', 줄에 주문 날짜가 있거나 현장 단계 주문(2) → '주문', 아니면 '미주문'.
     dup = 이 범위 안에서 이 번호가 들어간 현장 수 (2 이상이면 겹침) */
  function filmStatus(site, row) {
    var st = filmStageOf(site);
    if (st >= 3) return '수령';
    if (st === 2 || isIsoDate(row && row.orderedAt)) return '주문';
    return '미주문';
  }
  function filmSchedule(sites, today, back, ahead) {
    var from = addDays(today, -(back || 0)), to = addDays(today, ahead || 14);
    var list = (sites || []).filter(function (s) { return s && isIsoDate(s.date) && s.date >= from && s.date <= to; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)); });
    var sitesByKey = {};
    list.forEach(function (s) { (s.films || []).forEach(function (r) { var k = filmKey(r && r.code); if (k) (sitesByKey[k] = sitesByKey[k] || {})[s.id] = 1; }); });
    var days = [], byDate = {};
    list.forEach(function (s) {
      var rows = (s.films || []).filter(function (r) { return r && filmKey(r.code); }).map(function (r) {
        var k = filmKey(r.code), n = Object.keys(sitesByKey[k]).length;
        return { code: str(r.code), key: k, place: str(r.place), status: filmStatus(s, r),
          orderedAt: isIsoDate(r.orderedAt) ? r.orderedAt : '', dup: n > 1 ? n : 0 };
      });
      if (!rows.length) return;
      if (!byDate[s.date]) { byDate[s.date] = { date: s.date, sites: [] }; days.push(byDate[s.date]); }
      byDate[s.date].sites.push({ site: s, stage: filmStageOf(s), rows: rows });
    });
    return days;
  }
  function filmScheduleText(days) {
    var seen = {}, out = [];
    (days || []).forEach(function (d) { d.sites.forEach(function (x) { x.rows.forEach(function (r) {
      if (r.status === '미주문' && !seen[r.key]) { seen[r.key] = 1; out.push(r.code); }
    }); }); });
    return out.join('\n');
  }
  function filmOrderCount(site) {
    var rows = ((site && site.films) || []).filter(function (r) { return r && filmKey(r.code); });
    return { ordered: rows.filter(function (r) { return isIsoDate(r.orderedAt); }).length, total: rows.length };
  }

  var Share = {
    filmKey: filmKey,
    choseong: choseong, nameInitial: nameInitial, nameMatch: nameMatch, staffFrequency: staffFrequency,
    busyElsewhere: busyElsewhere, staffPickGroups: staffPickGroups,
    filmOverlaps: filmOverlaps, filmOverlapsAhead: filmOverlapsAhead, filmOverlapText: filmOverlapText, siteShortName: siteShortName,
    filmBoard: filmBoard,
    filmBoardText: filmBoardText,
    dateFilms: dateFilms,
    filmOrderCount: filmOrderCount,
    filmSchedule: filmSchedule,
    filmScheduleText: filmScheduleText,
    filmStatus: filmStatus,
    filmOrderLog: filmOrderLog,
    filmOrderedBefore: filmOrderedBefore,
    WORKER_KEY: WORKER_KEY,
    workerLink: workerLink,
    DEFAULT_TASK_RULES: DEFAULT_TASK_RULES,
    normalizeTaskRules: normalizeTaskRules,
    autoTasks: autoTasks,
    filmVendors: filmVendors,
    vendorForSite: vendorForSite,
    stockNames: stockNames,
    isStockItem: isStockItem,
    stockLowNames: stockLowNames,
    setStockLow: setStockLow,
    taskTimeKey: taskTimeKey,
    taskGroups: taskGroups,
    normalizeHolds: normalizeHolds,
    normalizeIncome: normalizeIncome, incomeOfDay: incomeOfDay, incomeOfMonth: incomeOfMonth, incomeRunning: incomeRunning,
    manwon: manwon, parseManwon: parseManwon, wonText: wonText,
    heldOpen: heldOpen,
    ownerRows: ownerRows,
    ownerLine: ownerLine,
    buildRecruitText: buildRecruitText,
    personHistory: personHistory,
    itemKind: itemKind,
    workerExperience: workerExperience,
    normalizeEvals: normalizeEvals,
    DEFAULT_REVIEW_QUESTIONS: DEFAULT_REVIEW_QUESTIONS,
    DEFAULT_REVIEW_TAGS: DEFAULT_REVIEW_TAGS,
    REVIEW_TAG_MAX: REVIEW_TAG_MAX,
    normalizeReview: normalizeReview,
    reviewHasContent: reviewHasContent,
    reviewNeeded: reviewNeeded,
    reviewQuestionsOf: reviewQuestionsOf,
    collectReviews: collectReviews,
    FIELDS: FIELDS,
    linkUrl: linkUrl,
    FIELD_MAP: FIELD_MAP,
    DEFAULT_QUESTIONS: DEFAULT_QUESTIONS,
    COLOR_COUNT: COLOR_COUNT,
    TAB_COLORS: TAB_COLORS,
    tabColorOf: tabColorOf,
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
    navAddress: navAddress,
    filmOrderText: filmOrderText,
    filmOrderMessage: filmOrderMessage,
    phoneDigits: phoneDigits,
    telHref: telHref,
    smsHref: smsHref,
    isIosUA: isIosUA,
    newFilmRow: newFilmRow,
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
    staffTotal: staffTotal,
    staffTotalLabel: staffTotalLabel,
    dayStaffCount: dayStaffCount,
    staffCountLabel: staffCountLabel,
    DEFAULT_START_TIME: DEFAULT_START_TIME,
    DEFAULT_BARRIER: DEFAULT_BARRIER,
    FILM_STAGES: FILM_STAGES,
    isUrgent: isUrgent,
    filmStageOf: filmStageOf,
    filmOrderLate: filmOrderLate,
    SILICONE_COLORS: SILICONE_COLORS, SILICONE_DAYS: SILICONE_DAYS, siliconeOf: siliconeOf, siliconeName: siliconeName,
    siliconeLeft: siliconeLeft, siliconeLate: siliconeLate, siliconeShareLine: siliconeShareLine,
    dayDiff: dayDiff,
    datesLine: datesLine,
    workSummary: workSummary,
    monthGrid: monthGrid,
    monthGridFull: monthGridFull,
    dayLabel: dayLabel,
    holidayName: holidayName,
    isRedDay: isRedDay,
    personOf: personOf,
    payOf: payOf,
    PAY_MIN: PAY_MIN,
    PAY_MAX: PAY_MAX,
    mergePerson: mergePerson,
    PERSON_GRADES: PERSON_GRADES,
    contactKey: contactKey,
    clientContactsOf: clientContactsOf,
    serviceBizContact: serviceBizContact,
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
