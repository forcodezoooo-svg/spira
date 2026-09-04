import Link from 'next/link';
import { ReactNode } from 'react';

// 공개 랜딩 페이지 (비로그인 방문자용). 로그인한 사용자는 proxy.ts에서 /home 으로 보냄.
// 앱 크롬(사이드바 등)은 AppFrame의 bare 처리로 렌더되지 않는다.
// 시안(모바일 세로형 단일 컬럼)에 맞춰: 히어로 → 공감 카드 → 포지셔닝 → 4단계 흐름
// → Sparky 소개 → 기능 4개(스크린샷) → 마무리 CTA.

const DARK = '#16271B';   // 다크 그린 카드 배경
const LIME = '#9DFE3B';   // 포인트 라임
const INK = '#16211E';    // 본문 진한 텍스트
const EMBLEM = '#002929'; // 시안 엠블럼(딥 틸) — 히어로 카피/버튼·활성 메뉴 아이콘
const HL = '#2E9E1E';     // 본문 강조(브랜드 그린, 채도 ↑) — 흰 배경에서 잘 읽히는 톤

// 본문 속 중요 문구를 부분 볼드 + 브랜드 그린으로 강조 (내용이 바로 읽히게)
function Em({ children, color = HL }: { children: ReactNode; color?: string }) {
  return <b style={{ color }}>{children}</b>;
}

// ── 아이콘(마스크) : 단색 SVG를 지정 색으로 렌더 ──────────────────────────────
function MaskIcon({ src, size = 18, color = LIME }: { src: string; size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block flex-shrink-0"
      style={{
        width: size, height: size, backgroundColor: color,
        WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center', maskPosition: 'center',
        WebkitMaskSize: 'contain', maskSize: 'contain',
      }}
    />
  );
}

const Check = () => (
  <span className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: LIME }}>
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" style={{ color: DARK }}><path d="M2.5 6.3l2.3 2.3 4.7-5.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

// ── 제품 UI 미니목업 (Resources·Home은 코드로 재현, Plan·Goals는 에셋 사용) ──

// 작은 Sparky 아이콘 (초록 원 + 마스코트)
function SparkyDot() {
  return (
    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#5FD93A', color: INK, boxShadow: '0 6px 16px rgba(95,217,58,0.45)' }}>
      <svg viewBox="0 0 37 34" style={{ width: 20, height: 18 }} fill="currentColor">
        <path d="M24.2739 8.23248C31.1271 8.23248 36.7056 13.811 36.7056 20.6642H32.3406C32.3406 16.2162 28.7219 12.5976 24.2739 12.5976V8.23248Z" />
        <path d="M11.1655 6.10352e-05C15.7008 6.10352e-05 19.3937 3.69291 19.3937 8.22822H16.504C16.504 5.28616 14.1076 2.88974 11.1655 2.88974V6.10352e-05Z" />
        <path d="M25.588 6.10352e-05C21.0527 6.10352e-05 17.3599 3.69291 17.3599 8.22822H20.2495C20.2495 5.28616 22.646 2.88974 25.588 2.88974V6.10352e-05Z" />
        <path d="M12.4317 8.73444C5.57856 8.73444 0 14.313 0 21.1662H4.36507C4.36507 16.7182 7.98372 13.0995 12.4317 13.0995V8.73444Z" />
        <path d="M20.5376 13.3572H16.2206C16.2206 17.7572 12.6412 21.3365 8.24121 21.3365V25.6536C12.6412 25.6536 16.2206 29.2329 16.2206 33.6329H20.5376C20.5376 29.2329 24.117 25.6536 28.517 25.6536V21.3365C24.117 21.3365 20.5376 17.7572 20.5376 13.3572ZM18.3769 26.6837C17.517 25.4353 16.4344 24.3528 15.1904 23.4972C16.4388 22.6373 17.5214 21.5548 18.3769 20.3107C19.2368 21.5591 20.3194 22.6417 21.5634 23.4972C20.315 24.3572 19.2325 25.4397 18.3769 26.6837Z" />
        <path d="M18.3764 10.1924C20.2616 10.1924 21.7899 8.66418 21.7899 6.77896C21.7899 4.89375 20.2616 3.36548 18.3764 3.36548C16.4912 3.36548 14.9629 4.89375 14.9629 6.77896C14.9629 8.66418 16.4912 10.1924 18.3764 10.1924Z" />
      </svg>
    </span>
  );
}

