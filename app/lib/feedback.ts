import { createClient } from './supabase/client';

// 프로그램 피드백 수집 — Supabase 'feedback' 테이블에 저장.
// (테이블/정책 SQL은 supabase/feedback.sql 참고. 실행 전에도 앱은 정상 동작하되 전송만 실패)
export type FeedbackType = 'bug' | 'feature' | 'inquiry';

export async function submitFeedback(type: FeedbackType, message: string, page: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('feedback').insert({
    user_id: user?.id ?? null,
    type,
    message,
    page,
  });
  if (error) throw error;
}
