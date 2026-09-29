import posthog from 'posthog-js';
import { bumpSurveyAction } from './survey';

// '실사용' 리텐션 측정용 단일 canonical 이벤트.
// task 생성/완료 등 실제 제품 가치를 쓰는 핵심 행동에서 호출 → PostHog Retention/Stickiness에서 $pageview 대신 이 이벤트 하나만 기준으로 삼으면
// '그냥 접속'이 아니라 '실제로 쓴' 리텐션만 잡힌다. type 속성으로 어떤 행동인지 구분 가능.
export function recordMeaningfulAction(type: string, userId?: string | null): void {
  try { posthog.capture('meaningful_action', { type }); } catch { /* posthog 미초기화 등은 무시 */ }
  bumpSurveyAction(userId); // 만족도 설문 노출 판단용 카운터도 함께 증가
}