const flowArrow = (
  <svg className="w-4 h-4 my-1" viewBox="0 0 16 16" fill="none" style={{ color: '#C4CCC4' }}><path d="M8 3v9M4.5 8.5L8 12l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// 목표 → Task 계층 흐름 (초록 → 화이트 그라데이션)
function HierarchyMock() {
  // 위에서 아래로 진해진 초록 → 점점 연해져 화이트
  const tier = (label: string, bg: string, border: string, glow: string) => (
    <div className="rounded-full px-7 py-2.5 text-center text-[13px] font-bold w-full" style={{ backgroundColor: bg, color: INK, border: `1.5px solid ${border}`, boxShadow: `0 8px 20px ${glow}` }}>{label}</div>
  );
  return (
    <div className="flex flex-col items-center w-full" style={{ maxWidth: 220 }}>
      {tier('사업목표', LIME, LIME, 'rgba(157,254,59,0.45)')}
      {flowArrow}
      {tier('프로젝트', '#C6FB86', '#C6FB86', 'rgba(157,254,59,0.30)')}
      {flowArrow}
      {tier('업무영역별 산출물', '#E6FDCB', '#E6FDCB', 'rgba(157,254,59,0.18)')}
      {flowArrow}
      {tier('Task', '#FFFFFF', '#E3F3D2', 'rgba(0,0,0,0.06)')}
    </div>
  );
}

// 오늘 가용시간 카드 + task
function CapacityMock() {
  const row = (name: string) => (
    <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5" style={{ border: '1px solid #EFEFEA', boxShadow: '0 8px 20px rgba(0,0,0,0.05)' }}>
      <span className="w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: '#C7CEC7' }} />
      <span className="text-[12px] font-bold flex-1 min-w-0 truncate" style={{ color: INK }}>{name}</span>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>매주</span>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: '#DDF4C4', color: '#3E7A2E' }}>30분</span>
    </div>
  );
  return (
    <div className="w-full space-y-2" style={{ maxWidth: 300 }}>
      <div className="bg-white rounded-2xl px-4 py-3.5" style={{ boxShadow: '0 14px 34px rgba(0,0,0,0.08)', border: '1px solid #EFEFEA' }}>
        <div className="flex items-center justify-between mb-2.5 gap-2">
          <span className="text-[13px] font-black flex-shrink-0" style={{ color: INK }}>오늘 가용시간</span>
          <span className="text-[10px]" style={{ color: '#9AA39D' }}>가용 <b style={{ color: INK }}>5.5h</b> · 계획 <b style={{ color: '#3E7A2E' }}>4h30m</b> · Buffer 30m</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F0F0EA' }}>
          <div className="h-full rounded-full" style={{ width: '82%', backgroundColor: LIME }} />
        </div>
      </div>
      {row('첫 번째 게시글 업로드')}
      {row('두 번째 게시글 계획')}
    </div>
  );
}

// 재무 스탯 흐름 — 모든 박스 동일 폭, 계산식 일치(수익−고정비용−투자비−비상금=개인순이익, 양수)
function FinanceMock() {
  const pill = (label: string, value: string, dark?: boolean) => (
    <div className="rounded-2xl px-2.5 py-2 text-center flex-shrink-0" style={{ width: 98, backgroundColor: dark ? DARK : '#fff', border: dark ? 'none' : `1.5px solid ${LIME}`, boxShadow: dark ? '0 6px 16px rgba(22,39,27,0.28)' : '0 6px 15px rgba(157,254,59,0.30)' }}>
      <p className="text-[9px] font-bold mb-0.5 whitespace-nowrap" style={{ color: dark ? '#9FB3A0' : '#9AA39D' }}>{label}</p>
      <p className="text-[12px] font-black tabular-nums whitespace-nowrap" style={{ color: dark ? LIME : INK }}>{value}</p>
    </div>
  );
  const op = (s: string) => <span className="text-[15px] font-bold flex-shrink-0" style={{ color: '#C4CCC4' }}>{s}</span>;
  return (
    <div className="flex items-center justify-center gap-1.5 flex-nowrap mx-auto w-max" style={{ transform: 'scale(1.15)', transformOrigin: 'center' }}>
      {pill('수익', '₩3,200,000')}
      {op('−')}
      {pill('고정비용', '₩1,200,000')}
      {op('−')}
      {pill('프로젝트 투자비', '₩600,000')}
      {op('−')}
      {pill('비상금 10%', '₩320,000')}
      {op('=')}
      {pill('개인순이익', '+₩1,080,000', true)}
    </div>
  );
}

