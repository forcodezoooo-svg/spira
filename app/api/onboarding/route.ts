import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 온보딩 전용 — 사업 설명·첫 목표를 분석해 기획서 초안 + 분기별 목표 + 업무 영역을 JSON으로 반환.
export async function POST(request: Request) {
  const { name, description, goal } = await request.json();

  const system = `당신은 1인 창업가를 위한 사업 운영 OS 'Spira'의 온보딩 어시스턴트예요.
사용자가 알려준 사업 정보를 바탕으로 초기 기획서·분기별 목표·업무 영역을 제안합니다.
반드시 아래 JSON 스키마로만, 한국어로, 따뜻하고 간결하게 답하세요. 각 문장은 짧고 실용적으로.

{
  "tagline": "브랜드를 한 문장으로 (누구를 위해 무엇을)",
  "mission": "이 사업이 매일 이루려는 목적 한 문장",
  "vision": "장기적으로 만들고 싶은 미래 한 문장",
  "problems": ["고객의 핵심 문제 2~3개(문장)"],
  "solutions": [{ "title": "솔루션 이름", "memo": "한 줄 설명" }],
  "revenueModel": [{ "title": "수익 모델", "memo": "한 줄 설명" }],
  "quarterlyGoals": [{ "name": "수치가 드러나는 구체적 목표 (예: 유료 구독자 500명 확보)", "goal": "달성 여부를 판단할 핵심 지표와 목표 수치" }],
  "workAreas": [{ "name": "업무 영역", "goal": "이 영역의 목표" }]
}

- quarterlyGoals: 사용자의 '첫 목표'를 달성하기 위해 분기별로 나눈 단계적 목표 3~4개.
  ⚠️ 반드시 '수치가 드러나는 구체적이고 측정 가능한(SMART)' 목표로 제안하세요. 각 name에는 목표 대상과 함께 **구체적인 숫자(인원·매출·건수·비율·기간 등)를 반드시 포함**하세요.
    좋은 예: "베타 출시 후 가입자 1,000명 확보", "월 매출 300만원 달성", "재구매율 40%까지 개선", "인스타그램 팔로워 5,000명 달성".
    나쁜 예(수치·구체성 없음, 사용 금지): "사용자 늘리기", "브랜드 인지도 높이기", "매출 성장".
  ⚠️ 앞 분기보다 뒤 분기의 목표 수치가 점진적으로 커지도록(누적 성장하도록) 단계적으로 설계하세요.
  ⚠️ name에 "1분기"·"2분기" 같은 분기 라벨이나 번호를 넣지 마세요. 순서가 곧 분기입니다. goal에는 그 목표의 핵심 지표와 목표 수치를 한 줄로 적으세요.
- workAreas: 목표 달성에 필요한 업무 영역(예: 기획, 디자인, 개발, 마케팅) 3~5개.
- solutions 2~3개, revenueModel 1~3개, problems 2~3개.`;

  const user = `사업 이름: ${name || '(미입력)'}\n사업 설명: ${description || '(미입력)'}\n이루고 싶은 첫 목표: ${goal || '(미입력)'}`;

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const json = JSON.parse(res.choices[0]?.message?.content || '{}');
    return Response.json(json);
  } catch {
    return Response.json({ error: true }, { status: 500 });
  }
}
