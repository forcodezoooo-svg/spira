# Spira Launch Checklist

> Version : MVP v1.0
>
> 목적
>
> Spira를 실제 사용자에게 배포 가능한 수준의 서비스로 완성하기 위한 체크리스트.
>
> 새로운 기능보다 서비스의 완성도와 사용자 경험을 중심으로 점검한다.
>
> 배포 대상 : **웹앱 + 아이패드 앱(App Store)**. (안드로이드는 이번 범위에서 제외)
>
> 표기 : `[x]` 완료 · `[~]` 부분 완료 · `[ ]` 미착수

---

# 실행 순서 (Execution Roadmap)

> Phase는 "무엇을 만들지" 목록, 아래 STEP은 "어떤 순서로 만들지" 실행 계획.
> 토대(계정+DB)를 먼저 세우고, 배포는 실기기 테스트가 필요한 중간 시점에 1차로 끼워 넣는다.

- [x] **STEP 1. 계정 + 데이터베이스** — 로그인 강제(라우트 보호), 서버 DB 도입, localStorage → 서버 저장 이전, 데이터 분리·동기화·백업  *(Phase 4·5·7)*
- [x] **STEP 2. 핵심/브랜드 기능** — 나의 여정 지도(깃발 수집)
- [x] **STEP 3. 온보딩 + UX 완성도** — 첫 실행 온보딩, 티칭 투어, 로딩 모션·Skeleton, 에러 처리 UI·메시지 통일, Empty/Success State  *(Phase 2)*
- [x] **STEP 4. 1차 웹 배포 + 결제 + 반응형** — 토스페이먼츠 구독(구독·해지·주기변경 예약·자동갱신·플랜별 기능 제한), 랜딩페이지, 피드백 수집, 모바일 반응형, SEO(OG·sitemap/robots), 보안 P0(AI 라우트 로그인 필수), 약관·개인정보 템플릿  *(Vercel 배포: spira-wcwm.vercel.app · 카카오 제외 · 토스 테스트키)*

### 정식 런칭 준비 (다음 실행 순서)

- [ ] **STEP 5. 계정 정리** — 새 개발자 구글 계정 정지 해결(이의신청) → GitHub·Vercel·Supabase 이전 완료  *(현재 대기)*
- [ ] **STEP 6. 사업자 등록** — 개인사업자 등록(홈택스) + 통신판매업 신고(정부24)
- [ ] **STEP 7. 도메인 연결** — 도메인 구매 → Vercel 연결 + `NEXT_PUBLIC_SITE_URL` 갱신 + Supabase 리다이렉트 URL 갱신
- [ ] **STEP 8. 브랜딩·법적 마무리** — 구글 OAuth 동의화면(App name=Spira·로고·약관/개인정보 URL) + 약관·개인정보 `[대괄호]` 채우기(상호·대표자·사업자번호·문의처)
- [ ] **STEP 9. 토스 실결제 전환** — 토스 계약 심사 → 테스트키 → 라이브키 교체
- [ ] **STEP 10. 애널리틱스 + 모니터링** — Vercel Analytics(방문자 분석) + Sentry(에러 자동 감지)
- [ ] **STEP 11. 회원가입 메일 브랜딩** — Supabase Custom SMTP(내 도메인에서 발송, Resend 등)
- [ ] **STEP 12. 관리자용 피드백 페이지** — 앱 내에서 피드백 열람(현재는 Supabase에서 직접 확인)

### 이후 (별도 트랙)

- [ ] **STEP 13. iPad 앱 & App Store** — Capacitor iOS 래핑, iPad 최적화, IAP 심사, TestFlight → 출시  *(Phase 12)*
- [ ] **STEP 14. 기능 개선** — 알림 시스템, 위젯, 루틴 시스템 UI·주간 회고 등 미완성 기능, 지속 개선  *(Phase 2·13)*

---

# Phase 1. Core Product

## Core Features

- [x] Workspace 생성
- [x] Program 생성
- [x] Goal 생성
- [ ] Routine System 생성  (데이터 모델은 있으나 전용 UI 없음)
- [x] Task 생성 및 관리
- [ ] Season 관리
- [x] 비용 관리 (Resources)
- [x] AI Assistant 기능 (Sparky)
- [x] Home Dashboard
- [x] Calendar (Task · Goals)
- [ ] Review 기능 (주간 회고)
- [ ] **나의 여정 지도 (깃발 수집)** — 목표 달성 시 깃발을 모아 나만의 지도를 완성하는 핵심/브랜드 기능 (현재 링크만 자리표시자)

