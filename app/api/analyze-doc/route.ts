import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { NextResponse } from 'next/server';
import { checkAiAccess } from '../../lib/aiUsage';

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

  const sys = `너는 사업계획서를 읽고 핵심을 요약하는 어시스턴트야. 주어진 사업계획서(문서/이미지/텍스트)를 바탕으로 아래 JSON을 한국어로 채워서 '오직 JSON만' 출력해. 개요 6개 항목은 각 1~3문장으로 간결하게.
goals는 이 사업의 '큰 사업 목표'를 단계 순서대로 3~5개. 각 목표는 name(단계 이름, 예: "초기 시장 진입")과 desc를 갖는다.
desc에는 그 단계에서 달성할 '구체적 수치 목표'를 반드시 포함해라. 초보 창업자도 목표치를 알 수 있게 숫자로. (예: "출시 후 3개월 내 가입 유저 1,000명·월 매출 300만원")
각 목표의 deliverables는 그 목표를 이루기 위한 '큰 단위의 산출물(마일스톤/프로젝트)' 2~4개다. 잘게 쪼개지 말 것 — 각 산출물은 여러 업무를 포함하는 굵직한 결과물이어야 한다. (예: "초기 제품 프로토타입 완료" 하나 안에 시장분석·브랜딩·웹사이트 구성이 포함됨) 실제 진행 순서대로 나열.
근거가 없는 항목은 빈 문자열("") 또는 빈 배열([]).
{"tagline":"사업을 한 문장으로 소개","concept":"브랜드의 핵심 컨셉·방향성·감성","problem":"해결하려는 핵심 문제","solution":"그 문제를 해결하는 솔루션","mission":"우리가 존재하는 이유/목적","vision":"궁극적으로 이루려는 모습","goals":[{"name":"사업 목표(단계) 이름","desc":"이 단계 한 줄 설명","deliverables":["산출물1","산출물2"]}]}`;

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
    // 사업 목표(goals) 파싱 — 사업목표 > 산출물(이름) 2단계
    const goalsRaw = Array.isArray(parsed.goals) ? parsed.goals : [];
    const goals = goalsRaw.slice(0, 8).map(g => {
      const gg = g as Record<string, unknown>;
      const deliverables = Array.isArray(gg.deliverables)
        ? gg.deliverables.map(d => String(d).trim()).filter(Boolean).slice(0, 12)
        : [];
      return { name: String(gg.name ?? '').trim(), desc: String(gg.desc ?? '').trim(), deliverables };
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
