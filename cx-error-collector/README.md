# CX 에러 수집기

고객 에러 로그를 버튼 두 번으로 수집하는 Chrome 확장 프로그램.

HAR 파일이나 개발자 도구 없이, 비개발자 고객도 쉽게 에러 정보를 CX 담당자에게 전달할 수 있습니다.

---

## 수집하는 정보

- **HTTP 에러** — 4xx / 5xx 응답 (URL, 상태코드, 소요시간)
- **느린 요청** — 3초 이상 걸린 요청
- **콘솔 에러** — `console.error`, `console.warn`, 미처리 예외

---

## 설치 방법

> Chrome 브라우저만 있으면 됩니다. 별도 가입/계정 불필요.

**1. 파일 받기**

이 저장소의 `cx-error-collector/` 폴더를 통째로 받습니다.

- GitHub: 초록 버튼 **Code → Download ZIP** → 압축 해제
- 또는 팀에서 공유한 ZIP 파일 압축 해제

**2. Chrome에서 로드**

1. Chrome 주소창에 **`chrome://extensions`** 입력
2. 우측 상단 **"개발자 모드"** 스위치 ON
3. **"압축해제된 확장 프로그램을 로드합니다"** 클릭
4. `cx-error-collector` 폴더 선택

툴바에 아이콘이 생기면 설치 완료입니다.

---

## 사용 방법

1. 에러를 재현하려는 페이지에서 툴바 아이콘 클릭
2. **녹화 시작** 버튼 클릭
3. 문제가 발생하는 동작 수행
4. **녹화 끝** 버튼 클릭
5. 결과를 **복사** 또는 **JSON 다운로드**해서 CX 담당자에게 전달

---

## 결과물 예시

```
=== CX 에러 수집 리포트 ===
수집 시작: 2026-03-22 10:30:45
수집 완료: 2026-03-22 10:31:12
브라우저: Chrome 123 / Windows 11

[HTTP 에러] 1건
  - [500 Internal Server Error] POST /api/users/update
    시각: 10:30:58
    페이지: https://app.example.com/settings
    소요: 2.34s

[느린 요청] 1건 (3초 이상)
  - GET /api/report/export
    소요: 5.12s
    페이지: https://app.example.com/dashboard

[콘솔 에러] 1건
  - [error] Cannot read properties of undefined (reading 'id')
    페이지: https://app.example.com/settings
========================
```

---

## 주의사항

- 개발자 모드로 설치한 확장은 Chrome 업데이트 후 간혹 "비활성화됨" 경고가 뜰 수 있습니다. **"사용 설정"** 을 다시 누르면 됩니다.
- 수집된 데이터는 기기 내에만 저장되며 외부로 전송되지 않습니다.