---

# Phase 2. UX Completion

## Onboarding

- [x] 첫 실행 온보딩 (사업 정보 → AI 기획서 초안 + 분기 목표 + 업무 영역 생성)
- [x] Workspace 생성 플로우 (온보딩에서 자동 생성)
- [x] 첫 Goal 생성 (분기 목표 제안 → Goals 반영)
- [ ] 첫 Routine 생성 (루틴 전용 UI 미구현)
- [x] 첫 Task 생성 (티칭 투어: 업무 생성 → 캘린더 드래그 배치)
- [x] 첫 Home 진입 (티칭 투어: 타이머 시작 → 여정 깃발 획득)

---

## User Progress

- [x] 현재 사용자 단계 관리 (성장 단계 카드)
- [ ] Next Action 추천
- [x] 진행률 표시 (프로젝트 진행바)
- [x] 빈 화면(Empty State) UX — 공통 EmptyState (Home·Task·Goals·Resources)
- [x] 완료 화면(Success State) — 공통 SuccessState (오늘 업무 전부 완료 축하 등)

---

## Notification

- [ ] 앱 내부 알림
- [ ] **사용자 단계 기반 알림** (온보딩/성장 단계에 따른 안내)
- [ ] **사용자 상황 기반 알림** (미완료 업무·정체 감지 등 맥락 알림)
- [ ] AI 추천 알림
- [ ] 루틴 리마인드
- [ ] Goal 마감 알림
- [ ] Weekly Review 알림
- [ ] **푸시 알림 (웹 Push / iOS APNs)**

---

## Loading

- [x] Loading UI (브랜드 로더 + 스켈레톤)
- [x] Skeleton UI (Home·Task·Goals·Resources·Plan)
- [x] AI 응답 대기 화면 (생각 중 말줄임표)
- [x] **로딩 모션 (브랜드 로딩 애니메이션)** — 라임 링 스피너 + 로고 바운스

---

## Error Handling

- [x] API 실패 (사용자용 에러 UI) — 토스트 알림
- [x] 네트워크 오류 (동기화·저장 실패 토스트 + 자동 재시도)
- [x] 저장 실패 (서버 저장 실패 토스트 + 자동 재시도, 복구 시 해제)
- [x] AI 응답 실패 (사용자용 안내) — 채팅 내 안내 메시지

---

## Widget

- [ ] **위젯 기능** (오늘의 업무 / 여정 지도 진행 등)
- [ ] 웹 위젯(임베드) 또는 iPadOS 홈 위젯(WidgetKit)
- [ ] 위젯 데이터 동기화

---

# Phase 3. Brand Experience

## Branding

- [x] 브랜드 컬러 적용
- [x] Typography 적용 (SUIT)
- [x] Icon System
- [x] Motion (채팅 등장 등)
- [ ] Empty Illustration
- [x] AI 캐릭터 (Sparky)
- [ ] Splash Screen
- [ ] **여정 지도 브랜딩** (깃발 디자인 · 수집 연출 · 나만의 지도 완성 경험)

---

## Tone & Voice

- [x] AI Assistant 톤 적용
- [x] 시스템 메시지 통일
- [x] 에러 메시지 통일 (lib/copy.ts ERR — 토스트로 일관 표시)
- [x] 완료 메시지 통일

---

# Phase 4. User Account

## Authentication

- [x] Google Login (Supabase Auth)
- [~] Kakao Login (연동됨 · 이메일 스코프는 사업자 인증 후 — STEP 6)
- [ ] **Apple Login** (App Store 정책상 소셜 로그인 제공 시 애플 로그인 필수)
- [x] 라우트 보호 (비로그인 접근 차단, proxy.ts)

---

## User Profile

- [ ] **사용자 프로필 페이지**
- [ ] 사업 정보
- [ ] 알림 설정
- [ ] AI 설정

---

# Phase 5. Database

## User Data

- [x] Workspace 저장 (Supabase app_data)
- [x] Program 저장
- [x] Goal 저장
- [x] Routine 저장
- [x] Task 저장
- [ ] Review 저장 (기능 미구현)
- [ ] 여정 지도(깃발) 저장 (기능 미구현)

> 모든 데이터를 사용자별 app_data(jsonb)로 서버에 저장. localStorage는 오프라인 캐시로 유지.

---

## Cloud Sync

- [x] 자동 저장 (변경 시 디바운스 서버 저장)
- [~] 실시간 동기화 (로그인/새로고침 시 서버 pull — 실시간 아님)
- [x] 여러 기기 지원 (웹 ↔ 아이패드, 계정 로그인 시 데이터 따라옴)

