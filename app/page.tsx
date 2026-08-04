import Link from 'next/link';

// 공개 랜딩 페이지 (비로그인 방문자용). 로그인한 사용자는 proxy.ts에서 /home 으로 보냄.
// 앱 크롬(사이드바 등)은 AppFrame의 bare 처리로 렌더되지 않는다.

const FEATURES = [
  { emoji: '📋', title: 'Plan · AI 기획서', desc: '사업 정보를 입력하면 Sparky가 기획서 초안을 만들어 방향을 함께 구체화해요.' },
  { emoji: '🎯', title: 'Goals · 목표 분해', desc: '분기 목표를 데드라인과 할 일로 나누고, 캘린더에 드래그해 일정을 짜요.' },
  { emoji: '🌿', title: 'Home · 오늘 할 일', desc: '오늘 집중할 업무를 한눈에. 타이머로 실제 작업 시간을 기록해요.' },
  { emoji: '💰', title: 'Resources · 수익 관리', desc: '수익·비용·구독료를 한곳에서. 순이익 추이까지 자동으로 정리돼요.' },
  { emoji: '✨', title: 'Sparky · AI 어시스턴트', desc: '대화만으로 기획·분기 계획·할 일을 자동으로 생성하고 채워줘요.' },
  { emoji: '🚩', title: '여정 지도 · 깃발 수집', desc: '목표를 달성할 때마다 깃발을 모아 나만의 여정 지도를 완성해요.' },
];

const STEPS = [
  { n: '1', title: '사업을 소개해요', desc: '이름과 한 줄 설명만 입력하면 AI가 기획서 초안을 작성해요.' },
  { n: '2', title: '목표가 자동으로 정리돼요', desc: '분기 목표와 업무 영역이 제안되고, 할 일까지 만들어져요.' },
  { n: '3', title: '오늘부터 실행해요', desc: '오늘 할 일을 처리하고, 목표를 깃발로 모아가요.' },
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
          1인 창업가를 위한 사업 운영 OS
        </span>
        <h1 className="text-[40px] sm:text-[52px] font-black leading-[1.1] tracking-[-0.03em] mb-5">
          흩어진 사업 운영을,<br />
          <span style={{ color: '#5EA63A' }}>한곳에서.</span>
        </h1>
        <p className="text-[16px] sm:text-[17px] leading-relaxed mb-9 max-w-xl mx-auto" style={{ color: '#5B6560' }}>
          기획부터 목표, 오늘 할 일, 수익 관리까지.<br className="hidden sm:block" />
          AI 어시스턴트 <b style={{ color: '#16211E' }}>Sparky</b>와 함께 방향을 잡고,
          목표를 깃발로 모아 <b style={{ color: '#16211E' }}>나만의 여정 지도</b>를 완성하세요.
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

      {/* ── 기능 ── */}
      <section className="max-w-5xl mx-auto px-6 pb-8">
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
        <h2 className="text-[28px] sm:text-[32px] font-black text-center tracking-[-0.02em] mb-3">가입 후 5분이면 충분해요</h2>
        <p className="text-[15px] text-center mb-12" style={{ color: '#5B6560' }}>복잡한 설정 없이, 바로 오늘의 실행으로 이어져요.</p>
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
            오늘, 첫 깃발을 꽂아보세요
          </h2>
          <p className="text-[15px] leading-relaxed mb-8 max-w-md mx-auto" style={{ color: '#AEB8AE' }}>
            사업의 방향을 잡고, 목표를 향해 나아가는 여정을 Spira와 함께 시작해요.
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
          <span className="text-[12px]" style={{ color: '#C4CCC4' }}>이용약관 · 개인정보 처리방침 (준비 중)</span>
        </div>
      </footer>
    </div>
  );
}
