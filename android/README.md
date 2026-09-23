# 현장 일정 위젯 (안드로이드)

현장관리 웹앱의 일정 화면을 홈 화면 위젯으로 띄우는 작은 앱.
받기: https://jayunsu22.github.io/sitenote/download/schedule-widget.apk

## 어떻게 동작하나
- 웹앱 데이터는 크롬 안(localStorage)에 있어서 위젯이 직접 못 읽는다.
  웹앱이 자동으로 올려 두는 백업을 위젯 전용 주소(`sitenote-schedule`, n8n '현장관리_위젯일정')로
  받아 와서 보여준다. 거래처 이름과 일정 칸만 온다 — 복원용 `sitenote-restore` 는 사진 원본까지
  주므로 30분마다 받기엔 무겁다. 앱을 처음 열 때 백업키를 한 번 넣는다.
- 30분마다, 또는 위젯의 ⟳ 를 누르면 새로 받는다. 받은 시각을 머리줄에 적는다.
- 일정 규칙(`Schedule.kt`)은 웹앱 `share.js`·`app.js` 를 그대로 옮긴 것이다.
  **규칙을 바꾸면 양쪽을 같이 바꾼다.** 색도 `colors.xml` ↔ `style.css` 가 같은 값이다.

## 빌드
```
ANDROID_HOME=/opt/android-sdk \
SITENOTE_KEYSTORE=/경로/sitenote-widget.jks SITENOTE_KEYSTORE_PASS=… \
gradle :app:assembleRelease
```
- 서명 키는 저장소에 넣지 않는다(공개 저장소). 키 없이 빌드하면 디버그 키로 서명되는데,
  그러면 이미 깔린 앱 위에 업데이트가 안 되고 지웠다 다시 깔아야 한다.
- 새 판을 낼 때는 `versionCode` 를 올리고 `download/schedule-widget.apk` 를 바꾼다.

## 확인
- `gradle :app:testReleaseUnitTest` — 일정 규칙 단위 테스트
- 웹앱과 결과가 같은지: `RealDataDump` 에 실제 백업 JSON 을 넣어 `share.js` 결과와 diff.
  실제 백업에는 현관 비번·연락처가 있으니 **파일을 저장소에 넣지 말 것.**
- 위젯 그림(에뮬레이터 없이): `RENDER_PREVIEW=1 PREVIEW_JSON=… PREVIEW_OUT=out.png`
  `gradle :app:testReleaseUnitTest --tests '*WidgetPreview*'` — Robolectric 으로 실제 RemoteViews 를 그린다.