// Sparky 재조정 채팅 카드
function RescheduleMock() {
  return (
    <div className="w-full" style={{ maxWidth: 300 }}>
      <div className="flex items-start gap-2.5">
        <SparkyDot />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[12px] leading-relaxed" style={{ backgroundColor: '#F1F1EB', color: '#3E4A44', boxShadow: '0 10px 26px rgba(0,0,0,0.06)' }}>
            새로운 프로젝트를 담을 영역까지 정해뒀고, 구체적인 산출물까지 설정해뒀어요. 각 업무의 목표와 필요한 일정에 맞춰 재조정도 진행했어요.
            <br /><br />
            반복 업무 3개를 완료했어요. 각 항목을 눌러 내용을 정확히 다듬을 수 있어요.
          </div>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-bold" style={{ backgroundColor: LIME, color: INK, boxShadow: '0 8px 20px rgba(157,254,59,0.45)' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.3 2.3 4.7-5.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            반영 완료
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 공감 카드 항목 ──────────────────────────────────────────────────────────
const PAINS: ReactNode[] = [
  <>기획, 디자인, 개발, 마케팅… 혼자 다 하다 보니 <Em>일이 뒤섞이고 정리가 안 된다.</Em></>,
  <>계획은 세웠는데, <Em>내 시간 안에 정말 다 할 수 있을지</Em> 모르겠다.</>,
  <>하고 싶은 건 많은데, <Em>지금 가진 자금으로 어디까지 할 수 있을지</Em> 막막하다.</>,
  <>갑자기 새로운 일이 생기거나 일정이 밀리면 <Em>계획 전체가 꼬여버린다.</Em></>,
];

// 4단계 흐름
const FLOW = [
  { icon: '/plan_icon.svg', name: 'Plan', desc: '비즈니스를\n기획하고' },
  { icon: '/goals_icon.svg', name: 'Process', desc: '업무 일정을\n계획하고' },
  { icon: '/resources_icon.svg', name: 'Financial', desc: '자금을\n관리하고' },
  { icon: '/home_icon.svg', name: 'Home', desc: '하나하나\n실행해요' },
];

// 기능 섹션 (좌우 교차)
const FEATURES = [
  {
    title: '큰 목표를 실행 가능한 일로',
    desc: '사업의 방향과 목표부터 프로젝트, 영역별 업무, Task까지 단계적으로 계획하세요.',
    mock: <HierarchyMock />,
    reverse: false,
  },
  {
    title: '내 시간 안에서 가능한 계획으로',
    desc: '하루에 담을 수 있는 시간을 바탕으로 무리하지 않는 일정을 만드세요.',
    mock: <CapacityMock />,
    reverse: true,
  },
  {
    title: '계획과 돈을 함께',
    desc: '현재 자금과 앞으로 필요한 비용까지 고려해 사업의 자금 계획을 세우세요.',
    mock: <FinanceMock />,
    reverse: false,
    full: true,
  },
  {
    title: '계획이 틀어져도 다시',
    desc: '새로운 일이 생기거나 일정이 밀려도 전체 계획을 다시 조율하세요.',
    mock: <RescheduleMock />,
    reverse: true,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: '#F8F8F8', color: INK }}>
      {/* ══ 히어로 ══ */}
      {/* 데스크톱: 첨부 배경 SVG를 그대로 깔고 텍스트를 오버레이 (배경 비율 유지) */}
      <section
        className="hidden md:block relative w-full"
        style={{ aspectRatio: '1920 / 1228', backgroundImage: 'url(/hero-bg.svg)', backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }}
      >
        {/* 로고 (좌상단) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/type-logo.svg" alt="SpirA" className="absolute left-[6%] top-[3.5%] w-auto" style={{ height: 'clamp(26px, 2.4vw, 42px)' }} />
        {/* 우상단 로그인 */}
        <Link href="/login" className="absolute right-[6%] top-[3.5%] font-semibold px-4 py-2 rounded-full transition-colors hover:bg-black/5" style={{ fontSize: 'clamp(13px, 1vw, 16px)', color: EMBLEM }}>로그인</Link>

        {/* 히어로 카피 (그린 영역 좌측 중앙) */}
        <div className="absolute left-[6%]" style={{ top: '58%', transform: 'translateY(-50%)', maxWidth: '52%' }}>
          <h1 className="font-black leading-[1.2] tracking-[-0.03em]" style={{ color: EMBLEM, fontSize: 'clamp(26px, 3.5vw, 52px)' }}>
            해야 할 일이 너무 많아<br />무엇부터 할지 모르겠다면
          </h1>
          <p className="font-medium" style={{ color: EMBLEM, fontSize: 'clamp(14px, 1.35vw, 21px)', marginTop: 'clamp(14px, 1.4vw, 22px)' }}>
            1인 창업자를 위한 AI 워크스페이스 SpirA
          </p>
          <Link
            href="/login"
            className="inline-block rounded-full font-bold transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: EMBLEM, color: '#fff', fontSize: 'clamp(13px, 1.05vw, 17px)', padding: 'clamp(9px,0.85vw,14px) clamp(18px,1.55vw,28px)', marginTop: 'clamp(18px,1.8vw,30px)' }}
          >
            무료로 시작하기
          </Link>
        </div>
      </section>

      {/* 모바일: 배경이 너무 납작해지므로 그린 그라데이션 + 세로 스택 */}
      <section className="md:hidden relative overflow-hidden px-6 pt-7 pb-16" style={{ background: 'linear-gradient(158deg, #E9FFD0 0%, #C3FF7A 60%, #B7F56C 100%)' }}>
        <div className="flex items-center justify-between mb-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/type-logo.svg" alt="SpirA" className="h-6 w-auto" />
          <Link href="/login" className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full transition-colors hover:bg-black/5" style={{ color: EMBLEM }}>로그인</Link>
        </div>
        <h1 className="text-[29px] font-black leading-[1.2] tracking-[-0.03em]" style={{ color: EMBLEM }}>
          해야 할 일이 너무 많아<br />무엇부터 할지 모르겠다면
        </h1>
        <p className="mt-4 text-[15px] font-medium" style={{ color: EMBLEM }}>
          1인 창업자를 위한 AI 워크스페이스 SpirA
        </p>
        <Link
          href="/login"
          className="inline-block mt-6 px-5 py-2.5 rounded-full text-[14px] font-bold transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: EMBLEM, color: '#fff' }}
        >
          무료로 시작하기
        </Link>
        {/* 데코 다이아몬드 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/diamond.svg" alt="" aria-hidden className="absolute top-8 right-8 w-4 opacity-90" />
      </section>

      {/* 표지(히어로) 아래 설명 영역 전체를 10% 확대 (이미지·텍스트 함께) */}
      <div style={{ zoom: 1.1 }}>
      {/* ══ 공감 카드 ══ */}
      <section className="max-w-3xl mx-auto px-6 pt-14 pb-20">
        <div className="rounded-[26px] px-7 py-9 sm:px-12 sm:py-11 bg-white" style={{ border: '1px solid #EFEFEA', boxShadow: '0 20px 50px rgba(0,0,0,0.06)' }}>
          <h2 className="text-[18px] sm:text-[21px] font-black text-center mb-7" style={{ color: INK }}>
            나만의 비즈니스를 준비하면서<br />이런 경험 있나요?
          </h2>
          <ul className="space-y-3.5 w-fit max-w-full mx-auto">
            {PAINS.map((t, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px] sm:text-[15px] leading-relaxed" style={{ color: '#3E4A44' }}>
                <Check /><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ══ 포지셔닝 ══ */}
      <section className="max-w-xl mx-auto px-6 pb-16 text-center">
        <p className="text-[15px] sm:text-[16px] leading-[1.85]" style={{ color: '#44514B' }}>
          <Em>Spira</Em>는 단순히 생산성을 높이는 To-do 앱이 아니에요.
          혼자 사업을 만들어가는 창업자를 위해 <Em>비즈니스의 방향과 우선순위</Em>를 관리하고,
          지금 가장 중요한 <Em>다음 한 걸음</Em>을 제안하는 AI 워크스페이스예요.
        </p>
      </section>

      {/* ══ 4단계 흐름 ══ */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="flex items-stretch justify-center gap-2 sm:gap-3 flex-wrap">
          {FLOW.map((f, i) => (
            <div key={f.name} className="flex items-center gap-2 sm:gap-3">
              <div className="bg-white rounded-2xl px-4 py-5 text-center w-[132px] sm:w-[150px]" style={{ boxShadow: '0 10px 26px rgba(0,0,0,0.05)', border: '1px solid #EFEFEA' }}>
                {/* 실제 서비스 메뉴바의 '활성' 아이콘 모습 — 라임 라운드 네모 + 딥틸 아이콘 */}
                <div className="flex justify-center mb-3">
                  <span className="w-11 h-11 rounded-[14px] flex items-center justify-center" style={{ backgroundColor: LIME, boxShadow: '0 6px 16px rgba(157,254,59,0.50)' }}>
                    <MaskIcon src={f.icon} size={20} color={EMBLEM} />
                  </span>
                </div>
                <p className="text-[15px] font-black mb-1" style={{ color: INK }}>{f.name}</p>
                <p className="text-[12px] leading-snug whitespace-pre-line" style={{ color: '#8A938C' }}>{f.desc}</p>
              </div>
              {i < FLOW.length - 1 && (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: '#C4CCC4' }}><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══ Sparky 소개 ══ */}
      <section className="max-w-xl mx-auto px-6 pb-24 text-center">
        {/* 말풍선 (첨부 에셋) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/speech-bubble.svg" alt="꿈꾸던 미래로 나아가는 첫 걸음을 도와줄게요!" className="block mx-auto w-full max-w-[300px] h-auto" />
        {/* 실제 서비스의 Sparky AI 채팅 버튼 */}
        <div className="w-[55px] h-[55px] rounded-full mx-auto mb-6 mt-[15px] flex items-center justify-center" style={{ backgroundColor: '#5FD93A', color: '#16211E', boxShadow: '0 8px 22px rgba(95,217,58,0.50)' }}>
          <svg viewBox="0 0 37 34" style={{ width: 39, height: 35 }} fill="currentColor">
            <path d="M24.2739 8.23248C31.1271 8.23248 36.7056 13.811 36.7056 20.6642H32.3406C32.3406 16.2162 28.7219 12.5976 24.2739 12.5976V8.23248Z" />
            <path d="M11.1655 6.10352e-05C15.7008 6.10352e-05 19.3937 3.69291 19.3937 8.22822H16.504C16.504 5.28616 14.1076 2.88974 11.1655 2.88974V6.10352e-05Z" />
            <path d="M25.588 6.10352e-05C21.0527 6.10352e-05 17.3599 3.69291 17.3599 8.22822H20.2495C20.2495 5.28616 22.646 2.88974 25.588 2.88974V6.10352e-05Z" />
            <path d="M12.4317 8.73444C5.57856 8.73444 0 14.313 0 21.1662H4.36507C4.36507 16.7182 7.98372 13.0995 12.4317 13.0995V8.73444Z" />
            <path d="M20.5376 13.3572H16.2206C16.2206 17.7572 12.6412 21.3365 8.24121 21.3365V25.6536C12.6412 25.6536 16.2206 29.2329 16.2206 33.6329H20.5376C20.5376 29.2329 24.117 25.6536 28.517 25.6536V21.3365C24.117 21.3365 20.5376 17.7572 20.5376 13.3572ZM18.3769 26.6837C17.517 25.4353 16.4344 24.3528 15.1904 23.4972C16.4388 22.6373 17.5214 21.5548 18.3769 20.3107C19.2368 21.5591 20.3194 22.6417 21.5634 23.4972C20.315 24.3572 19.2325 25.4397 18.3769 26.6837Z" />
            <path d="M18.3764 10.1924C20.2616 10.1924 21.7899 8.66418 21.7899 6.77896C21.7899 4.89375 20.2616 3.36548 18.3764 3.36548C16.4912 3.36548 14.9629 4.89375 14.9629 6.77896C14.9629 8.66418 16.4912 10.1924 18.3764 10.1924Z" />
          </svg>
        </div>
        <h2 className="text-[21px] sm:text-[24px] font-black tracking-[-0.02em] mb-3" style={{ color: INK }}>
          Spira의 전용 AI assistant, Sparky.
        </h2>
        <p className="text-[15px] leading-relaxed max-w-md mx-auto" style={{ color: '#5B6560' }}>
          <Em>어렵고 잘 몰라도 괜찮아요.</Em> 막연한 아이디어와 고민들을 자유롭게 털어놓으면 <Em>Sparky가 정리해줄 거예요.</Em>
        </p>
      </section>

      {/* ══ 기능 4개 (좌우 교차) ══ */}
      <section className="max-w-4xl mx-auto px-6 pt-4 pb-[110px] sm:pb-[170px] space-y-[150px] sm:space-y-[220px]">
        {FEATURES.map(f => ('full' in f && f.full) ? (
          // 전체폭: 텍스트 위, 그래픽은 한 줄로 아래에 길게
          <div key={f.title}>
            <h3 className="text-[21px] sm:text-[24px] font-black tracking-[-0.02em] leading-[1.3] mb-3 whitespace-pre-line" style={{ color: INK }}>{f.title}</h3>
            <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: '#5B6560' }}>{f.desc}</p>
            <div className="mt-5 w-full overflow-x-auto pt-5 pb-10 px-1">{f.mock}</div>
          </div>
        ) : (
          <div key={f.title} className="grid md:grid-cols-2 gap-10 md:gap-8 items-center">
            {/* 텍스트 */}
            <div className={f.reverse ? 'md:order-2' : ''}>
              <h3 className="text-[21px] sm:text-[24px] font-black tracking-[-0.02em] leading-[1.3] mb-3 whitespace-pre-line" style={{ color: INK }}>
                {f.title}
              </h3>
              <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: '#5B6560' }}>{f.desc}</p>
            </div>
            {/* 목업 */}
            <div className={`flex justify-center ${f.reverse ? 'md:order-1 md:justify-start' : 'md:justify-end'}`}>
              {f.mock}
            </div>
          </div>
        ))}
      </section>

      {/* ══ 마무리 CTA ══ */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <div className="rounded-[30px] px-8 py-14 text-center" style={{ backgroundColor: DARK }}>
          <h2 className="text-[22px] sm:text-[28px] font-black leading-[1.35] tracking-[-0.02em] mb-4" style={{ color: '#F4F8F2' }}>
            당신의 비즈니스가<br />길을 잃지 않고 나아갈 수 있도록
          </h2>
          <p className="text-[14px] sm:text-[15px] leading-relaxed mb-8 max-w-md mx-auto" style={{ color: '#9FB3A0' }}>
            혼자 사업을 만들어가는 당신을 위한 <Em color={LIME}>AI 워크스페이스.</Em><br className="hidden sm:block" /> <Em color={LIME}>지금 무료로 시작해보세요.</Em>
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3.5 rounded-full text-[16px] font-bold transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: LIME, color: DARK }}
          >
            무료로 시작하기
          </Link>
        </div>
      </section>
      </div>

      {/* ══ 푸터 ══ */}
      <footer className="border-t" style={{ borderColor: 'rgba(0,41,41,0.08)' }}>
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="w-5 h-auto opacity-70" />
            <span className="text-[13px]" style={{ color: '#9AA39D' }}>© 2026 Spira</span>
          </div>
          <div className="flex items-center gap-3 text-[12px]" style={{ color: '#9AA39D' }}>
            <Link href="/terms" className="transition-colors hover:text-[#5B6560]">이용약관</Link>
            <span style={{ color: '#DDE3DD' }}>·</span>
            <Link href="/privacy" className="transition-colors hover:text-[#5B6560]">개인정보처리방침</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
