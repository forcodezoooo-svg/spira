import Link from 'next/link';

// 공개 랜딩 페이지 (비로그인 방문자용). 로그인한 사용자는 proxy.ts에서 /home 으로 보냄.
// 앱 크롬(사이드바 등)은 AppFrame의 bare 처리로 렌더되지 않는다.
// 핵심 메시지: '할 일'이 아니라 '방향과 우선순위'를 관리하는, 1인 창업자를 위한 AI 워크스페이스.

const PAINS = [
  '하루 종일 바빴는데 중요한 일은 못 했다.',
  '프로젝트가 너무 많아서 머릿속이 복잡하다.',
  '장기 목표를 세웠지만 결국 Todo만 처리하고 있다.',
  '다음에 뭘 해야 하는지 계속 고민한다.',
];

const FEATURES = [
  { emoji: '🧭', title: '무엇부터 할지 모를 때', desc: '할 일이 없는 게 아니라, 무엇이 먼저인지 모를 때. 지금 가장 중요한 다음 한 걸음을 짚어줘요.' },
  { emoji: '🎯', title: '흩어진 일을 하나의 목표로', desc: '여러 프로젝트를 사업의 큰 목표에 연결해, 방향이 흔들리지 않게 잡아줘요.' },
  { emoji: '📊', title: '우선순위가 저절로', desc: '마감·중요도를 읽어 이번 주 가장 집중해야 할 업무 영역을 정리해줘요.' },
  { emoji: '🌱', title: '하루가 아니라 여정을', desc: '오늘의 할 일을 넘어, 사업이 장기적으로 나아가는 과정을 관리해요.' },
  { emoji: '✨', title: '혼자여도 혼자가 아니게', desc: '모든 결정을 홀로 내리는 당신 옆에서, AI 어시스턴트 Sparky가 함께 판단해요.' },
  { emoji: '🚩', title: '나아가는 게 보이도록', desc: '목표를 이룰 때마다 깃발이 쌓여, 사업이 앞으로 나아간 여정이 지도로 남아요.' },
];

