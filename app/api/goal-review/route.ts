import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { checkAiAccess } from '../../lib/aiUsage';

// AI 목표 점검: 사용자가 입력한 Goal이 '실행 가능한 목표'인지 검토하고 수정안을 '제안'만 한다.
// (실제 Goal을 바꾸지 않는다 — 사용자가 확인 후 승인해야 반영)
export const runtime = 'nodejs';
export const maxDuration = 60;

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function POST(request: Request) {
  const access = await checkAiAccess();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: { context?: string; goalName?: string; goalStatement?: string; today?: string } = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const { context = '', goalName = '', goalStatement = '', today = '' } = body;

  const sys = `너는 1인 창업가의 목표 설정을 돕는 코치야. 사용자가 입력한 '사업 목표'가 실행 가능한지 점검하고, 더 명확한 목표로 다듬어 '제안'해라. (사용자 승인 전이므로 확정이 아니라 제안이다)
좋은 목표는 '구체적·측정 가능·기한·현재값/목표값·현실성'을 갖춘다. 하지만 사용자에게 SMART 같은 전문용어를 강하게 노출하지 마라 — 쉬운 말로 설명해라.
검토 포인트: 구체적인가 / 측정 가능한가 / KPI가 있는가 / 기한이 있는가 / 현재값·목표값이 명확한가 / 기간 대비 현실적인가 / 너무 추상적이면 어떻게 고칠지.
반드시 아래 '오직 JSON만' 출력:
{"ok":true/false, "issues":["부족한 점 1~3개, 쉬운 말"], "measurableGoal":"다듬은 목표 문장(기한+수치 포함)", "kpi":"핵심 지표 이름", "current":숫자, "target":숫자, "unit":"단위", "targetDate":"YYYY-MM-DD", "note":"한 줄 코멘트(현실성 등)"}
- 값이 문서/입력에서 불명확하면 합리적으로 추정하되, current는 모르면 0.
- ok는 원래 입력이 이미 충분히 좋은 목표면 true, 다듬을 필요가 있으면 false.`;

  const user = `${today ? `오늘 날짜: ${today}\n` : ''}사업 정보:\n${context || '(정보 없음)'}\n\n사용자가 입력한 목표:\n이름: ${goalName || '(없음)'}\n설명/목표문장: ${goalStatement || '(없음)'}\n\n이 목표를 점검하고 측정 가능한 형태로 제안해줘.`;

  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });
    const p = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
    return NextResponse.json({
      ok: p.ok === true,
      issues: Array.isArray(p.issues) ? p.issues.map(x => String(x)).filter(Boolean).slice(0, 4) : [],
      measurableGoal: String(p.measurableGoal ?? '').trim(),
      kpi: String(p.kpi ?? '').trim(),
      current: num(p.current),
      target: num(p.target),
      unit: String(p.unit ?? '').trim(),
      targetDate: String(p.targetDate ?? '').trim(),
      note: String(p.note ?? '').trim(),
    });
  } catch {
    return NextResponse.json({ error: 'ai-fail' }, { status: 500 });
  }
}
