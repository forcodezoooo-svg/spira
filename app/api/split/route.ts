import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { checkAiAccess } from '../../lib/aiUsage';
import { SPIRA_PLANNING_CORE } from '../../lib/ai/prompts';

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

const DELIVERABLE_RULE = `'산출물(deliverable)'은 고객·관객 앞에 바로 내놓을 수 있는 '실제 결과물'이다. 명사형 결과물로 써라.
1인 창업자용 서비스다 — 빠르게 눈에 보이는 결과를 내서 반응을 받는 게 가장 중요하다. 그래서:
⭕ 좋은 예: "출시된 제품", "오픈한 매장", "공개된 랜딩페이지", "발행한 첫 콘텐츠 3편", "판매 시작된 상품 상세페이지", "첫 실제 주문/예약".
❌ 보고서·기획서·전략문서 남발 금지: "시장 분석 보고서", "기획서", "전략 수립" 같은 내부 문서는 최소한만(스스로 방향 잡는 가벼운 가이드 정도), 산출물의 대부분을 문서로 채우지 마라.
❌ 활동/과정 표현 금지: "~분석", "~조사", "~기획", "~진행" 같은 '하는 일'이 아니라 '완성된 결과물'을.
❌ 성과/지표 금지: "사용자 1만 명 달성", "매출 증가"는 산출물이 아니다.`;

