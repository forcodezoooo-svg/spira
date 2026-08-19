import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { checkAiAccess } from '../../lib/aiUsage';
import { SPIRA_PLANNING_CORE } from '../../lib/ai/prompts';

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

  const sys = `${SPIRA_PLANNING_CORE}

# TASK: 목표 점검 (제안만, 확정 아님)
사용자가 입력한 '사업 목표'가 실행 가능한지 점검하고, 어떻게 달성 여부를 판단할지(성과 기준)를 제안해라. SMART 같은 전문용어는 노출하지 말고 쉬운 말로.
판단 순서: 1) 무엇을 달성하려는가 2) 성과형/달성형/복합형 중 어떤 성격인가 3) 달성을 판단할 성과 기준이 있는가 4) 숫자로 측정하는 게 자연스러우면 metric, 그렇지 않으면 completion(완료 조건)을 추천 5) 기간이 필요한 목표면 목표일 제안 6) 현재 사업 상황 대비 현실성 검토 7) 필요하면 목표 문장 수정 제안.
⚠️ 숫자를 무조건 요구하지 마라. 예: "올해 첫 전자책 출시" → completion 기준(최종 원고 완성/편집·디자인 완료/판매 페이지 공개/구매 가능)으로 제안. "월 매출 1,000만원" → metric 기준(월 매출, target 1000, unit 만원)으로.

반드시 '오직 JSON만' 출력:
{"ok":true|false, "issues":["보완하면 좋은 점 1~3개, 쉬운 말"], "title":"다듬은 목표 문장(있으면)", "successCriteria":[{"type":"metric","name":"월 매출","target":1000,"current":0,"unit":"만원","measurementPeriod":"월"},{"type":"completion","name":"판매 페이지 공개"}], "targetDate":"YYYY-MM-DD(필요시)", "note":"현실성 등 한 줄"}
- successCriteria는 2~5개. 이 목표에 자연스러운 형태만(metric/completion 섞어도 됨).
- ok: 원래 입력이 이미 충분히 명확하면 true, 다듬을 필요 있으면 false.`;

  const user = `${today ? `오늘 날짜: ${today}\n` : ''}사업 정보:\n${context || '(정보 없음)'}\n\n사용자가 입력한 목표:\n이름: ${goalName || '(없음)'}\n설명/목표문장: ${goalStatement || '(없음)'}\n\n이 목표의 성과 기준(달성 판단 방법)을 제안해줘.`;

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
    const successCriteria = Array.isArray(p.successCriteria)
      ? p.successCriteria.map(c => {
          const cc = c as Record<string, unknown>;
          const type = cc.type === 'metric' ? 'metric' : 'completion';
          const base = { type, name: String(cc.name ?? '').trim() };
          return type === 'metric'
            ? { ...base, current: num(cc.current), target: num(cc.target), unit: String(cc.unit ?? '').trim(), measurementPeriod: String(cc.measurementPeriod ?? '').trim() }
            : base;
        }).filter(c => c.name).slice(0, 6)
      : [];
    return NextResponse.json({
      ok: p.ok === true,
      issues: Array.isArray(p.issues) ? p.issues.map(x => String(x)).filter(Boolean).slice(0, 4) : [],
      title: String(p.title ?? '').trim(),
      successCriteria,
      targetDate: String(p.targetDate ?? '').trim(),
      note: String(p.note ?? '').trim(),
    });
  } catch {
    return NextResponse.json({ error: 'ai-fail' }, { status: 500 });
  }
}
