import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { BASE_SYSTEM, BUSINESS_PLANNING_SYSTEM, ROUTINE_SYSTEM } from '../../lib/ai/prompts';
import { checkAiAccess } from '../../lib/aiUsage';

// 지연 초기화: 빌드(page data 수집) 중 키 없이 모듈만 로드돼도 터지지 않도록,
// 클라이언트는 실제 요청이 들어올 때 만든다.
let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function POST(request: Request) {
  // 로그인 필수 + 무료 하루 한도 (비로그인 외부 호출 차단 → 비용 남용 방지)
  const access = await checkAiAccess();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const { messages, planMode, routineMode, appContext } = await request.json();

  const baseSystem = planMode ? BUSINESS_PLANNING_SYSTEM : routineMode ? ROUTINE_SYSTEM : BASE_SYSTEM;
  // 오늘 날짜(KST)를 항상 알려줘 과거 연도(예: 2023)로 일정 잡는 실수를 막는다.
  const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dateNote = `오늘 날짜는 ${todayKST}(KST)입니다. 모든 데드라인·할일 날짜는 반드시 오늘 이후(현재~미래)로만 잡으세요. 과거 날짜(지난 연도 등) 절대 금지.`;
  const systemContent = `${dateNote}\n\n${baseSystem}` + (appContext
    ? `\n\n---\n현재 사용자의 앱 데이터 (질문에 이 데이터를 참고해서 구체적으로 답변하세요):\n${appContext}`
    : '');

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
