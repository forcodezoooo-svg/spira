import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { BASE_SYSTEM, BUSINESS_PLANNING_SYSTEM, ROUTINE_SYSTEM } from '../../lib/ai/prompts';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';

// 지연 초기화: 빌드(page data 수집) 중 키 없이 모듈만 로드돼도 터지지 않도록,
// 클라이언트는 실제 요청이 들어올 때 만든다.
let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const FREE_DAILY_LIMIT = 5; // 무료 플랜: 하루 AI 대화 횟수

// KST(UTC+9) 기준 오늘 날짜 'YYYY-MM-DD' — 한국 자정에 사용량 리셋
function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const { messages, planMode, routineMode, appContext } = await request.json();

  // 무료 플랜: 하루 5회 제한 (Pro는 무제한). 사용량 조회/기록 실패 시 가용성 우선으로 통과.
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const admin = createAdminClient();
      const { data: plan } = await admin.from('user_plan').select('tier, current_period_end').eq('user_id', user.id).maybeSingle();
      const isPro = plan?.tier === 'pro' && (!plan.current_period_end || new Date(plan.current_period_end).getTime() > Date.now());
      if (!isPro) {
        const today = kstToday();
        const { data: usage } = await admin.from('ai_usage').select('count').eq('user_id', user.id).eq('day', today).maybeSingle();
        const current = usage?.count ?? 0;
        if (current >= FREE_DAILY_LIMIT) {
          return NextResponse.json(
            { error: `무료 플랜은 하루 ${FREE_DAILY_LIMIT}번까지 AI를 사용할 수 있어요. Pro로 업그레이드하면 무제한이에요.` },
            { status: 429 },
          );
        }
        await admin.from('ai_usage').upsert({ user_id: user.id, day: today, count: current + 1 });
      }
    }
  } catch { /* 사용량 체크 실패 시 막지 않고 진행 */ }

  const baseSystem = planMode ? BUSINESS_PLANNING_SYSTEM : routineMode ? ROUTINE_SYSTEM : BASE_SYSTEM;
  const systemContent = appContext
    ? `${baseSystem}\n\n---\n현재 사용자의 앱 데이터 (질문에 이 데이터를 참고해서 구체적으로 답변하세요):\n${appContext}`
    : baseSystem;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const openaiStream = await getClient().chat.completions.create({
          model: 'gpt-4o',
          stream: true,
          messages: [
            { role: 'system', content: systemContent },
            ...messages,
          ],
        });

        for await (const chunk of openaiStream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
