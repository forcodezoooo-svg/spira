import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';

// ⚠️ 서버 전용. AI 라우트(chat·onboarding) 공통 접근 제어:
//  1) 로그인 필수 (비로그인 외부 호출 차단 → OpenAI 비용 남용 방지)
//  2) 무료 플랜은 하루 FREE_DAILY_LIMIT회 (Pro 무제한)
//     단, 온보딩은 첫 경험이 한도에 먹히지 않도록 카운트 제외(checkAiAccess({ count: false }))
//  3) 전역(서비스 전체) 하루 상한 GLOBAL_DAILY_LIMIT — 신규 유저 급증 시 비용 폭탄 방지.
//     무료+온보딩 호출 전체 합산. Pro는 결제로 비용 상쇄하므로 상한/카운트에서 제외.
//     상한값은 환경변수 AI_GLOBAL_DAILY_LIMIT로 조절(기본 1000). gpt-4o 기준 호출당 ~$0.02 → 1000 ≈ 하루 ~$20 상한.
const FREE_DAILY_LIMIT = 15;
const GLOBAL_DAILY_LIMIT = Number(process.env.AI_GLOBAL_DAILY_LIMIT) || 1000;

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

  // 집계/한도 (실패 시엔 가용성 우선으로 통과 — 단, 로그인은 이미 통과한 상태)
  try {
    const admin = createAdminClient();
    const today = kstToday();

    // Pro: 무제한 + 전역 상한 면제(결제로 비용 상쇄)
    const { data: plan } = await admin.from('user_plan').select('tier, current_period_end').eq('user_id', userId).maybeSingle();
    const isPro = plan?.tier === 'pro' && (!plan.current_period_end || new Date(plan.current_period_end).getTime() > Date.now());
    if (isPro) return { userId };

    // 3) 전역 하루 상한 — 무료+온보딩 전체 합산이 한도를 넘으면 잠시 차단(비용 폭탄 방지)
    const { data: g } = await admin.from('ai_usage_global').select('count').eq('day', today).maybeSingle();
    if ((g?.count ?? 0) >= GLOBAL_DAILY_LIMIT) {
      return { error: '지금 AI 사용량이 많아 잠시 쉬어가고 있어요. 잠시 후 다시 시도해주세요.', status: 503 };
    }

    // 2) 사용자 하루 한도 (온보딩(count:false)은 제외)
    if (opts?.count !== false) {
      const { data: usage } = await admin.from('ai_usage').select('count').eq('user_id', userId).eq('day', today).maybeSingle();
      const current = usage?.count ?? 0;
      if (current >= FREE_DAILY_LIMIT) {
        return { error: `무료 플랜은 하루 ${FREE_DAILY_LIMIT}번까지 AI를 사용할 수 있어요. Pro로 업그레이드하면 무제한이에요.`, status: 429 };
      }
      await admin.from('ai_usage').upsert({ user_id: userId, day: today, count: current + 1 });
    }

    // 전역 카운터 원자적 증가(온보딩 포함 모든 무료 호출)
    await admin.rpc('incr_ai_global', { p_day: today });
  } catch { /* 집계 실패 시 통과 */ }

  return { userId };
}
