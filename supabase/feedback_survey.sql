-- 피드백에 '만족도 설문(survey)' 유형 + 만족도 점수 컬럼 추가 (1회 실행)
alter table public.feedback drop constraint if exists feedback_type_check;
alter table public.feedback add constraint feedback_type_check
  check (type in ('bug', 'feature', 'inquiry', 'survey'));

alter table public.feedback add column if not exists rating int;
