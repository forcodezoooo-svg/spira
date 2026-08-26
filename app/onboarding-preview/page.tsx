'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// 온보딩·티칭 인터랙션을 실시간으로 확인·수정하기 위한 예시(개발용) 페이지.
// - 온보딩 모달은 전역 <Onboarding/>(AppFrame)이 ?onboarding=1 일 때 표시한다.
// - 티칭 투어는 localStorage 'spira_teach_idx'=0 + /plan 진입으로 시작된다.
// 기존 온보딩 단계와 '티칭 → /plan' 흐름은 그대로 두고, 여기서 반복 확인만 한다.
export default function OnboardingPreview() {
  const router = useRouter();
  const params = useSearchParams();
  const onboardingActive = params.get('onboarding') === '1';
  const [teachActive, setTeachActive] = useState(false);
  useEffect(() => { try { setTeachActive(!!localStorage.getItem('spira_teach_idx')); } catch { /* empty */ } }, []);

  // 온보딩 (전역 모달) 다시 열기 — 파라미터를 새로 붙여 강제 리로드
  const startOnboarding = () => { window.location.href = `/onboarding-preview?onboarding=1&t=${Date.now()}`; };
  const closeOnboarding = () => { window.location.href = '/onboarding-preview'; };
  // 티칭 투어 시작 (Plan으로 이동해 첫 스텝부터)
  const startTeaching = () => { try { localStorage.setItem('spira_teach_idx', '0'); } catch { /* empty */ } router.push('/plan'); };
  const resetTeaching = () => { try { localStorage.removeItem('spira_teach_idx'); } catch { /* empty */ } setTeachActive(false); };

  const Btn = ({ onClick, children, primary }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) => (
    <button onClick={onClick} className="text-[14px] font-bold rounded-full px-4 py-2.5 transition-transform hover:-translate-y-0.5"
      style={primary ? { backgroundColor: '#9DFE3B', color: '#16211E' } : { backgroundColor: '#F0F0EA', color: '#5B6560' }}>{children}</button>
  );
  const Card = ({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) => (
    <div className="rounded-[20px] border p-5" style={{ borderColor: 'var(--spira-border-subtle)', backgroundColor: '#fff' }}>
      <p className="text-[15px] font-black mb-1" style={{ color: '#16211E' }}>{title}</p>
      <p className="text-[13px] mb-4 leading-relaxed" style={{ color: '#9AA39D' }}>{desc}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-5">
      <div>
        <h1 className="text-[24px] font-black tracking-[-0.02em]" style={{ color: '#16211E' }}>온보딩 · 티칭 미리보기</h1>
        <p className="text-[13px] mt-1" style={{ color: '#9AA39D' }}>개발용 페이지 — 여기서 온보딩/티칭을 반복 실행하며 <code className="px-1 rounded" style={{ backgroundColor: '#F0F0EA' }}>Onboarding.tsx</code> · <code className="px-1 rounded" style={{ backgroundColor: '#F0F0EA' }}>Teaching.tsx</code>를 수정하면 곧바로 반영됩니다.</p>
      </div>

      <Card title="1. 온보딩 흐름" desc="전역 온보딩 모달을 띄웁니다. 단계는 이름 → 카테고리 → 설명 → 목표 → 분기목표 검토 → 업무영역 검토 → 완료. ‘시작해보기’를 누르면 teach 인덱스가 0으로 설정되고 Plan으로 이동합니다.">
        <Btn onClick={startOnboarding} primary>온보딩 {onboardingActive ? '다시 열기' : '열기'}</Btn>
        {onboardingActive && <Btn onClick={closeOnboarding}>닫기(파라미터 제거)</Btn>}
        {onboardingActive && <span className="text-[12px] self-center" style={{ color: '#3E7A2E' }}>● 온보딩 표시 중 (모달)</span>}
      </Card>

      <Card title="2. 티칭 투어 (Plan)" desc="온보딩 완료 후 이어지는 Plan 페이지 티칭 인터랙션입니다. 첫 스텝부터 Plan에서 시작합니다. (이 흐름은 유지 — 이후 새 구조에 맞춰 재구성)">
        <Btn onClick={startTeaching} primary>티칭 투어 시작 → Plan</Btn>
        <Btn onClick={resetTeaching}>티칭 초기화</Btn>
        {teachActive && <span className="text-[12px] self-center" style={{ color: '#96631A' }}>● 티칭 진행 중 (teach_idx 설정됨)</span>}
      </Card>

      <Card title="편집 위치" desc="실시간으로 수정할 파일들입니다.">
        <span className="text-[12px] px-2.5 py-1 rounded-full" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>app/components/Onboarding.tsx — 온보딩 단계·UI</span>
        <span className="text-[12px] px-2.5 py-1 rounded-full" style={{ backgroundColor: '#F3F0FF', color: '#7C3AED' }}>app/components/Teaching.tsx — 티칭 TOUR 스텝</span>
      </Card>
    </div>
  );
}