const STEPS = [
  { n: '1', title: '사업을 소개하면', desc: '이름과 한 줄 설명만 주면, AI가 방향을 잡아 기획서와 목표를 정리해요.' },
  { n: '2', title: '일이 목표로 정렬돼요', desc: '흩어진 프로젝트가 하나의 목표 아래 우선순위로 줄을 서요.' },
  { n: '3', title: '다음 한 걸음부터', desc: '지금 가장 중요한 일부터 실행하며, 사업을 앞으로 밀어가요.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: '#F8F8F8', color: '#16211E' }}>
      {/* ── 상단 바 ── */}
      <header className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Spira" className="w-7 h-auto" />
          <span className="text-[19px] font-black tracking-[-0.02em]">Spira</span>
        </div>
        <Link href="/login" className="text-[14px] font-semibold px-4 py-2 rounded-full transition-colors hover:bg-black/5" style={{ color: '#16211E' }}>
          로그인
        </Link>
      </header>

      {/* ── 히어로 ── */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-20 text-center">
        <span className="inline-block text-[13px] font-bold px-3.5 py-1.5 rounded-full mb-6" style={{ backgroundColor: '#E9FBD6', color: '#3E6B1F' }}>
          1인 창업자를 위한 AI 워크스페이스
        </span>
        <h1 className="text-[34px] sm:text-[46px] font-black leading-[1.15] tracking-[-0.03em] mb-5">
          해야 할 일이 너무 많아서<br />
          <span style={{ color: '#5EA63A' }}>무엇부터 해야 할지 모르겠을 때</span>
        </h1>
        <p className="text-[16px] sm:text-[17px] leading-relaxed mb-9 max-w-xl mx-auto" style={{ color: '#5B6560' }}>
          Spira는 생산성을 높이는 To-do 앱이 아니에요.
          혼자 사업을 만들어가는 창업자를 위해 <b style={{ color: '#16211E' }}>방향과 우선순위</b>를 관리하고,
          지금 가장 중요한 <b style={{ color: '#16211E' }}>다음 한 걸음</b>을 제안하는 AI 워크스페이스예요.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl text-[16px] font-bold transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: '#9DFE3B', color: '#16211E', boxShadow: '0 10px 30px rgba(157,254,59,0.45)' }}
          >
            무료로 시작하기
          </Link>
          <Link href="/login" className="text-[15px] font-semibold px-2 py-2 transition-colors hover:opacity-70" style={{ color: '#5B6560' }}>
            이미 계정이 있어요 →
          </Link>
        </div>
      </section>

      {/* ── 이런 경험 있나요? (공감 문단) ── */}
      <section className="max-w-2xl mx-auto px-6 pb-20 -mt-6">
        <div className="bg-white border rounded-3xl p-8 sm:p-10" style={{ borderColor: 'rgba(0,41,41,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
          <h2 className="text-[20px] sm:text-[23px] font-black text-center mb-7">이런 경험 있나요?</h2>
          <ul className="space-y-3.5 max-w-md mx-auto">
            {PAINS.map(t => (
              <li key={t} className="flex items-start gap-3 text-[15px] sm:text-[16px] leading-relaxed" style={{ color: '#3E4A44' }}>
                <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#DFF9C4' }}>
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" style={{ color: '#3E6B1F' }}><path d="M2.5 6.5l2.3 2.3 4.7-5.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 포지셔닝 + 기능 ── */}
      <section className="max-w-5xl mx-auto px-6 pb-8">
        <div className="text-center mb-10">
          <h2 className="text-[26px] sm:text-[32px] font-black tracking-[-0.02em] leading-tight mb-3">
            생산성 앱이 아니라,<br className="sm:hidden" /> 방향을 관리하는 워크스페이스
          </h2>
          <p className="text-[15px] leading-relaxed max-w-lg mx-auto" style={{ color: '#5B6560' }}>
            하루를 관리하는 도구는 이미 많아요. Spira는 <b style={{ color: '#16211E' }}>사업이 어디로 가야 하는지</b>를 관리해요.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white border rounded-3xl p-6 transition-transform hover:-translate-y-0.5" style={{ borderColor: 'rgba(0,41,41,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.04)' }}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-[22px] mb-4" style={{ backgroundColor: '#F1F6EC' }}>{f.emoji}</div>
              <h3 className="text-[16px] font-bold mb-1.5">{f.title}</h3>
              <p className="text-[14px] leading-relaxed" style={{ color: '#5B6560' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 사용 방법 ── */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="text-[28px] sm:text-[32px] font-black text-center tracking-[-0.02em] mb-3">설정이 아니라, 방향부터 잡아드려요</h2>
        <p className="text-[15px] text-center mb-12" style={{ color: '#5B6560' }}>가입하고 5분이면, 무엇을 먼저 해야 할지 보이기 시작해요.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(s => (
            <div key={s.n} className="text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center text-[18px] font-black" style={{ backgroundColor: '#16211E', color: '#9DFE3B' }}>{s.n}</div>
              <h3 className="text-[16px] font-bold mb-2">{s.title}</h3>
              <p className="text-[14px] leading-relaxed" style={{ color: '#5B6560' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 마무리 CTA ── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="rounded-[32px] px-8 py-14 text-center" style={{ backgroundColor: '#16211E' }}>
          <h2 className="text-[28px] sm:text-[34px] font-black leading-tight tracking-[-0.02em] mb-4" style={{ color: '#F8F8F8' }}>
            지금 가장 중요한<br />다음 한 걸음부터.
          </h2>
          <p className="text-[15px] leading-relaxed mb-8 max-w-md mx-auto" style={{ color: '#AEB8AE' }}>
            혼자 사업을 만들어가는 당신을 위한 AI 워크스페이스. 지금 무료로 시작해보세요.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3.5 rounded-2xl text-[16px] font-bold transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: '#9DFE3B', color: '#16211E' }}
          >
            무료로 시작하기
          </Link>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t" style={{ borderColor: 'rgba(0,41,41,0.08)' }}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
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
