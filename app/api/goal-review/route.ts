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
사용자가 입력한 '사업 목표'가 명확하고 현실적인지 점검하고, 더 또렷한 '수치 기반 목표'로 다듬어 제안해라. SMART 같은 전문용어는 노출하지 말고 쉬운 말로.
⚠️ 사업 목표는 '사업 전체의 성장·확장' 수준이어야 한다(고객/유저 수, 순이익, 총 이익 성장률, 시장·B2B 확장, 새 수익모델 등). 만약 입력이 "기능 개선/피드백 반영/OO 기능 출시"처럼 프로젝트 이하 단계라면, issues에 "이건 사업 목표보다 프로젝트에 가까워요"라고 알려주고, 그 기능이 기여할 '사업 성장 목표'(예: 그로 인한 고객 수·매출·순이익 목표)로 끌어올려 제안해라.
판단 순서: 1) 무엇을 달성하려는가 2) 한눈에 들어오는 수치 목표가 있는가 3) 기간이 필요하면 목표일 제안 4) 현재 사업 상황 대비 현실성 검토 5) 다듬은 목표 문장 제안.
목표 name/title에는 "3개월 내" 같은 기간 표현을 넣지 말고 기간은 targetDate로 분리. 핵심 수치는 metric 성과 기준 1~2개로.

반드시 '오직 JSON만' 출력:
{"ok":true|false, "issues":["보완하면 좋은 점 1~3개, 쉬운 말"], "title":"다듬은 목표(수치 포함, 기간 문구 없이)", "successCriteria":[{"type":"metric","name":"월 매출","target":1000,"current":0,"unit":"만원","measurementPeriod":"월"}], "targetDate":"YYYY-MM-DD(필요시)", "note":"현실성 등 한 줄"}
- successCriteria는 이 목표를 판단할 '관련 지표를 모두'(1~4개, 사업 성격에 맞게) metric으로. (완료조건 만들지 말 것)
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
