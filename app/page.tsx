import Link from 'next/link';

// 공개 랜딩 페이지 (비로그인 방문자용). 로그인한 사용자는 proxy.ts에서 /home 으로 보냄.
// 앱 크롬(사이드바 등)은 AppFrame의 bare 처리로 렌더되지 않는다.
// 시안(모바일 세로형 단일 컬럼)에 맞춰: 히어로 → 공감 카드 → 포지셔닝 → 4단계 흐름
// → Sparky 소개 → 기능 4개(스크린샷) → 마무리 CTA.

const DARK = '#16271B';   // 다크 그린 카드 배경
const LIME = '#9DFE3B';   // 포인트 라임
const INK = '#16211E';    // 본문 진한 텍스트
const EMBLEM = '#002929'; // 시안 엠블럼(딥 틸) — 히어로 카피/버튼·활성 메뉴 아이콘

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

// 다크 라운드 박스 안의 아이콘 (기능 섹션·흐름 카드 공용)
function IconBox({ src, size = 44, icon = 20 }: { src: string; size?: number; icon?: number }) {
  return (
    <span className="rounded-2xl flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, backgroundColor: DARK }}>
      <MaskIcon src={src} size={icon} color={LIME} />
    </span>
  );
}

const Check = () => (
  <span className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: LIME }}>
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" style={{ color: DARK }}><path d="M2.5 6.3l2.3 2.3 4.7-5.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

// ── 제품 UI 미니목업 (스크린샷 대체 — 코드로 재현) ────────────────────────────

