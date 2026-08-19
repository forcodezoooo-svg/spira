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

const DELIVERABLE_RULE = `'산출물(deliverable)'은 실제로 만들어져 손에 잡히는 '결과물·납품물'이다. 반드시 '완성된 결과물(명사형 산출물)'로 써라 — 문서·보고서·시안·디자인·페이지·앱·자산처럼 눈에 보이는 '물건'.
❌ 활동/과정 표현 금지: "~분석", "~조사", "~기획", "~확정", "~진행", "~구축하기" 같은 '하는 일'이 아니라, 그 일의 '결과물'을 써라. (예: "시장 분석"(X, 활동) → "시장 분석 보고서"(O, 결과물))
❌ 성과/지표 금지: "사용자 1만 명 달성", "매출 증가", "인지도 향상"은 산출물이 아니다.
⭕ 좋은 예: "플레이스토어 앱 등록본", "런칭 랜딩페이지", "브랜드 로고·가이드", "타겟 고객 인터뷰 보고서", "베타 테스터 모집 폼".`;

export async function POST(request: Request) {
  const access = await checkAiAccess();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: { mode?: string; context?: string; goalName?: string; goalDesc?: string; deliverableName?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const { mode, context = '', goalName = '', goalDesc = '', deliverableName = '' } = body;

  let sys = '';
  let user = '';
  if (mode === 'deliverables') {
    sys = `너는 1인 창업가의 실행을 돕는 어시스턴트야. 주어진 '사업 목표(단계)'를 이루기 위한 '큰 단위의 산출물(마일스톤/프로젝트)'로 쪼개서 나열해.
${DELIVERABLE_RULE}
중요: 잘게 쪼개지 말 것. 각 산출물은 여러 업무를 포함하는 '굵직한 결과물'이어야 한다. (예: "초기 제품 프로토타입 완료" 하나 안에 시장분석·브랜딩·기본 웹사이트 구성 등이 모두 포함된다) 3~5개 정도가 적당하다.
반드시 '실제 진행 순서'(먼저 해야 하는 것부터) 대로 나열해라 — 순서가 곧 일의 흐름이다.
반드시 이 형식의 '오직 JSON만' 출력: {"deliverables":["산출물1","산출물2","산출물3"]}`;
    user = `사업 정보:\n${context}\n\n사업 목표(단계): ${goalName}${goalDesc ? `\n이 단계 목표: ${goalDesc}` : ''}\n\n이 단계를 완수하기 위한 굵직한 산출물들을 진행 순서대로 쪼개줘.`;
  } else if (mode === 'areas') {
    sys = `너는 1인 창업가의 실행을 돕는 어시스턴트야. 주어진 '산출물' 하나를 완성하기 위해 각 '업무 영역'이 내놓을 '결과물'로 쪼개.
${DELIVERABLE_RULE}
범위는 미세 작업이 아니라 넓게 잡되, 반드시 위 규칙대로 '활동'이 아닌 '결과물(명사형 산출물)'로 써라.
좋은 예: 기획→"타겟 고객 인터뷰·시장 분석 보고서", 디자인→"브랜드 가이드 및 기본 UI 시안", 개발→"기본 웹사이트(프로토타입)", 마케팅→"런칭 랜딩페이지·콘텐츠".
업무 영역 예: 기획, 디자인, 개발, 마케팅, 운영 등. 2~4개.
반드시 이 형식의 '오직 JSON만' 출력: {"areaDeliverables":[{"area":"기획","content":"타겟 고객 인터뷰·시장 분석 보고서"},{"area":"디자인","content":"브랜드 가이드 및 기본 UI 시안"}]}`;
    user = `사업 정보:\n${context}\n\n상위 사업 목표: ${goalName}\n완성해야 할 산출물: ${deliverableName}\n\n이 산출물을 만들기 위한 업무 영역별 산출물로(넓은 개념으로) 쪼개줘.`;
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
