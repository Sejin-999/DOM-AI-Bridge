# Chrome Web Store 배포 가이드

## 1) 사전 준비
- Chrome Web Store 개발자 계정 등록(1회): https://developer.chrome.com/docs/webstore/register
- 개발자 콘솔 기본 설정(게시자명, 이메일 인증): https://developer.chrome.com/docs/webstore/set-up-account
- `manifest.json`의 `version` 최신화

## 2) 배포용 ZIP 만들기
- 프로젝트 루트에서 실행:

```bash
mkdir -p release
zip -r "release/agentation-dom-inspector-v1.0.0.zip" . \
  -x "*.DS_Store" \
     ".git/*" \
     ".claude/*" \
     "release/*"
```

- 핵심: `.claude` 폴더는 배포 ZIP에서 제외

## 3) 스토어 업로드
- 대시보드: https://chromewebstore.google.com/
- `Add new item` -> ZIP 업로드
- 참고: https://developer.chrome.com/docs/webstore/publish

## 4) 스토어 입력 항목
- Listing(이름/설명/스크린샷): https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Privacy(개인정보/데이터 처리 고지): https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/
- Distribution(공개 범위 설정): https://developer.chrome.com/docs/webstore/cws-dashboard-distribution

## 5) 공개 전략
- 1차: `Unlisted`로 링크 배포 테스트
- 2차: 문제 없으면 `Public` 전환

## 6) 심사 리젝 방지 체크
- 권한(`permissions`, `host_permissions`) 사용 목적을 설명에 명확히 작성
- 페이지 DOM/텍스트 처리 방식과 외부 전송 여부를 Privacy에 정확히 표기
- 동작 영상/스크린샷은 실제 기능 흐름(선택/검색/설정) 기준으로 준비

## 7) 배포 후 운영
- 수정 배포 시 `manifest.json`의 `version` 증가 후 재업로드
- 심사 승인 후 릴리즈 노트 업데이트
