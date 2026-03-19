# Privacy Policy / 개인정보처리방침

Last updated: March 19, 2026  
최종 업데이트: 2026년 3월 19일

This policy applies to the Chrome extension **DOM AI Bridge**.
본 방침은 크롬 확장 프로그램 **DOM AI Bridge**에 적용됩니다.

## 1) What this extension does / 확장 프로그램 목적

DOM AI Bridge helps users select and inspect DOM elements on webpages, then copy/export data in AI, JSON, or Share formats.  
DOM AI Bridge는 웹페이지에서 DOM 요소를 선택/확인하고 AI, JSON, 공유용 포맷으로 복사/내보내기 하도록 돕습니다.

## 2) Data processed / 처리되는 데이터

### A. Data processed locally on your device / 사용자 기기 내 로컬 처리

- Selected element information (selector, annotation, element text preview, bounding box)
- Current page URL (for status display and export metadata)
- User settings stored in extension storage:
  - language
  - shortcut platform preference
  - highlight colors
  - marker visibility
  - webhook settings (enabled flag, URL, custom headers)

다음 데이터는 기본적으로 사용자 기기에서 로컬로 처리됩니다.

- 선택한 요소 정보(셀렉터, 주석, 텍스트 미리보기, 바운딩 박스)
- 현재 페이지 URL(상태 표시 및 내보내기 메타데이터)
- 확장 프로그램 설정값:
  - 언어
  - 단축키 OS 설정
  - 하이라이트 색상
  - 마커 표시 여부
  - 웹훅 설정(활성화 여부, URL, 커스텀 헤더)

### B. Data sent externally (only if user enables Webhook) / 외부 전송(사용자가 웹훅을 켠 경우에만)

If Webhook is enabled by the user, the extension sends data to the user-configured webhook endpoint only when the user explicitly performs a copy action in a matched format.

사용자가 Webhook 기능을 활성화한 경우에만, 사용자가 명시적으로 복사 액션을 수행했을 때 매칭된 포맷 기준으로 사용자 지정 웹훅 엔드포인트로 데이터가 전송됩니다.

Payload may include:

- export data in `ai`, `json`, `plain` formats
- metadata such as current page URL, selection count, locale, and timestamp
- custom headers explicitly configured by the user

전송 payload에는 다음이 포함될 수 있습니다.

- `ai`, `json`, `plain` 포맷의 내보내기 데이터
- 현재 페이지 URL, 선택 개수, 언어, 전송 시각 등의 메타데이터
- 사용자가 직접 설정한 커스텀 헤더

## 3) What we do NOT collect / 수집하지 않는 정보

We do not intentionally collect or sell:

- personally identifying information (name, address, phone, email as account identity)
- health data
- financial/payment data
- authentication secrets (passwords, PINs, security answers)
- private communications (email/chat content unrelated to selected webpage content)
- precise geolocation

당사는 다음 정보를 의도적으로 수집하거나 판매하지 않습니다.

- 개인 식별 정보(이름, 주소, 전화번호, 계정 식별용 이메일 등)
- 건강 정보
- 금융/결제 정보
- 인증 정보(비밀번호, PIN, 보안질문 답변 등)
- 사적인 커뮤니케이션 내용(웹페이지 선택 데이터와 무관한 메일/채팅 등)
- 정밀 위치 정보

## 4) Data sharing / 제3자 제공

- We do not sell user data.
- We do not transfer user data for purposes unrelated to the extension's dedicated purpose.
- Third-party transfer occurs only when the user explicitly enables Webhook and configures an endpoint.

- 사용자 데이터를 판매하지 않습니다.
- 확장 프로그램의 전용 목적과 무관한 목적으로 사용자 데이터를 전송하지 않습니다.
- 제3자 전송은 사용자가 Webhook를 직접 활성화하고 엔드포인트를 설정한 경우에만 발생합니다.

## 5) Storage and retention / 저장 및 보관

- Settings are stored locally using Chrome extension storage.
- The developer does not operate a separate backend to store your extension data by default.
- You can clear data by uninstalling the extension or clearing extension storage/settings.

- 설정값은 Chrome 확장 프로그램 저장소에 로컬 저장됩니다.
- 개발자는 기본적으로 사용자 데이터를 별도 서버에 저장하지 않습니다.
- 확장 프로그램 삭제 또는 설정 초기화를 통해 데이터를 제거할 수 있습니다.

## 6) Security notice / 보안 안내

If you enable Webhook, data is transmitted to the endpoint you provide.  
You are responsible for endpoint security, access control, and retention policy at that destination.

Webhook를 활성화하면 데이터가 사용자가 지정한 엔드포인트로 전송됩니다.  
해당 목적지의 보안, 접근통제, 보관정책에 대한 책임은 사용자에게 있습니다.

## 7) Permissions usage summary / 권한 사용 요약

- `activeTab`: interact with the current tab when user uses the extension
- `storage`: save user preferences
- `scripting`: run DOM selection/highlight behavior
- `host_permissions (<all_urls>)`: support DOM inspection across arbitrary webpages chosen by the user
- `all_frames`: allow selection/highlighting inside iframe content as part of the current page
- `match_about_blank`: include `about:blank` / `srcdoc` frames that many apps use internally

- `activeTab`: 사용자가 확장 기능을 실행한 현재 탭과 상호작용
- `storage`: 사용자 설정 저장
- `scripting`: DOM 선택/하이라이트 기능 실행
- `host_permissions (<all_urls>)`: 사용자가 연 웹페이지 전반에서 DOM 검사 기능 제공
- `all_frames`: 현재 페이지의 일부인 iframe 내부 요소도 선택/하이라이트 가능하게 함
- `match_about_blank`: 많은 웹앱이 내부적으로 사용하는 `about:blank` / `srcdoc` 프레임까지 포함함

The extension is designed around explicit user action. Selection UI becomes active only after the user clicks the popup button or uses the shortcut, and export/transmission happens only when the user explicitly copies data.

본 확장 프로그램은 명시적 사용자 액션을 전제로 설계되었습니다. 팝업 버튼 클릭 또는 단축키 실행 이후에만 선택 UI가 활성화되며, 내보내기/전송도 사용자가 직접 복사를 실행한 경우에만 발생합니다.

## 8) Changes to this policy / 방침 변경

We may update this policy to reflect feature or legal changes.  
Material updates will be reflected by changing the "Last updated" date above.

기능 또는 법적 요구사항 변경에 따라 본 방침이 업데이트될 수 있습니다.  
중요 변경사항은 상단의 최종 업데이트 일자를 통해 반영됩니다.

## 9) Contact / 문의

- Developer: Yang Sejin  
- GitHub: https://github.com/Sejin-999  
- Email: sejinyang49@gmail.com
