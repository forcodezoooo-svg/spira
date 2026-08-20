import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { NextResponse } from 'next/server';
import { checkAiAccess } from '../../lib/aiUsage';
import { SPIRA_PLANNING_CORE } from '../../lib/ai/prompts';

// 사업계획서(PDF·이미지·텍스트) 업로드 → gpt-4o가 직접 읽어 '사업 개요' 6개 항목 요약.
// PDF/이미지는 파일 입력으로 넘겨 스캔(이미지) PDF도 분석 가능. 지연 초기화로 빌드 안전.
export const runtime = 'nodejs';
export const maxDuration = 60;

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function POST(request: Request) {
  // 로그인 필수 + 무료 한도 (다른 AI 라우트와 동일)
  const access = await checkAiAccess();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch { /* ignore */ }
  if (!file) return NextResponse.json({ error: 'no-file' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const type = file.type || '';
  const name = (file.name || '').toLowerCase();
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf');
  const isImage = type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name);
  const isText = type.startsWith('text/') || /\.(txt|md)$/.test(name);

  const sys = `${SPIRA_PLANNING_CORE}

# TASK: 사업계획서 분석 → 아래 JSON을 한국어로 채워 '오직 JSON만' 출력. 개요 6개 항목은 각 1~3문장.
goals는 이 사업의 '사업 목표'를 성장 순서대로 2~4개. ⚠️ 사업 목표는 '사업 전체의 성장·확장' 수준(고객/유저 수, 월/연 순이익, 총 이익 X% 성장, 새 시장·B2B 확장, 새 수익모델 도입 등)이어야 한다. "기능 개선/피드백 반영/OO 기능 출시" 같은 제품·운영·기능 단위는 사업 목표가 아니다(프로젝트 이하) — 넣지 마라. 목표 name은 '구체적·현실적 수치'를 담되 "3개월 내" 같은 기간 표현은 name에 넣지 말고 targetDate로 분리. "런칭/성장/성숙" 같은 막연한 단계 라벨 금지. 단계마다 수치가 커지도록.
- name(예: "월 매출 1,000만원", 기간 문구 없이), targetDate("YYYY-MM-DD", 있으면)
- successCriteria: 이 목표를 판단할 '관련 지표를 모두'(2~5개), 사업 성격에 맞게. metric만 [{"type":"metric","name","target","current","unit","measurementPeriod"}]. (완료조건 만들지 말 것)
- projects: 실행 프로젝트 1~3개(큰 마일스톤 단위, 진행 순서, 실제 제작·출시 단계 포함). 작은 기능들을 각각 프로젝트로 쪼개지 말고 하나의 큰 프로젝트(예: "MVP 개발 및 런칭") 안 산출물로 묶어라. 각 {name, finalDeliverable, areaDeliverables:[{area, content}]}. 결과물은 문서·보고서 말고 고객·관객 앞에 내놓는 '실제 결과물'.
근거 없으면 빈 값/빈 배열.
{"tagline":"","concept":"","problem":"","solution":"","mission":"","vision":"","goals":[{"name":"월 매출 1,000만원","targetDate":"","successCriteria":[{"type":"metric","name":"월 매출","target":1000,"current":0,"unit":"만원","measurementPeriod":"월"}],"projects":[{"name":"","finalDeliverable":"","areaDeliverables":[{"area":"","content":""}]}]}]}`;

  // gpt-4o에 넘길 user content 구성
  const userParts: ChatCompletionContentPart[] = [
    { type: 'text', text: '이 사업계획서를 읽고 지정한 JSON 형식으로 요약해줘.' },
  ];
  if (isPdf) {
    const dataUrl = `data:application/pdf;base64,${buf.toString('base64')}`;
    userParts.push({ type: 'file', file: { filename: file.name || 'plan.pdf', file_data: dataUrl } });
  } else if (isImage) {
    const mime = type || 'image/png';
    userParts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } });
  } else if (isText) {
    const text = new TextDecoder().decode(buf).replace(/\s+/g, ' ').trim().slice(0, 15000);
    if (text.length < 20) return NextResponse.json({ error: 'no-text' }, { status: 400 });
    userParts.push({ type: 'text', text: `사업계획서 내용:\n${text}` });
  } else {
    return NextResponse.json({ error: 'unsupported' }, { status: 400 });
  }

  const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `오늘 날짜는 ${todayKST}입니다. 모든 날짜(targetDate 등)는 오늘 이후로만, 과거 연도 금지.\n\n${sys}` },
        { role: 'user', content: userParts },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fields = {
      tagline: String(parsed.tagline ?? ''),
      concept: String(parsed.concept ?? ''),
      problem: String(parsed.problem ?? ''),
      solution: String(parsed.solution ?? ''),
      mission: String(parsed.mission ?? ''),
      vision: String(parsed.vision ?? ''),
    };
    // 사업 목표(goals) 파싱 — Goal(측정가능) > Strategy > Project(+Area Deliverables)
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
    const parseAreas = (v: unknown) => Array.isArray(v)
      ? v.map(a => { const aa = a as Record<string, unknown>; return { area: String(aa.area ?? '').trim(), content: String(aa.content ?? '').trim() }; }).filter(a => a.area || a.content).slice(0, 6)
      : [];
    const parseCriteria = (v: unknown) => Array.isArray(v)
      ? v.map(c => {
          const cc = c as Record<string, unknown>;
          const type = cc.type === 'metric' ? 'metric' : 'completion';
          const b = { type, name: String(cc.name ?? '').trim() };
          return type === 'metric' ? { ...b, current: num(cc.current), target: num(cc.target), unit: String(cc.unit ?? '').trim(), measurementPeriod: String(cc.measurementPeriod ?? '').trim() } : b;
        }).filter(c => c.name).slice(0, 6)
      : [];
    const goalsRaw = Array.isArray(parsed.goals) ? parsed.goals : [];
    const goals = goalsRaw.slice(0, 6).map(g => {
      const gg = g as Record<string, unknown>;
      const projects = Array.isArray(gg.projects)
        ? gg.projects.map(p => { const pp = p as Record<string, unknown>; return { name: String(pp.name ?? '').trim(), finalDeliverable: String(pp.finalDeliverable ?? '').trim(), areaDeliverables: parseAreas(pp.areaDeliverables) }; }).filter(p => p.name).slice(0, 6)
        : [];
      return {
        name: String(gg.name ?? '').trim(),
        statement: String(gg.statement ?? gg.desc ?? '').trim(),
        targetDate: String(gg.targetDate ?? '').trim(),
        successCriteria: parseCriteria(gg.successCriteria),
        strategies: parseAreas(gg.strategies),
        projects,
      };
    }).filter(g => g.name);
    // 전부 비어 있으면 문서에서 아무것도 못 읽은 것 (스캔 품질 등)
    if (!Object.values(fields).some(v => v.trim()) && goals.length === 0) {
      return NextResponse.json({ error: 'no-text' }, { status: 400 });
    }
    return NextResponse.json({ fields, goals });
  } catch {
    return NextResponse.json({ error: 'ai-fail' }, { status: 500 });
  }
}
