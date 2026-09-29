// 만족도 설문 노출 제어 (per-user localStorage). 시간이 아니라 '의미 있는 핵심 행동'(task_added/task_completed) 횟수를 기준으로 함.
export interface SurveyState {
  firstSeenAt?: number;        // 첫 방문 시각(기록만)
  actionCount?: number;        // 의미 있는 핵심 행동 누적(task_added + task_completed)
  lastSubmittedAt?: number;    // 마지막 응답 시각 → 30일 후 재측정
  snoozeUntil?: number;        // '나중에' 시 이 시각까지 대기
  dismissedAtActions?: number; // 무응답으로 닫은 시점의 actionCount → 이후 +100회 되면 재시도
  submitted?: boolean;         // (구버전 호환) 과거 응답자 플래그
}

const keyOf = (userId?: string | null) => (userId ? `spira_survey_v1:${userId}` : null);

export function readSurveyState(userId?: string | null): SurveyState {
  const k = keyOf(userId); if (!k) return {};
  try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
}

export function writeSurveyState(userId: string | null | undefined, patch: SurveyState): void {
  const k = keyOf(userId); if (!k) return;
  try { localStorage.setItem(k, JSON.stringify({ ...readSurveyState(userId), ...patch })); } catch { /* ignore */ }
}

// task_added / task_completed 같은 핵심 행동 1회 기록 — 설문 첫 노출(30회)·재시도(100회) 판단에 사용
export function bumpSurveyAction(userId?: string | null): void {
  if (!keyOf(userId)) return;
  const st = readSurveyState(userId);
  writeSurveyState(userId, { actionCount: (st.actionCount ?? 0) + 1 });
}