---

# Phase 6. Monetization (결제)

## Billing

- [ ] 구독 플랜 정의 (Free / Pro 등)
- [ ] **결제 연결** — 웹: Stripe / iOS 앱: In-App Purchase(App Store 정책상 디지털 상품은 IAP 필수)
- [ ] **결제 관리 페이지** (플랜 변경 · 결제 수단 · 영수증)
- [ ] 구독 상태/권한 처리 (플랜별 기능 제한)
- [ ] 결제 실패/환불 처리

---

# Phase 7. Security

## API

- [x] API Key 서버 보관
- [x] 환경 변수 분리
- [ ] Rate Limit (AI 호출)

---

## Privacy

- [x] 사용자 데이터 분리 (Supabase RLS — 본인 데이터만 접근)
- [ ] HTTPS (배포 시 자동 충족)
- [ ] 개인정보 처리방침
- [ ] 서비스 이용약관

---

## Backup

- [ ] Database Backup
- [ ] Restore

---

# Phase 8. Performance

- [ ] 이미지 최적화
- [ ] 코드 분할
- [ ] Lazy Loading
- [ ] 캐싱
- [ ] Lighthouse 점검

---

# Phase 9. Feedback & Support

- [x] **프로그램 피드백 수집** (앱 내부) — 사이드바 '의견 보내기' 모달 → Supabase `feedback` 테이블 (supabase/feedback.sql)
- [x] 버그 리포트 (피드백 유형: 🐞 버그 신고)
- [x] 기능 요청 (피드백 유형: 💡 기능 제안)
- [~] 문의/지원 채널 (유형: 💬 문의·기타 수집 중 · 별도 지원 채널 미연결)

---

# Phase 10. QA

## Functional Test

- [ ] 모든 버튼 테스트
- [ ] AI 기능 테스트
- [ ] CRUD 테스트

---

## UX Test

- [ ] 온보딩 테스트
- [ ] 신규 사용자 테스트
- [ ] 장기 사용 테스트

---

## Responsive

- [x] Desktop
- [ ] **iPad (주요 타깃)**
- [x] Mobile Web (Home·Resources·여정지도·헤더·사이드바 실기기 대응)

---

# Phase 11. Web Launch

## Production

- [x] Production Build
- [x] Vercel 배포 (spira-wcwm.vercel.app · main 브랜치 자동 배포 · Hobby 무료)
- [ ] 도메인 연결
- [ ] Analytics 연결

---

## SEO

- [x] Meta Tag (기본 title/description)
- [ ] Open Graph
- [ ] Sitemap

---

# Phase 12. iPad / iOS App (App Store)

## 앱 패키징

- [ ] 웹 → 앱 래핑 (Capacitor iOS 등)
- [ ] iPad 레이아웃 최적화
- [ ] iOS/iPadOS 빌드 (Xcode)
- [ ] 권한 설정 (알림 등)
- [ ] 앱 아이콘
- [ ] Splash Screen
- [ ] 위젯 확장 (WidgetKit)

---

## App Store

- [ ] Apple Developer 등록
- [ ] 앱 이름 / 설명
- [ ] 스크린샷 (iPad)
- [ ] 개인정보처리방침 URL
- [ ] App Privacy(데이터 수집 고지) 작성
- [ ] In-App Purchase 심사 준비
- [ ] TestFlight 베타
- [ ] 심사 제출 / 정식 출시

---

# Phase 13. After Launch

## Analytics

- [ ] 사용자 행동 분석
- [ ] AI 사용량 분석
- [ ] Goal 생성률
- [ ] Task 완료율

---

## Continuous Improvement

- [ ] UX 개선
- [ ] AI 개선
- [ ] 신규 기능
- [ ] 성능 개선

---

# MVP Success Criteria

출시 전 아래 항목을 모두 만족해야 한다.

- 사용자는 가입 후 5분 안에 첫 프로젝트를 생성할 수 있다.
- AI가 Business Planning을 정상 수행한다.
- Goal → Routine → Task가 자동으로 연결된다.
- 오늘 해야 할 업무를 Home에서 바로 확인할 수 있다.
- 목표 달성 시 깃발이 모여 나의 여정 지도가 채워진다.
- 모든 데이터가 계정에 안전하게 저장되고 기기 간 동기화된다.
- 웹과 아이패드에서 동일한 경험을 제공한다.
- 치명적인 오류 없이 1주일 이상 테스트를 완료한다.
