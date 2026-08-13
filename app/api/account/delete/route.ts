import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

// 회원탈퇴 — 인증 계정과 관련 데이터(플랜·결제수단·사용량 등)를 삭제한다.
// service_role(admin)로 RLS 우회. 본인 세션 확인 후 자기 계정만 삭제 가능.
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });

    const admin = createAdminClient();

    // 저장된 빌링키부터 삭제 → 어떤 자동 청구도 불가능하게
    await admin.from('billing_credential').delete().eq('user_id', user.id).then(() => {}, () => {});
    // 그 외 관련 데이터 정리 (테이블이 없거나 컬럼이 달라도 계정 삭제는 진행)
    for (const table of ['user_plan', 'ai_usage', 'pro_waitlist', 'feedback']) {
      await admin.from(table).delete().eq('user_id', user.id).then(() => {}, () => {});
    }

    // 인증 계정 삭제
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 서버 쪽 세션 정리
    await supabase.auth.signOut().catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
