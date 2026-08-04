import OpenAI from 'openai';
import { BASE_SYSTEM, BUSINESS_PLANNING_SYSTEM, ROUTINE_SYSTEM } from '../../lib/ai/prompts';

// 지연 초기화: 빌드(page data 수집) 중 키 없이 모듈만 로드돼도 터지지 않도록,
// 클라이언트는 실제 요청이 들어올 때 만든다.
let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function POST(request: Request) {
  const { messages, planMode, routineMode, appContext } = await request.json();

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
