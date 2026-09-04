import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';

// ⚠️ 서버 전용. AI 라우트(chat·onboarding) 공통 접근 제어:
//  1) 로그인 필수 (비로그인 외부 호출 차단 → OpenAI 비용 남용 방지)
//  2) 무료 플랜은 하루 FREE_DAILY_LIMIT회 (Pro 무제한)
//     단, 온보딩은 첫 경험이 한도에 먹히지 않도록 카운트 제외(checkAiAccess({ count: false }))
const FREE_DAILY_LIMIT = 15;

// KST(UTC+9) 기준 오늘 'YYYY-MM-DD' — 한국 자정에 리셋
function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export type AiAccess = { userId: string } | { error: string; status: number };

// opts.count=false 면 로그인만 확인하고 하루 한도 카운트/차단은 건너뜀(온보딩 등 첫 경험용)
export async function checkAiAccess(opts?: { count?: boolean }): Promise<AiAccess> {
  // 1) 로그인 필수 — 실패 시 무조건 차단
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return { error: '로그인이 필요해요', status: 401 };

  // 카운트 제외 요청(온보딩): 로그인만 통과시키고 한도는 적용하지 않음
  if (opts?.count === false) return { userId };

  // 2) 무료 플랜 하루 한도 (집계 실패 시엔 가용성 우선으로 통과 — 단, 로그인은 이미 통과한 상태)
  try {
    const admin = createAdminClient();
    const { data: plan } = await admin.from('user_plan').select('tier, current_period_end').eq('user_id', userId).maybeSingle();
    const isPro = plan?.tier === 'pro' && (!plan.current_period_end || new Date(plan.current_period_end).getTime() > Date.now());
    if (isPro) return { userId };

    const today = kstToday();
    const { data: usage } = await admin.from('ai_usage').select('count').eq('user_id', userId).eq('day', today).maybeSingle();
    const current = usage?.count ?? 0;
    if (current >= FREE_DAILY_LIMIT) {
      return { error: `무료 플랜은 하루 ${FREE_DAILY_LIMIT}번까지 AI를 사용할 수 있어요. Pro로 업그레이드하면 무제한이에요.`, status: 429 };
    }
    await admin.from('ai_usage').upsert({ user_id: userId, day: today, count: current + 1 });
  } catch { /* 집계 실패 시 통과 */ }

  return { userId };
}
