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
goals는 이 사업의 '사업 목표'를 순서대로 2~4개. 각 목표는:
- name(목표 이름), statement(목표 문장), targetDate("YYYY-MM-DD", 있으면)
- successCriteria: 이 목표의 '달성 판단 기준' 2~5개. 숫자로 재는 게 자연스러우면 {"type":"metric","name","target","current","unit","measurementPeriod"}, 완료로 판단하는 게 자연스러우면 {"type":"completion","name"}. 숫자를 억지로 만들지 말 것. (이 사업 업종에 맞게!)
- strategies: 관련 있는 업무 영역만 [{area, content}] (2~4개, 강제 X)
- projects: 실행 프로젝트 2~4개. 각 {name, finalDeliverable, areaDeliverables:[{area, content}]}. 결과물은 '활동'이 아니라 '명사형 결과물'.
근거 없으면 빈 값/빈 배열.
{"tagline":"","concept":"","problem":"","solution":"","mission":"","vision":"","goals":[{"name":"","statement":"","targetDate":"","successCriteria":[{"type":"metric","name":"월 매출","target":1000,"current":0,"unit":"만원","measurementPeriod":"월"},{"type":"completion","name":"정식 오픈"}],"strategies":[{"area":"","content":""}],"projects":[{"name":"","finalDeliverable":"","areaDeliverables":[{"area":"","content":""}]}]}]}`;

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

  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
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
