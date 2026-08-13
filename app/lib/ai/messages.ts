// 사용자에게 보이는 AI 카피 (시작 멘트/진행/완료 피드백/추천/빈화면) — SSOT
// ai-assistant.md 스크립트 기반.

// 기능별 시작 멘트
export const START_MESSAGES = {
  business: `🌱 새로운 여정을 시작해볼까요?\n\n아직 아이디어가 조금 흐릿해도 괜찮아요.\n머릿속에 떠오르는 생각들을 편하게 이야기해주세요.\n하나씩 함께 정리하면서 사업의 모습을 만들어볼게요.`,
  project: `이 길을 한 번에 오르기는 조금 벅찰 수도 있어요.\n몇 개의 작은 프로젝트로 나누면 훨씬 꾸준히 앞으로 갈 수 있어요.\n같이 가장 좋은 구조를 만들어볼까요?`,
  goal: `정상만 바라보면 멀게 느껴질 수 있어요.\n대신 이번 달, 이번 주, 오늘 해야 할 한 걸음부터 같이 정해볼까요?\n큰 목표를 작은 단계로 나누어드릴게요.`,
  routine: `목표를 이루는 사람들은 특별한 하루보다, 반복할 수 있는 하루를 만들더라고요.\n매번 계획을 새로 세우지 않아도 되도록, 우리만의 루틴을 만들어볼까요?`,
  schedule: `오늘은 평소와 조금 다른 하루네요. 괜찮아요.\n지금 상황에서도 가장 효율적으로 앞으로 갈 수 있는 방법을 같이 찾아볼게요.\n오늘 일정에 맞게 업무를 다시 정리해드릴게요.`,
};

// 진행 중 안내(스트리밍 전 placeholder 톤)
// 완료 후 피드백
export const FEEDBACK = {
  taskCreated: `🌿 오늘의 한 걸음을 준비했어요.\n이제 시작만 하면 됩니다.`,
  taskDone: `✨ 또 하나의 발걸음을 남겼어요.\n조금씩 정상에 가까워지고 있어요.`,
  goalAchieved: `🎉 이번 구간을 잘 올라왔어요.\n잠깐 뒤를 돌아보세요. 생각보다 멀리 와 있지 않나요?\n이제 다음 풍경을 향해 함께 가볼까요?`,
  scheduleChanged: `오늘 계획이 조금 바뀌었네요. 괜찮아요. 길은 하나만 있는 것이 아니니까요.\n지금 상황에 맞게 가장 좋은 경로를 다시 찾아드릴게요.`,

  // 구조화 데이터 반영 확인(안내자 톤)
  planUpdated: 'Plan에 살며시 정리해뒀어요. 마음에 안 드는 부분은 언제든 같이 다듬어요. 🌿',
  routineAdded: (count: number) => `반복 업무 ${count}개를 준비해뒀어요. 각 항목을 눌러 내용을 함께 다듬을 수 있어요.`,
  goalsUpdated: 'Goals에 반영해뒀어요. 천천히 확인해보세요.',
  quarterApplied: (quarters: number, programs: number) => `${quarters}개 분기에 프로그램 ${programs}개를 정리해뒀어요. Goals에서 확인해보세요. 🌿`,
  areaAssigned: (count: number) => `미분류 목표 ${count}개를 어울리는 업무 영역에 배정해뒀어요. Goals에서 확인해보세요. 🌿`,
};

export const AI_COPY = {
  emptyTitle: '함께 다음 한 걸음을',
  emptyBody: '사업 기획, 분기 목표, 오늘 일정까지\n편하게 이야기해주세요. 같이 정리해드릴게요.',
  placeholder: '편하게 이야기해주세요…',
  error: '앗, 잠시 길이 막혔네요. 잠깐 뒤에 다시 시도해볼까요?',
};

// 빈 채팅 화면에서 '어떤 대화를 나눌지' 고를 수 있는 시작 버튼 (전 화면 공통).
// label은 버튼 문구, message는 실제 전송되는 대화 시작 문구.
export interface StarterChip { label: string; message: string }
export const STARTERS: StarterChip[] = [
  { label: '🌱 새 기획안 만들기', message: '새로운 사업 기획안을 처음부터 같이 만들고 싶어요. 무엇부터 이야기하면 좋을까요?' },
  { label: '🗺️ 업무 계획·일정 짜기', message: '이번 분기 업무 계획과 일정을 같이 짜줘. 프로그램·데드라인·할일까지 정리해서 Goals에 반영할 수 있게 해줘.' },
  { label: '💰 자산·수익 계획 상의하기', message: '사업의 자금과 수익 구조를 상의하고 싶어요. 현실적인 수익 모델과 비용 관리 방법을 같이 정리해줘.' },
  { label: '🎯 타겟 고객 정하기', message: '제 사업의 타겟 고객 페르소나를 같이 만들어줘.' },
  { label: '🌿 오늘 일정 정리하기', message: '오늘 해야 할 일과 일정을 같이 정리하고 싶어요. 어떻게 진행하면 좋을까요?' },
];

// 화면별 추천 메시지(시작 칩). label은 버튼, message는 실제 전송 문구.
export interface RecommendedChip { label: string; message: string; }

export const RECOMMENDED: Record<string, RecommendedChip[]> = {
  '/plan': [
    { label: '🌱 사업 아이디어 구체화', message: '제 사업 아이디어를 같이 구체화하고 싶어요. 무엇부터 이야기하면 좋을까요?' },
    { label: '🎯 타겟 고객 만들기', message: '타겟 고객 페르소나를 같이 만들어줘.' },
    { label: '💡 수익 구조 제안', message: '현실적인 수익 구조를 제안해줘.' },
  ],
  '/programs': [
    { label: '🗺️ 이번 분기 계획 짜기', message: '이번 분기 실행 계획을 같이 짜줘. 프로그램·데드라인·할일까지 정리해서 Goals에 반영해줘.' },
    { label: '🔁 반복 루틴 만들기', message: '매주 반복하면 좋은 루틴 할일들을 요일까지 정해서 만들어줘.' },
  ],
  '/home': [
    { label: '🌿 오늘 일정 정리', message: '오늘 일정을 같이 정리하고 싶어요. 오늘의 업무를 어떻게 진행하면 좋을까요?' },
  ],
  default: [
    { label: '🌱 무엇을 도와드릴까요?', message: '오늘 무엇부터 같이 해볼까요?' },
  ],
};
