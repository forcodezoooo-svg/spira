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

  const sys = `너는 사업계획서를 읽고 핵심을 요약하는 어시스턴트야. 주어진 사업계획서(문서/이미지/텍스트)를 바탕으로 아래 6개 항목을 한국어로 간결하게(각 1~3문장) 채워서 '오직 JSON만' 출력해. 근거가 없는 항목은 빈 문자열("")로 둬.
{"tagline":"사업을 한 문장으로 소개","concept":"브랜드의 핵심 컨셉·방향성·감성","problem":"해결하려는 핵심 문제","solution":"그 문제를 해결하는 솔루션","mission":"우리가 존재하는 이유/목적","vision":"궁극적으로 이루려는 모습"}`;

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
    // 전부 비어 있으면 문서에서 아무것도 못 읽은 것 (스캔 품질 등)
    if (!Object.values(fields).some(v => v.trim())) {
      return NextResponse.json({ error: 'no-text' }, { status: 400 });
    }
    return NextResponse.json({ fields });
  } catch {
    return NextResponse.json({ error: 'ai-fail' }, { status: 500 });
  }
}
