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

  type ChatMsg = { role: 'user' | 'assistant'; content: string };
  let body: { mode?: string; context?: string; goalName?: string; goalDesc?: string; deliverableName?: string; projectName?: string; areas?: string[]; today?: string; messages?: ChatMsg[]; currentGoals?: unknown } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const { mode, context = '', goalName = '', goalDesc = '', deliverableName = '', projectName = '', areas = [], today = '', messages = [], currentGoals } = body;
  const areaHint = Array.isArray(areas) && areas.length ? `\n참고: 이 사업의 업무 영역 목록: ${areas.join(', ')} (가능하면 이 중에서 고르되 필요하면 추가 가능)` : '';

  let sys = '';
  let user = '';
  if (mode === 'goal-suggest') {
    // Business 맥락 → 5단계 성장 목표(근거 포함) 추천 + 대화로 조정
    sys = `${SPIRA_PLANNING_CORE}

# TASK: 사업 목표 5단계 추천 + 대화로 조정 (제안만)
이 사업에 맞는 '사업 전체의 성장 목표' 5개를 성장 순서대로 제안해라. (위 GOAL 규칙 준수 — 고객/순이익/확장/새 수익모델 수준. "기능 개선/피드백/기능 출시" 같은 프로젝트 이하 단위 금지)
⚠️ 1인 창업자가 '충분히 달성 가능하다'고 느끼게 하라. 처음부터 거창한 큰 숫자로 시작하지 마라. 1단계는 아주 작고 현실적으로. 이후 단계는 '이전 단계 달성치에서 비례해 성장'하도록 촘촘하게(배수로 서서히). 큰 그림은 마지막 5단계에만.
⚠️ 목표를 매출로만 채우지 마라. 실제 KPI 퍼널(단계) 순서를 따라라 — 사업 초기엔 매출이 바로 나지 않는다. 그래서 앞 단계부터: ①이용자/사용자 확보(가입자 수·방문자·구독자·팔로워·MAU) → ②활성·유지(DAU/MAU·재방문율·리텐션) → ③유료 전환(유료 전환율·유료 고객 수) → ④매출 → ⑤순이익/확장 순으로 배치해라. 각 단계 목표의 '대표 지표(name)'는 그 단계에 맞는 KPI여야 한다(초기=가입자/MAU, 후기=매출/순이익). successCriteria에는 그 목표와 관련된 KPI들을 함께 넣어라(가입자·유료 전환율·DAU/MAU·매출 등).
업종에 맞게 KPI 선택: 콘텐츠/크리에이터=구독자·조회수·시청시간·전환율 / 오프라인 매장=일방문객·재방문율·객단가·월매출 / 앱·서비스=가입자·DAU/MAU·유료 전환율·MRR.
⚠️ 정보가 부족해도, 사업계획서·사업 개요를 근거로 '합리적으로 추측해서' 반드시 '구체적 수치 목표'를 만들어라. name은 언제나 구체적 수치여야 한다(예: "유료 구독자 300명", "월 매출 500만원", "월 순이익 200만원"). ❌ "첫번째 목표 / 1단계 / 초기 목표" 같은 placeholder 이름 절대 금지 — 수치를 비우지 마라.
⚠️ 목표는 '단위 경제(가격·단가)'에 일관돼야 한다. 예: 구독 서비스면 (구독가 × 유료 고객 수 = 매출)이 서로 맞아야 한다(고객 100명·매출 500만원처럼 안 맞는 숫자 금지). 가격/단가 정보가 없으면 '합리적 가정'을 세워 수치를 채우되(예: 구독가 1만원 가정), 그 가정을 rationale에 밝히고 reply에서 "가격을 알려주시면 더 정확히 맞춰드릴게요"라고 물어라. 사용자가 가격을 알려주면 그 기반으로 고객 수·매출을 일관되게 다시 계산해라. — 어떤 경우에도 목표 name과 수치는 비워두지 말고 항상 구체적으로 채워라.
각 목표: name(구체적 수치, "3개월 내" 같은 기간 문구 없이), targetDate("YYYY-MM-DD", 오늘 기준 현실적으로 단계마다 점점 뒤로), rationale(왜 이 수치인지 1문장 — 가격/단가·직전 단계 대비 근거, 가정을 세웠다면 명시), successCriteria(관련 지표 2~4개 metric, current는 모르면 0. 서로 수치가 일관되게).
reply: 짧고 따뜻한 설명/답변 1~2문장. 정보가 부족해 가정을 세웠다면 그걸 밝히고 무엇을 알려주면 더 정확해지는지(예: 가격) 물어봐라.
반드시 '오직 JSON만'(name은 반드시 구체적 수치, 초기 단계는 이용자 지표부터): {"reply":"...","goals":[{"name":"누적 가입자 1,000명","targetDate":"2026-02-28","rationale":"초기엔 매출보다 사용자 기반 확보가 먼저. 유입 대비 현실적인 초기 목표","successCriteria":[{"type":"metric","name":"누적 가입자","target":1000,"current":0,"unit":"명"},{"type":"metric","name":"DAU","target":100,"current":0,"unit":"명","measurementPeriod":"일"}]},{"name":"유료 전환율 5% 달성","targetDate":"2026-05-31","rationale":"가입자 기반이 생긴 뒤 유료 전환에 집중","successCriteria":[{"type":"metric","name":"유료 전환율","target":5,"current":0,"unit":"%"},{"type":"metric","name":"유료 고객","target":50,"current":0,"unit":"명"}]}]}
사용자가 대화로 수치·개수·방향 조정을 요청하면, 그 요청을 반영해 goals '전체'를 다시 제시하고 reply로 무엇을 바꿨는지 설명해라.${currentGoals ? `\n\n[현재 제안된 목표(조정 대상)]\n${JSON.stringify(currentGoals)}` : ''}`;
    user = `${today ? `오늘 날짜: ${today}\n` : ''}사업 정보:\n${context}${areaHint}\n\n이 사업의 성장 목표 5단계를 현실적이고 촘촘하게(달성 가능한 작은 수치부터) 제안해줘.`;
  } else if (mode === 'goal-breakdown') {
    // Goal → 필요한 Projects(+finalDeliverable) — 전략 없이 실행 프로젝트만
    sys = `${SPIRA_PLANNING_CORE}

# TASK: Goal을 실행 프로젝트로 분해 (제안만)
주어진 'Goal'을 달성하기 위한 '프로젝트'를 제안해라. 반드시 이 사업의 업종·업무 영역에 맞게.
⚠️ 프로젝트는 '큰 마일스톤' 단위다. 개별 기능·작은 산출물(예: "AI 시나리오 기능 출시", "추천 기능 추가", "런칭 캠페인")을 각각 프로젝트로 만들지 마라 — 그것들은 하나의 큰 프로젝트(예: "MVP 개발 및 런칭") 안의 '산출물'로 묶여야 한다.
그래서 프로젝트 개수는 보통 1~3개(초기 단계면 1개도 정상). 각 project는 name(큰 마일스톤), finalDeliverable(끝났을 때 고객·관객 앞에 내놓는 최종 결과물). 진행 순서대로.
실제 '만들고·출시하는' 단계를 반드시 포함하고, 반복 운영(루틴)은 프로젝트로 만들지 마라. "기획서 작성"류를 프로젝트로 만들지 마라.
${DELIVERABLE_RULE}
반드시 '오직 JSON만'(예시는 형식일 뿐): {"projects":[{"name":"MVP 개발 및 런칭","finalDeliverable":"실제 사용자가 가입·사용할 수 있는 서비스 출시"}]}`;
    user = `사업 정보:\n${context}${areaHint}\n\nGoal: ${goalName}${goalDesc ? `\n목표/성과 기준: ${goalDesc}` : ''}\n\n이 목표를 이루기 위한 '큰 마일스톤' 단위 프로젝트를 1~3개, 순서대로 제안해줘(작은 기능들은 각각 프로젝트로 쪼개지 말고 하나로 묶어서).`;
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

  // 오늘 날짜(KST)를 시스템에 항상 주입 — 과거 연도(2024 등)로 일정 잡는 실수 방지
  const todayKST = today || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dateNote = `오늘 날짜는 ${todayKST}입니다. 모든 날짜(targetDate 등)는 반드시 오늘 이후(오늘부터 시작하는 미래)로만 잡고, 과거 연도(2024 등)는 절대 쓰지 마세요.`;
  // goal-suggest는 대화(messages)로 조정 가능 — 있으면 대화를, 없으면 초기 user 프롬프트를 사용
  const convo: ChatMsg[] = (mode === 'goal-suggest' && Array.isArray(messages) && messages.length)
    ? messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12)
    : [{ role: 'user', content: user }];
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${dateNote}\n\n${sys}` },
        ...convo,
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
        ? parsed.goals.map(g => { const gg = g as Record<string, unknown>; return { name: String(gg.name ?? '').trim(), targetDate: String(gg.targetDate ?? '').trim(), rationale: String(gg.rationale ?? '').trim(), successCriteria: parseCriteria(gg.successCriteria).filter(c => c.type === 'metric') }; }).filter(g => g.name).slice(0, 6)
        : [];
      return NextResponse.json({ goals, reply: String(parsed.reply ?? '').trim() });
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