// Plan: 완성된 기획서 문서 카드
function PlanDocMock() {
  const bar = (w: string, c = '#EBEDEA') => <span className="block h-2 rounded-full" style={{ width: w, backgroundColor: c }} />;
  return (
    <div className="bg-white rounded-2xl p-5 w-full" style={{ boxShadow: '0 18px 40px rgba(0,0,0,0.10)', border: '1px solid #EFEFEA' }}>
      <div className="flex items-center gap-2 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="w-4 h-auto" />
        <span className="text-[15px] font-black" style={{ color: INK }}>Spira</span>
        <span className="ml-auto w-5 h-5 rounded-full" style={{ backgroundColor: '#F0F0EA' }} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="text-[9px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: '#DFF9C4', color: '#3E6B1F' }}>브랜딩</span>
        {['미션', '비전', '컨셉', '타겟'].map(t => (
          <span key={t} className="text-[9px] font-medium px-2 py-1 rounded-full" style={{ backgroundColor: '#F1F1EB', color: '#8A938C' }}>{t}</span>
        ))}
      </div>
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          {bar('40%', '#DDEFCB')}
          {bar('100%')}
          {bar('88%')}
          {bar('64%')}
        </div>
        <div className="h-px my-1" style={{ backgroundColor: '#F0F0EA' }} />
        <div className="space-y-1.5">
          {bar('34%', '#DDEFCB')}
          {bar('96%')}
          {bar('72%')}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-lg p-2 space-y-1.5" style={{ border: '1px solid #EFEFEA' }}>
              {bar('60%', '#E7E7E1')}
              {bar('90%')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Goals: 업무영역 아코디언 + 데드라인 + D-day 원
function GoalsMock() {
  const row = (name: string, count: number, open = false) => (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: open ? '#F6FBEF' : '#F7F7F3' }}>
      <span className="text-[13px] font-bold" style={{ color: INK }}>{name}</span>
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#E7E7E1', color: '#8A938C' }}>{count}</span>
      <svg className={`w-3.5 h-3.5 ml-auto ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" style={{ color: '#B4BBB4' }}><path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
  return (
    <div className="relative w-full">
      <div className="bg-white rounded-2xl p-3 space-y-1.5" style={{ boxShadow: '0 18px 40px rgba(0,0,0,0.10)', border: '1px solid #EFEFEA', maxWidth: 300 }}>
        {row('개발', 3)}
        {row('디자인', 2)}
        {row('마케팅', 5, true)}
        <div className="pl-3 pr-1 pb-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium flex-1 min-w-0 truncate" style={{ color: '#44514B' }}>홍보 콘텐츠 100개 올리기</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#FFE1DD', color: '#E0574F' }}>D-50</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#C7CEC7' }} />
            <span className="text-[12px]" style={{ color: '#8A938C' }}>첫 번째 게시글 업로드</span>
          </div>
        </div>
      </div>
      {/* D-day 원 (연결선 + 라임 원) */}
      <div className="absolute -bottom-5 right-3 flex flex-col items-center">
        <span className="w-px h-5" style={{ backgroundColor: '#D4DAD2' }} />
        <span className="w-10 h-10 rounded-full flex items-center justify-center text-[15px] font-black" style={{ backgroundColor: LIME, color: DARK, boxShadow: '0 8px 18px rgba(157,254,59,0.5)' }}>11</span>
      </div>
    </div>
  );
}

// Resources: 이번 달 수익/지출 카드 2개
function ResourceCard({ income, expense, net }: { income: string; expense: string; net: string }) {
  const negative = net.startsWith('-');
  return (
    <div className="bg-white rounded-2xl px-5 py-4 w-full" style={{ boxShadow: '0 14px 34px rgba(0,0,0,0.08)', border: '1px solid #EFEFEA' }}>
      <p className="text-[11px] font-semibold mb-3" style={{ color: '#9AA39D' }}>이번 달 수익/지출</p>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px]" style={{ color: '#5B6560' }}>수익</span>
        <span className="font-mono text-[14px] font-semibold tabular-nums" style={{ color: INK }}>{income}</span>
      </div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[12px]" style={{ color: '#5B6560' }}>비용</span>
        <span className="font-mono text-[14px] font-semibold tabular-nums" style={{ color: INK }}>{expense}</span>
      </div>
      <div className="h-px mb-2.5" style={{ backgroundColor: '#F0F0EA' }} />
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold" style={{ color: INK }}>순이익</span>
        <span className="font-mono text-[22px] font-black tabular-nums tracking-[-0.01em]" style={{ color: negative ? '#FF696C' : INK }}>{net}</span>
      </div>
    </div>
  );
}

// Home: 이번 주 집중 박스
function HomeMock() {
  const task = (name: string) => (
    <div className="flex items-center gap-2 bg-white rounded-full px-3.5 py-2.5" style={{ border: '1.5px solid #BCE89A' }}>
      <span className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0" style={{ borderColor: '#C7CEC7' }} />
      <span className="text-[12px] font-bold flex-1 min-w-0 truncate" style={{ color: INK }}>{name}</span>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#DDF4C4', color: '#3E7A2E' }}>D-day</span>
    </div>
  );
  return (
    <div className="rounded-2xl px-4 pt-4 pb-4 w-full" style={{ backgroundColor: '#F4FBEA', border: '1.5px solid #BCE89A', maxWidth: 320 }}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-[13px] font-bold" style={{ color: INK }}>마케팅</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ color: '#3E7A2E', backgroundColor: '#DDF4C4' }}>🎯 이번 주 집중</span>
      </div>
      <div className="space-y-2">
        {task('첫 번째 게시글 업로드')}
        {task('두 번째 게시글 기획')}
      </div>
    </div>
  );
}

// ── 공감 카드 항목 ──────────────────────────────────────────────────────────
const PAINS = [
  '하루 종일 바빴는데 정작 중요한 일은 못 한 것 같다.',
  '프로젝트가 너무 많아서 머릿속이 복잡하고 할 일 정리가 안 된다.',
  '장기 목표를 세웠지만 제대로 그 목표로 향해가고 있는 건지 모르겠다.',
  '가장 먼저 뭘 해야 하는지 계속 고민하느라 결국 시작을 못 했다.',
];

// 4단계 흐름
const FLOW = [
  { icon: '/plan_icon.svg', name: 'Plan', desc: '비즈니스를\n기획하고' },
  { icon: '/goals_icon.svg', name: 'Goals', desc: '업무 일정을\n계획하고' },
  { icon: '/resources_icon.svg', name: 'Resources', desc: '자금을\n관리하고' },
  { icon: '/home_icon.svg', name: 'Home', desc: '하나하나\n실행해요' },
];

// 기능 섹션 (좌우 교차)
const FEATURES = [
  {
    icon: '/plan_icon.svg',
    title: '비즈니스의 기획과\n방향성을 정리해요',
    desc: 'Plan에서 비즈니스의 방향과 성장 목표를 체계적으로 정리하세요. 막연한 부분은 Sparky의 도움을 받아 채우고, 완성된 계획은 하나의 문서로 확인할 수 있어요.',
    mock: <PlanDocMock />,
    reverse: false,
  },
  {
    icon: '/goals_icon.svg',
    title: '각기 다른 성격의 일들도\n일정을 나눠서 차근차근',
    desc: 'Goals에서 업무 영역별 목표와 데드라인을 정하고, 필요한 일들을 일정에 맞춰 관리하세요. 복잡한 업무 정리와 일정 계획은 Sparky가 함께 도와줘요.',
    mock: <GoalsMock />,
    reverse: true,
  },
  {
    icon: '/resources_icon.svg',
    title: '비용과 수익을 관리하며\n비즈니스 성장을 직관적으로',
    desc: 'Resources에서 수익과 비용을 기록하고 매달 달라지는 비즈니스의 성장을 확인하세요. 다음 목표를 설정하면 Sparky가 이를 달성하기 위한 계획도 함께 세워줘요.',
    mock: (
      <div className="w-full space-y-3" style={{ maxWidth: 300 }}>
        <ResourceCard income="+124,000" expense="-78,000" net="+46,000" />
        <ResourceCard income="+58,000" expense="-78,000" net="-20,000" />
      </div>
    ),
    reverse: false,
  },
  {
    icon: '/home_icon.svg',
    title: '오늘 할 일에만 집중하면\n목표를 향해 나아가요',
    desc: 'Home에서 오늘 할 일과 데드라인, 프로젝트 진행 상황을 한눈에 확인하세요. 업무를 시작하면 타이머로 실제 작업 시간까지 기록할 수 있어요.',
    mock: <HomeMock />,
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

      {/* ══ 공감 카드 ══ */}
      <section className="max-w-2xl mx-auto px-6 pt-14 pb-20">
        <div className="rounded-[26px] px-7 py-9 sm:px-10 sm:py-11 bg-white" style={{ border: '1px solid #EFEFEA', boxShadow: '0 20px 50px rgba(0,0,0,0.06)' }}>
          <h2 className="text-[18px] sm:text-[21px] font-black text-center mb-7" style={{ color: INK }}>
            나만의 비즈니스를 준비하면서<br />이런 경험 있나요?
          </h2>
          <ul className="space-y-3.5 max-w-md mx-auto">
            {PAINS.map(t => (
              <li key={t} className="flex items-start gap-3 text-[14px] sm:text-[15px] leading-relaxed" style={{ color: '#3E4A44' }}>
                <Check />{t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ══ 포지셔닝 ══ */}
      <section className="max-w-xl mx-auto px-6 pb-16 text-center">
        <p className="text-[15px] sm:text-[16px] leading-[1.85]" style={{ color: '#44514B' }}>
          <b style={{ color: INK }}>Spira</b>는 단순히 생산성을 높이는 To-do 앱이 아니에요.
          혼자 사업을 만들어가는 창업자를 위해 <b style={{ color: INK }}>비즈니스의 방향과 우선순위</b>를 관리하고,
          지금 가장 중요한 <b style={{ color: INK }}>다음 한 걸음</b>을 제안하는 AI 워크스페이스예요.
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
        <div className="w-[50px] h-[50px] rounded-full mx-auto mb-6 -mt-2 flex items-center justify-center" style={{ backgroundColor: '#5FD93A', color: '#16211E', boxShadow: '0 8px 22px rgba(95,217,58,0.50)' }}>
          <svg viewBox="0 0 37 34" style={{ width: 35, height: 32 }} fill="currentColor">
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
          어렵고 잘 몰라도 괜찮아요. 막연한 아이디어와 고민들을 자유롭게 털어놓으면 Sparky가 정리해줄 거예요.
        </p>
      </section>

      {/* ══ 기능 4개 (좌우 교차) ══ */}
      <section className="max-w-4xl mx-auto px-6 pb-8 space-y-24 sm:space-y-28">
        {FEATURES.map(f => (
          <div key={f.title} className="grid md:grid-cols-2 gap-10 md:gap-8 items-center">
            {/* 텍스트 */}
            <div className={f.reverse ? 'md:order-2' : ''}>
              <IconBox src={f.icon} size={46} icon={21} />
              <h3 className="text-[21px] sm:text-[24px] font-black tracking-[-0.02em] leading-[1.3] mt-4 mb-3 whitespace-pre-line" style={{ color: INK }}>
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
            혼자 사업을 만들어가는 당신을 위한 AI 워크스페이스.<br className="hidden sm:block" /> 지금 무료로 시작해보세요.
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
