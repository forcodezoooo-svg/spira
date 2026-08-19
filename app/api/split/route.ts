import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { checkAiAccess } from '../../lib/aiUsage';

// 사업 목표 → 산출물, 산출물 → 업무 영역별 산출물로 AI가 쪼개준다.
// 핵심: '산출물(deliverable)'은 눈에 보이는 결과물/납품물이다. (예: "플레이스토어에 앱 업로드", "랜딩페이지 제작 완료")
//       '성과(outcome)'·지표·목표 수치가 아니다. (예: "MAU 1만 달성"은 성과 → 산출물 아님)
export const runtime = 'nodejs';
export const maxDuration = 60;

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const DELIVERABLE_RULE = `'산출물(deliverable)'은 실제로 만들어져 눈에 보이는 결과물·납품물이다. 동사보다 '완성된 결과물' 중심으로 구체적으로 쓴다.
좋은 예: "플레이스토어에 앱 업로드", "랜딩페이지 제작 완료", "브랜드 로고 확정", "베타 테스터 모집 폼 배포".
나쁜 예(이건 '성과/지표'라서 산출물이 아님): "사용자 1만 명 달성", "매출 증가", "인지도 향상".`;

export async function POST(request: Request) {
  const access = await checkAiAccess();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: { mode?: string; context?: string; goalName?: string; goalDesc?: string; deliverableName?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const { mode, context = '', goalName = '', goalDesc = '', deliverableName = '' } = body;

  let sys = '';
  let user = '';
  if (mode === 'deliverables') {
    sys = `너는 1인 창업가의 실행을 돕는 어시스턴트야. 주어진 '사업 목표(단계)'를 이루기 위해 실제로 만들어내야 하는 '산출물'들을 쪼개서 나열해.
${DELIVERABLE_RULE}
반드시 이 형식의 '오직 JSON만' 출력: {"deliverables":["산출물1","산출물2","산출물3"]} (3~6개, 각 산출물은 간결한 결과물 명사구).`;
    user = `사업 정보:\n${context}\n\n사업 목표(단계): ${goalName}${goalDesc ? `\n이 단계 설명: ${goalDesc}` : ''}\n\n이 단계를 완수하려면 어떤 산출물들이 나와야 하는지 쪼개줘.`;
  } else if (mode === 'areas') {
    sys = `너는 1인 창업가의 실행을 돕는 어시스턴트야. 주어진 '산출물' 하나를 완성하기 위해 각 '업무 영역'이 내놓아야 할 세부 산출물로 쪼개.
${DELIVERABLE_RULE}
업무 영역 예: 기획, 디자인, 개발, 마케팅, 운영 등. 각 영역의 content도 '결과물' 중심으로 구체적으로.
반드시 이 형식의 '오직 JSON만' 출력: {"areaDeliverables":[{"area":"개발","content":"앱 빌드 및 스토어 심사 제출"},{"area":"디자인","content":"스토어 등록용 스크린샷 5종 제작"}]} (2~5개).`;
    user = `사업 정보:\n${context}\n\n상위 사업 목표: ${goalName}\n완성해야 할 산출물: ${deliverableName}\n\n이 산출물을 만들기 위한 업무 영역별 세부 산출물로 쪼개줘.`;
  } else {
    return NextResponse.json({ error: 'bad-mode' }, { status: 400 });
  }

  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
    if (mode === 'deliverables') {
      const deliverables = Array.isArray(parsed.deliverables)
        ? parsed.deliverables.map(d => String(d).trim()).filter(Boolean).slice(0, 8)
        : [];
      return NextResponse.json({ deliverables });
    } else {
      const areaDeliverables = Array.isArray(parsed.areaDeliverables)
        ? parsed.areaDeliverables.map(a => {
            const aa = a as Record<string, unknown>;
            return { area: String(aa.area ?? '').trim(), content: String(aa.content ?? '').trim() };
          }).filter(a => a.area || a.content).slice(0, 8)
        : [];
      return NextResponse.json({ areaDeliverables });
    }
  } catch {
    return NextResponse.json({ error: 'ai-fail' }, { status: 500 });
  }
}
