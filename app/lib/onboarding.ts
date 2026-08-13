// 온보딩 투어 진행 여부. 투어 중에는 무료 제한(AI 자동 채우기 등)을 잠시 풀어
// 신규 사용자가 온보딩 단계를 끝까지 체험할 수 있게 한다.
// Teaching.tsx가 진행 인덱스를 이 키에 저장하고, 투어가 끝나거나 건너뛰면 키를 제거한다.
export const TEACH_TOUR_KEY = 'spira_teach_idx';

export function isOnboardingActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(TEACH_TOUR_KEY);
    return v != null && Number(v) >= 0;
  } catch {
    return false;
  }
}
