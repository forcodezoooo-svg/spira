import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { BASE_SYSTEM, BUSINESS_PLANNING_SYSTEM, ROUTINE_SYSTEM, FINANCIAL_PLANNING_SYSTEM } from '../../lib/ai/prompts';
import { ITEM_REVISE_MARKER, FIN_REPLAN_MARKER } from '../../lib/ai/markers';
import { checkAiAccess } from '../../lib/aiUsage';

// 지연 초기화: 빌드(page data 수집) 중 키 없이 모듈만 로드돼도 터지지 않도록,
// 클라이언트는 실제 요청이 들어올 때 만든다.
let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function POST(request: Request) {
  // 로그인 필수 + 무료 하루 한도 (비로그인 외부 호출 차단 → 비용 남용 방지)
  const access = await checkAiAccess();
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const { messages, planMode, routineMode, financeMode, appContext, reviseTarget } = await request.json();

  const baseSystem = planMode ? BUSINESS_PLANNING_SYSTEM : routineMode ? ROUTINE_SYSTEM : BASE_SYSTEM;
  const financeNote = financeMode ? `\n\n---\n${FINANCIAL_PLANNING_SYSTEM}\n\n조정안이 구체적으로 정해지면(사용자가 동의했거나 명확한 제안일 때), 답변 맨 끝에 아래 형식을 그대로 붙이세요. 그래야 '재무 조정안 적용' 버튼이 생겨 재무계획에 반영됩니다. 배분은 프로젝트/목표별 '최종 금액'입니다. 컨텍스트에 주어진 id(프로젝트 id 등)를 그대로 쓰세요.\n${FIN_REPLAN_MARKER}\n{"reserveTarget": 1800000, "allocations": [{"projectId": "id", "amount": 1500000}, {"goalId": "id", "amount": 2000000}], "summary": "한 줄 요약"}\n아직 논의 중이거나 여러 안을 비교하는 단계면 마커를 넣지 마세요. 운영비·Reserve를 보호하고, 사용자 승인 없이 임의로 확정하지 마세요(마커는 '제안'이며 실제 반영은 사용자가 버튼으로 승인).` : '';
  // 오늘 날짜(KST)를 항상 알려줘 과거 연도(예: 2023)로 일정 잡는 실수를 막는다.
  const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dateNote = `오늘 날짜는 ${todayKST}(KST)입니다. 모든 데드라인·할일 날짜는 반드시 오늘 이후(현재~미래)로만 잡으세요. 과거 날짜(지난 연도 등) 절대 금지.`;
  // 특정 항목 다듬기 모드: 그 항목 하나만 대화로 개선하고, 반영할 최종 문구는 마커로 출력하게 안내
  const reviseNote = typeof reviseTarget === 'string' && reviseTarget
    ? `\n\n---\n지금 사용자는 '${reviseTarget}' 항목 하나를 함께 다듬고 있습니다. 이 항목의 '내용(그 칸에 그대로 들어갈 문구)'에만 집중하세요.\n대화하다가 반영할 최종 내용이 정해지면(사용자가 좋다고 하거나 확정적이면), 답변 맨 끝에 반드시 아래 형식을 그대로 붙이세요. 그래야 '적용' 버튼이 생겨 그 항목에 반영됩니다:\n${ITEM_REVISE_MARKER}\n{"text": "그 항목에 그대로 들어갈 최종 문구(설명·따옴표·머리말 없이 내용만)"}\n아직 논의 중이거나 여러 안을 제시하는 단계면 마커를 넣지 마세요. 최종안 하나가 정해졌을 때만 마커를 출력하세요.`
    : '';
  const systemContent = `${dateNote}\n\n${baseSystem}${reviseNote}${financeNote}` + (appContext
    ? `\n\n---\n현재 사용자의 앱 데이터 (질문에 이 데이터를 참고해서 구체적으로 답변하세요):\n${appContext}`
    : '');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const openaiStream = await getClient().chat.completions.create({
          model: 'gpt-4o',
          stream: true,
          temperature: 0.5, // 형식(마커) 준수율↑
          messages: [
            { role: 'system', content: systemContent },
            ...messages,
          ],
        });

        let full = '';
        for await (const chunk of openaiStream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) { full += text; controller.enqueue(encoder.encode(text)); }
        }

        // 마커 강제(2차 패스): Process(routine) 모드에서 AI가 계획을 설명하고도 마커를 빠뜨리면 버튼이 안 뜬다.
        // 마커가 없으면 한 번 더 물어서, '지금 반영할 구체 계획'이 있으면 마커+JSON만 받아 이어붙인다. (단순 질문·조언이면 빈 응답 → 버튼 없음)
        // 응답이 '지금 반영할 계획 제안'처럼 보일 때만 2차 패스 실행 → 단순 질문·조언엔 로딩/버튼 안 뜨게.
        // (프롬프트가 계획 제안 시 "반영할까요?/버튼을 누르면…"으로 쓰게 하므로 그 신호 + 날짜가 있으면 계획으로 간주)
        const looksLikePlan = /반영할까요|반영하면|반영해도|추가할까요|추가하면|미룰까요|미루면|만들까요|정리할까요|버튼을 누르|이렇게 (반영|추가|정리|배치|진행)|\d{4}-\d{2}-\d{2}/.test(full);
        if (routineMode && looksLikePlan && !/%%%[A-Z_]+%%%/.test(full)) {
          controller.enqueue(encoder.encode('%%%PENDING%%%')); // 클라이언트: 2차 패스 동안 '반영 버튼 준비 중…' 로딩 표시
          try {
            const follow = await getClient().chat.completions.create({
              model: 'gpt-4o',
              temperature: 0,
              messages: [
                { role: 'system', content: systemContent },
                ...messages,
                { role: 'assistant', content: full },
                { role: 'user', content: '방금 네 답변이 지금 앱에 반영할 구체적 계획(새 업무 추가 / 프로젝트 미루기 / 기존 종료 등)을 담고 있다면, 설명은 하나도 쓰지 말고 %%%QUARTER_PLAN%%% 마커와 그 다음 줄에 JSON 배열만 출력해. 반영할 구체 계획이 없고 단순 질문·조언·잡담이면 아무것도 출력하지 마(완전히 빈 응답).' },
              ],
            });
            const extra = follow.choices[0]?.message?.content ?? '';
            if (/%%%QUARTER_PLAN%%%/.test(extra)) controller.enqueue(encoder.encode('\n\n' + extra.slice(extra.indexOf('%%%QUARTER_PLAN%%%'))));
          } catch { /* 2차 패스 실패해도 본문은 이미 전송됨 */ }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