export async function POST(request: Request) {
  const access = await checkAiAccess();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: { mode?: string; context?: string; goalName?: string; goalDesc?: string; deliverableName?: string; projectName?: string; areas?: string[]; today?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const { mode, context = '', goalName = '', goalDesc = '', deliverableName = '', projectName = '', areas = [], today = '' } = body;
  const areaHint = Array.isArray(areas) && areas.length ? `\n참고: 이 사업의 업무 영역 목록: ${areas.join(', ')} (가능하면 이 중에서 고르되 필요하면 추가 가능)` : '';

  let sys = '';
  let user = '';
  if (mode === 'goal-suggest') {
    // Business 맥락 → 구체적·수치 기반 성장 목표 추천 (기한은 targetDate로 분리)
    sys = `${SPIRA_PLANNING_CORE}

# TASK: 사업 목표 추천 (제안만)
이 사업에 맞는 '구체적이고 현실적인 수치 기반 성장 목표' 2~4개를 성장 순서대로 제안해라.
⚠️ "런칭/성장/성장과 확장/성숙" 같은 막연한 단계 라벨 금지. 각 목표 name에는 한눈에 들어오는 '수치'를 담되 "3개월 내/6개월 내" 같은 기간 표현은 name에 넣지 마라 — 기간은 targetDate로 분리한다.
단계마다 숫자가 커지게(예: 월 매출 500만원 → 1,000만원 → 2,000만원). 이 업종·규모에 현실적인 숫자로.
각 목표: name(예: "월 매출 1,000만원", 기간 문구 없이), targetDate("YYYY-MM-DD", 오늘 기준 현실적 기한), successCriteria([{type:'metric',name,target,current,unit,measurementPeriod}]) — 목표의 핵심 수치를 metric 1개로.
반드시 '오직 JSON만': {"goals":[{"name":"월 매출 1,000만원","targetDate":"YYYY-MM-DD","successCriteria":[{"type":"metric","name":"월 매출","target":1000,"current":0,"unit":"만원","measurementPeriod":"월"}]}]}`;
    user = `${today ? `오늘 날짜: ${today}\n` : ''}사업 정보:\n${context}${areaHint}\n\n이 사업에 맞는 현실적인 수치 기반 성장 목표를 추천해줘(기간은 targetDate로).`;
  } else if (mode === 'goal-breakdown') {
    // Goal → 필요한 Projects(+finalDeliverable) — 전략 없이 실행 프로젝트만
    sys = `${SPIRA_PLANNING_CORE}

# TASK: Goal을 실행 프로젝트로 분해 (제안만)
주어진 'Goal'을 달성하기 위해 실제로 진행할 '프로젝트' 2~4개를 '진행 순서대로' 제안해라. 반드시 이 사업의 업종·업무 영역에 맞게.
각 project는 name, finalDeliverable(끝났을 때 고객·관객 앞에 내놓는 최종 결과물).
⚠️ 실제 '만들고·출시하는' 단계를 반드시 포함해라(기획→마케팅→피드백만 나열 금지). "기획서 작성"류를 프로젝트로 만들지 마라. 반복 운영(루틴)은 프로젝트로 만들지 마라.
${DELIVERABLE_RULE}
반드시 '오직 JSON만'(예시는 형식일 뿐): {"projects":[{"name":"프로젝트 이름","finalDeliverable":"최종 결과물"}]}`;
    user = `사업 정보:\n${context}${areaHint}\n\nGoal: ${goalName}${goalDesc ? `\n목표/성과 기준: ${goalDesc}` : ''}\n\n이 목표를 이루기 위해 실제로 진행할 프로젝트를 순서대로 제안해줘(실제 제작·출시 단계 포함).`;
  } else if (mode === 'project-breakdown') {
    // Project → Final Deliverable → Area Deliverables
    sys = `${SPIRA_PLANNING_CORE}

# TASK: Project를 결과물로 분해 (제안만)
주어진 'Project'를 완성하기 위한 구조를 제안해라. 반드시 이 사업의 업종·업무 영역에 맞게.
1) finalDeliverable: 이 프로젝트가 끝났을 때 고객·관객 앞에 내놓는 '최종 결과물' 한 문장.
2) areaDeliverables: 그 결과물을 만들기 위해 '관련 있는 업무 영역'이 내놓을 결과물 2~4개(관련 없는 영역 강제 X). 실제 '만드는·내놓는' 결과 중심으로, 문서·보고서는 최소화.
${DELIVERABLE_RULE}
Task(세부 할일)는 만들지 마라.
반드시 '오직 JSON만'(예시는 형식일 뿐): {"finalDeliverable":"최종 결과물","areaDeliverables":[{"area":"업무영역","content":"이 영역의 결과물"}]}`;
    user = `사업 정보:\n${context}${areaHint}\n\nProject: ${projectName || deliverableName}${goalName ? `\n상위 Goal: ${goalName}` : ''}\n\n이 프로젝트의 최종 결과물과 업무 영역별 산출물을 이 업종에 맞게 제안해줘(빠르게 내놓는 실제 결과 중심).`;
  } else if (mode === 'deliverables') {
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
    const parseAreas = (v: unknown) => Array.isArray(v)
      ? v.map(a => { const aa = a as Record<string, unknown>; return { area: String(aa.area ?? '').trim(), content: String(aa.content ?? '').trim() }; }).filter(a => a.area || a.content).slice(0, 8)
      : [];
    const parseCriteria = (v: unknown) => Array.isArray(v)
      ? v.map(c => { const cc = c as Record<string, unknown>; const type = cc.type === 'metric' ? 'metric' : 'completion'; const b = { type, name: String(cc.name ?? '').trim() }; const nn = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : undefined; }; return type === 'metric' ? { ...b, current: nn(cc.current), target: nn(cc.target), unit: String(cc.unit ?? '').trim(), measurementPeriod: String(cc.measurementPeriod ?? '').trim() } : b; }).filter(c => c.name).slice(0, 6)
      : [];
    if (mode === 'goal-suggest') {
      const goals = Array.isArray(parsed.goals)
        ? parsed.goals.map(g => { const gg = g as Record<string, unknown>; return { name: String(gg.name ?? '').trim(), targetDate: String(gg.targetDate ?? '').trim(), successCriteria: parseCriteria(gg.successCriteria).filter(c => c.type === 'metric') }; }).filter(g => g.name).slice(0, 5)
        : [];
      return NextResponse.json({ goals });
    } else if (mode === 'goal-breakdown') {
      const projects = Array.isArray(parsed.projects)
        ? parsed.projects.map(p => { const pp = p as Record<string, unknown>; return { name: String(pp.name ?? '').trim(), finalDeliverable: String(pp.finalDeliverable ?? '').trim() }; }).filter(p => p.name).slice(0, 6)
        : [];
      return NextResponse.json({ projects });
    } else if (mode === 'project-breakdown') {
      return NextResponse.json({ finalDeliverable: String(parsed.finalDeliverable ?? '').trim(), areaDeliverables: parseAreas(parsed.areaDeliverables) });
    } else if (mode === 'deliverables') {
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
