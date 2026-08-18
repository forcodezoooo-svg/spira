import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { checkAiAccess } from '../../lib/aiUsage';

// 사업계획서(PDF·텍스트) 업로드 → 텍스트 추출 → AI가 '사업 개요' 5개 항목 요약.
// pdf-parse는 Node 런타임 필요(엣지 X). 지연 초기화로 빌드 중 키 없이도 안전.
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

  const buf = new Uint8Array(await file.arrayBuffer());
  const type = file.type || '';
  const name = (file.name || '').toLowerCase();

  // 1) 텍스트 추출
  let text = '';
  try {
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buf });
      const r = await parser.getText();
      text = r.text ?? '';
      await parser.destroy();
    } else if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
      text = new TextDecoder().decode(buf);
    } else {
      return NextResponse.json({ error: 'unsupported' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'parse-fail' }, { status: 400 });
  }

  text = text.replace(/\s+/g, ' ').trim();
  if (text.length < 20) return NextResponse.json({ error: 'no-text' }, { status: 400 });
  const clipped = text.slice(0, 15000); // 토큰 절약

  // 2) AI 요약 → JSON
  const sys = `너는 사업계획서를 읽고 핵심을 요약하는 어시스턴트야. 주어진 사업계획서 내용을 바탕으로 아래 5개 항목을 한국어로 간결하게(각 1~3문장) 채워서 '오직 JSON만' 출력해. 문서에 근거가 없는 항목은 빈 문자열("")로 둬.
{"tagline":"사업을 한 문장으로 소개","problem":"해결하려는 핵심 문제","solution":"그 문제를 해결하는 솔루션","mission":"우리가 존재하는 이유/목적","vision":"궁극적으로 이루려는 모습"}`;
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `사업계획서 내용:\n${clipped}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fields = {
      tagline: String(parsed.tagline ?? ''),
      problem: String(parsed.problem ?? ''),
      solution: String(parsed.solution ?? ''),
      mission: String(parsed.mission ?? ''),
      vision: String(parsed.vision ?? ''),
    };
    return NextResponse.json({ fields });
  } catch {
    return NextResponse.json({ error: 'ai-fail' }, { status: 500 });
  }
}
