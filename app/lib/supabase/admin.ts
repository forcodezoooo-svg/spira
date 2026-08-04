import { createClient } from '@supabase/supabase-js';

// ⚠️ 서버 전용. service_role 키는 RLS를 우회하므로 절대 클라이언트로 import 하지 말 것.
// (결제 승인 라우트에서 사용자 플랜을 기록할 때만 사용)
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase 관리자 설정 누락 (URL / SERVICE_ROLE_KEY)');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
