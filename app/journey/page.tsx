'use client';
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../lib/useStore';
import { workspaceColor } from '../lib/goalTasks';

const fmtMD = (iso?: string) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};
const rnd = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// 완수 노드 — 할일(별) · 데드라인(깃발) · 목표(깃발)가 시간순으로 길 위에 놓인다.
type TrailNode = { kind: 'task' | 'deadline' | 'goal'; date: string; name: string; num?: number };

// 🔧 샘플 미리보기 — 디자인 확인용. true면 샘플, false면 실제 내 완료 데이터로 지도 생성.
const PREVIEW = false;
const T = (d: string): TrailNode => ({ kind: 'task', date: d, name: `업무 (${d.slice(5)})` });
const SAMPLE_NODES: TrailNode[] = [
  T('2026-06-28'), T('2026-06-29'), T('2026-06-30'),
  { kind: 'deadline', date: '2026-07-01', name: '프로젝트 업데이트' },
  T('2026-07-02'), T('2026-07-03'), T('2026-07-04'), T('2026-07-05'),
  { kind: 'goal', date: '2026-07-06', name: '첫 런칭' },
  T('2026-07-07'), T('2026-07-09'),
  { kind: 'deadline', date: '2026-07-10', name: '뉴스레터 발송' },
  T('2026-07-11'), T('2026-07-12'), T('2026-07-13'), T('2026-07-14'), T('2026-07-15'),
  { kind: 'deadline', date: '2026-07-16', name: '베타 피드백 정리' },
  T('2026-07-17'), T('2026-07-19'), T('2026-07-20'),
  { kind: 'goal', date: '2026-07-22', name: '100명 달성' },
  T('2026-07-23'), T('2026-07-25'),
];

// 전역 스케일 — 길1~4(라인)·별·깃발에 동일 적용 → 모든 라인 두께 자동 일치.
const G = 1.3;
const START_X = 100; // 여정 시작 깃발이 놓이는 좌측 위치 (그 왼쪽엔 아무것도 없음)
const midY = 380;    // 길의 세로 중심 (상단 겹침 방지 이동은 아래에서 자동 계산)

export default function JourneyPage() {
  const store = useStore();
  const captureRef = useRef<HTMLDivElement>(null);
  const entries = store.allWorkspacesEntries;
  const [selWsId, setSelWsId] = useState<string>(entries[0]?.workspace.id ?? '');
  const [exporting, setExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewportH, setViewportH] = useState(0); // 세로 스크롤 없이 화면 높이에 맞춰 축소하기 위함

  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!store.ready) return null;

  const selEntry = entries.find(e => e.workspace.id === selWsId) ?? entries[0];
  const programs = selEntry?.programs ?? [];
  const realTodos = (dl: NonNullable<(typeof programs)[number]['deadlines']>[number]) =>
    (dl.todos ?? []).filter(t => !(t.days?.length));

  // 완수 노드 수집: 할일(별) · 데드라인(깃발) · 목표(깃발)
  const rawNodes: TrailNode[] = [];
  for (const p of programs) {
    const dls = p.deadlines ?? [];
    for (const dl of dls) {
      for (const t of realTodos(dl)) if (t.done && t.doneDate) rawNodes.push({ kind: 'task', date: t.doneDate, name: t.name });
      const rt = realTodos(dl);
      if (rt.length > 0 && rt.every(t => t.done)) {
        const doneD = rt.map(t => t.doneDate).filter(Boolean).sort() as string[];
        const todoD = rt.flatMap(t => [t.deadline, t.date]).filter(Boolean).sort() as string[];
        const d = doneD.slice(-1)[0] || dl.date || dl.startDate || todoD.slice(-1)[0] || '';
        rawNodes.push({ kind: 'deadline', date: d, name: dl.name });
      }
    }
    const goalDls = dls.filter(dl => realTodos(dl).length > 0);
    if (goalDls.length > 0 && goalDls.every(dl => realTodos(dl).every(t => t.done))) {
      const doneD = dls.flatMap(dl => realTodos(dl).map(t => t.doneDate)).filter(Boolean).sort() as string[];
      const dlD = dls.flatMap(dl => [dl.date, dl.startDate]).filter(Boolean).sort() as string[];
      const todoD = dls.flatMap(dl => realTodos(dl).flatMap(t => [t.deadline, t.date])).filter(Boolean).sort() as string[];
      const d = doneD.slice(-1)[0] || p.deadline || p.startDate || dlD.slice(-1)[0] || todoD.slice(-1)[0] || '';
      rawNodes.push({ kind: 'goal', date: d, name: p.name });
    }
  }
  rawNodes.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let goalNo = 0;
  const realNodes: TrailNode[] = rawNodes.map(n => (n.kind === 'goal' ? { ...n, num: ++goalNo } : n));

  const allNodes = PREVIEW ? SAMPLE_NODES : realNodes;
  // 여정 시작 목표 깃발 — 항상 맨 앞. 날짜 = 이 비즈니스의 플랜을 가장 먼저 등록한 날(가장 이른 startDate).
  const planDates = programs.flatMap(p => [p.startDate, p.deadline, ...(p.deadlines ?? []).map(dl => dl.date)]).filter(Boolean) as string[];
  const startDate = PREVIEW ? '2026-06-20' : (planDates.sort()[0] ?? '');
  const startGoal: TrailNode = { kind: 'goal', date: startDate, name: '여정 시작' };
  // 별은 반드시 깃발과 함께 → 목표/데드라인만 경로 위에. 목표 번호는 순서대로 재부여(여정 시작=0001).
  let goalCnt = 0;
  const milestones: TrailNode[] = [startGoal, ...allNodes.filter(n => n.kind !== 'task')]
    .map(n => (n.kind === 'goal' ? { ...n, num: ++goalCnt } : n))
    .map(n => (n.date ? n : { ...n, date: startDate })); // 날짜가 전혀 없으면 여정 시작일로 채움
  const taskNodes = allNodes.filter(n => n.kind === 'task');
  const taskCount = taskNodes.length;

  // 깃발 스펙 (원본 파일 viewBox + 밑동 별 중심 비율). sx/sy=별 중심, dx/dy=날짜(상단 다이아몬드 오른쪽), tx/ty=타이틀(좌측 바 하단 오른쪽).
  const flagSpec = (kind: 'goal' | 'deadline') => kind === 'goal'
    ? { src: '/flag-goal.svg', W: 208 * G, H: 167 * G, sx: 29 / 208, sy: 138 / 167, dx: 45 / 208, dy: 10 / 167, tx: 40 / 208, bb: 97.6 / 167, dfs: 13 * G * 1.1, tfs: 12 * G * 0.8 }
    : { src: '/flag-deadline.svg', W: 109 * G, H: 87 * G, sx: 13 / 109, sy: 74 / 87, dx: 23 / 109, dy: 5.4 / 87, bb: 51.3 / 87, tx: 20 / 109, dfs: 13 * G * 0.9, tfs: 12 * G * 0.8 };

  // 길 — 주신 '연결 법칙'(바깥방향이 반대인 꼭짓점끼리 연결 = 접선 연속) 그대로.
  // 각 길: entry=좌 꼭짓점, exit=우 꼭짓점 (px). exit = entry + Δ.
  // viewBox에 4단위 여백을 줬으므로(round cap 잘림 방지) 좌표는 +4, 크기는 +8.
  const RD = {
    road1: { src: '/road1.svg', W: 80 * G, H: 79 * G, entry: [6.5 * G, 74.5 * G], exit: [75.5 * G, 6.5 * G] },  // 우 바깥→ (오름)
    road2: { src: '/road2.svg', W: 80 * G, H: 79 * G, entry: [4 * G, 6.5 * G], exit: [73 * G, 74.5 * G] },      // 좌 바깥← (내림)
    road3: { src: '/road3.svg', W: 78 * G, H: 77 * G, entry: [6.5 * G, 4 * G], exit: [73.5 * G, 70 * G] },      // 우 바깥→ (내림)
    road4: { src: '/road4.svg', W: 77 * G, H: 77 * G, entry: [4 * G, 70 * G], exit: [70 * G, 4 * G] },          // 좌 바깥← (오름)
  } as const;
  const tiles: { src: string; left: number; top: number; w: number; h: number }[] = [];
  const flagPos: { x: number; y: number; node: TrailNode }[] = [];
  const SWING = 134 * G; // 브리지 1개의 세로 변화량
  const OV = 1.5;        // 길↔별팔 겹침(px) — butt cap 맞댐에서 생기는 1px seam 방지
  // per-map 시드 — 비즈니스마다 길 모양(방향·개수·업무 위치)이 달라지게
  const seed0 = ((selEntry?.workspace.id ?? '').split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 3), 11) % 991) + 0.137;
  // 여정 시작 깃발 = 항상 좌측 START_X. 그 왼쪽엔 길·업무 아무것도 없음(리드 길 없음).
  const firstArmL = milestones[0].kind === 'goal' ? 29 * G : 13 * G;
  let penX = START_X - firstArmL + OV, penY = midY;
  const putTile = (key: keyof typeof RD) => {
    const r = RD[key];
    const left = penX - r.entry[0], top = penY - r.entry[1];
    tiles.push({ src: r.src, left, top, w: r.W, h: r.H });
    penX = left + r.exit[0]; penY = top + r.exit[1];
  };
  // 브리지: 별 우 → (상승 길4→길1 / 하강 길2→길3) → 다음 별 좌.
  // 런(run) 방식: 한 방향으로 1~N칸을 랜덤 길이로 이어 붙인 뒤 방향 전환 → 길이가 제각각인 언덕(비규칙).
  // 다음 길을 '랜덤하게' 이어붙임: 방향을 시드 랜덤(+화면 밖으로 안 나가게 중앙 복귀 편향)으로 정하고,
  // 같은 방향으로 1~RUN_MAX칸 랜덤 길이만큼 이어붙임 → 규칙적 지그재그가 아니라 유기적 굴곡. (그래픽 원본 그대로)
  const RUN_MAX = 1;                 // 진폭 = RUN_MAX·SWING. 1=원래 크기(봉우리 높이 균일, 방향은 랜덤). 크게 할수록 높낮이 다양↑·지도↓
  const BAND = RUN_MAX * SWING;
  let runDir: 'up' | 'down' = rnd(seed0 + 3.3) < 0.5 ? 'up' : 'down';
  let runLeft = 0;
  const bridge = (seed: number) => {
    if (runLeft <= 0) {
      if (penY <= midY - BAND + 4) runDir = 'down';            // 위 끝 → 하강
      else if (penY >= midY + BAND - 4) runDir = 'up';         // 아래 끝 → 상승
      else {
        const bias = (penY - midY) / BAND;                    // 중앙보다 아래면 up 확률↑ (경계 밖 방지)
        runDir = rnd(seed0 + seed) < 0.5 + bias * 0.5 ? 'up' : 'down';
      }
      const room = runDir === 'up'
        ? Math.round((penY - (midY - BAND)) / SWING)
        : Math.round(((midY + BAND) - penY) / SWING);
      runLeft = Math.max(1, Math.min(1 + Math.floor(rnd(seed0 + seed * 1.7 + 5) * RUN_MAX), room || 1));
    }
    if (runDir === 'up') { putTile('road4'); putTile('road1'); }
    else { putTile('road2'); putTile('road3'); }
    runLeft--;
  };
  for (let mi = 0; mi < milestones.length; mi++) {
    // 깃발(별 내장) — 들어온 길(우)=별 좌팔, 나갈 길(좌)=별 우팔. 가로 팔: 데드라인 13G, 목표 좌29G·우27G.
    const armL = milestones[mi].kind === 'goal' ? 29 * G : 13 * G;
    const armR = milestones[mi].kind === 'goal' ? 27 * G : 13 * G;
    flagPos.push({ x: penX + armL - OV, y: penY, node: milestones[mi] });
    penX += armL + armR - 2 * OV;
    // 다음 깃발까지 1~3개의 브리지(불규칙) → 자유로운 간격·높이
    if (mi < milestones.length - 1) {
      const nb = 1 + Math.floor(rnd(seed0 + mi * 5.1 + 7) * 3);
      for (let b = 0; b < nb; b++) bridge(mi * 13.7 + b * 4.3 + 2);
    }
  }
  // 업무 수용: 길 2개당 업무 5개(=2.5/길) → 넘치면 길을 더 생성. (빈 꼬리 길은 아래에서 트림)
  let extra = 100;
  while (tiles.length * 2.5 < taskCount) { const nb = 1 + Math.floor(rnd(seed0 + extra) * 3); for (let b = 0; b < nb; b++) bridge(extra + b); extra += 5; }

  // 목표/데드라인 깃발 박스(장애물) — 업무 깃발이 이걸 피해 배치.
  const flagBoxes = flagPos.map(f => { const sp = flagSpec(f.node.kind as 'goal' | 'deadline'); return { left: f.x - sp.sx * sp.W, top: f.y - sp.sy * sp.H, w: sp.W, h: sp.H }; });

  // 업무 깃발 — 길당 최대 3개, 길과 ≥50px, 양옆(위/아래) 자유 산포. 전체 길에 고르게(라운드로빈) → 자연스러운 분포.
  // 서로·목표깃발과 겹치지 않게 재시도.
  const TW = 18 * G, TH = (TW * 28) / 18, poleFrac = 7.5 / 18;
  const PAD = 6;
  const taskFlags: { left: number; top: number; name: string }[] = [];
  const overlaps = (l: number, t: number, r: { left: number; top: number; w: number; h: number }) =>
    l < r.left + r.w + PAD && l + TW + PAD > r.left && t < r.top + r.h + PAD && t + TH + PAD > r.top;
  const hits = (l: number, t: number) =>
    taskFlags.some(f => overlaps(l, t, { left: f.left, top: f.top, w: TW, h: TH })) ||
    flagBoxes.some(o => overlaps(l, t, o));
  for (let k = 0; k < taskCount; k++) {
    const t = tiles[k % tiles.length]; // 전체 길에 고르게 분산
    let best = { left: 0, top: 0 };
    for (let a = 0; a < 44; a++) {
      const above = rnd(seed0 + k * 1.7 + 2 + a * 11.3) < 0.5;
      const bx = t.left + (0.05 + rnd(seed0 + k * 2.3 + 1 + a * 7.7) * 0.9) * t.w;
      const gap = 50 + rnd(seed0 + k * 3.1 + 4 + a * 5.1) * 30;    // 길과 50~80px
      const by = above ? t.top - gap : t.top + t.h + gap + TH;     // 밑동(별) y
      best = { left: bx - poleFrac * TW, top: by - TH };
      if (!hits(best.left, best.top)) break;
    }
    taskFlags.push({ ...best, name: taskNodes[k]?.name || '완료한 업무' });
  }

  // 콘텐츠(마지막 깃발/업무) 이후로 빈 길이 삐져나오지 않게, 그 뒤의 길 타일 제거.
  const contentR = Math.max(
    START_X,
    ...flagPos.map(f => { const sp = flagSpec(f.node.kind as 'goal' | 'deadline'); return f.x + (1 - sp.sx) * sp.W; }),
    ...taskFlags.map(f => f.left + TW),
  );
  const kept = tiles.filter(t => t.left <= contentR + 8);
  if (kept.length !== tiles.length) { tiles.length = 0; tiles.push(...kept); }

  // 모든 지도가 '동일한' 세로 레이아웃/축소율을 갖도록, 실제 콘텐츠가 아니라 이론상 고정 범위로 계산.
  // (walk는 midY±BAND 범위에서 움직이고, 그 바깥으로 깃발/업무가 최대 VMARGIN까지 나감)
  const TOP_MARGIN = 104; // 상단 바(로고·버튼) 아래 여백
  const VMARGIN = 210;    // 최고/최저 지점 위·아래 콘텐츠(깃발·업무) 최대 여유
  const shift = TOP_MARGIN - ((midY - BAND) - VMARGIN); // 최상단 지점을 TOP_MARGIN에 고정 (지도마다 동일)
  for (const t of tiles) t.top += shift;
  for (const f of flagPos) f.y += shift;
  for (const f of taskFlags) f.top += shift;
  const innerH = 2 * BAND + 2 * VMARGIN + TOP_MARGIN + 32; // 고정값 → 모든 지도 동일 높이·축소율
  // 화면 높이에 맞춰 축소(세로 스크롤 없이 전체가 보이게). 캡처는 원본 크기 유지 → 추출 화질 그대로.
  const scale = viewportH > 0 ? Math.min(1, viewportH / innerH) : 1;

  // 좌우 마진 대칭 — 오른쪽 마진 = 왼쪽 첫 깃발 앞 마진. 마지막 깃발/라벨이 잘리지 않게 실제 콘텐츠 최우측 기준.
  const estW = (s: string, fs: number) => (s?.length ?? 0) * fs * 0.62; // 대략적 텍스트 폭
  let minLeft = Infinity, maxRight = -Infinity;
  for (const t of tiles) { minLeft = Math.min(minLeft, t.left); maxRight = Math.max(maxRight, t.left + t.w); }
  for (const f of flagPos) {
    const sp = flagSpec(f.node.kind as 'goal' | 'deadline');
    const fl = f.x - sp.sx * sp.W;
    minLeft = Math.min(minLeft, fl);
    maxRight = Math.max(maxRight, f.x + (1 - sp.sx) * sp.W, fl + sp.tx * sp.W + estW(f.node.name, sp.tfs), fl + sp.dx * sp.W + estW(fmtMD(f.node.date), sp.dfs));
  }
  for (const f of taskFlags) { minLeft = Math.min(minLeft, f.left); maxRight = Math.max(maxRight, f.left + TW); }
  const leftMargin = Number.isFinite(minLeft) ? Math.max(0, minLeft) : START_X;
  const trailW = Math.max(maxRight + leftMargin, 1200);

  // 배경 그래픽 타일 — 트레일 높이에 맞춰(비율 유지) 가로로 이어붙임. 길이가 넘치면 좌우반전으로 연장.
  const BG_H = innerH;
  const BG_W = (innerH * 1280) / 733; // journey-bg.svg viewBox 1280×733
  const bgCount = Math.ceil(trailW / BG_W) + 1;

  // 미리보기 이미지 생성 (다운로드는 팝업에서). skipFonts=true → 외부 폰트 CSS(CORS) 읽기 에러 방지.
  const generatePreview = async () => {
    if (!captureRef.current) return;
    setExporting(true);
    // 추출 전용 배경 타일이 DOM에 그려질 때까지 대기 (exporting=true → 다음 페인트)
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    try {
      const { toPng } = await import('html-to-image');
      // 폰트 CSS를 직접 가져와 그 안의 woff2 url()을 전부 base64 data URI로 인라인 → fontEmbedCSS로 전달.
      // (문서 스타일시트를 안 읽어 CORS(cssRules) 에러 차단 + SVG 이미지에서도 폰트가 실제 적용됨)
      const SUIT_BASE = 'https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/';
      const toDataUri = async (url: string): Promise<string> => {
        try {
          const buf = await fetch(url).then(r => r.arrayBuffer());
          const blob = new Blob([buf], { type: 'font/woff2' });
          return await new Promise<string>(resolve => {
            const fr = new FileReader();
            fr.onloadend = () => resolve(fr.result as string);
            fr.onerror = () => resolve(url);
            fr.readAsDataURL(blob);
          });
        } catch { return url; }
      };
      const inlineFonts = async (css: string): Promise<string> => {
        const re = /url\((['"]?)([^'")]+)\1\)/g;
        const urls = Array.from(new Set(Array.from(css.matchAll(re), m => m[2]))).filter(u => /^https?:/.test(u));
        const map = new Map<string, string>();
        await Promise.all(urls.map(async u => { map.set(u, await toDataUri(u)); }));
        return css.replace(re, (_m, _q, u) => `url(${map.get(u) ?? u})`);
      };
      const [gCss, sCssRaw] = await Promise.all([
        fetch('https://fonts.googleapis.com/css2?family=Tomorrow:wght@500;600;700&display=swap').then(r => (r.ok ? r.text() : '')).catch(() => ''),
        fetch(`${SUIT_BASE}SUIT-Variable.css`).then(r => (r.ok ? r.text() : '')).catch(() => ''),
      ]);
      const sCss = sCssRaw.replace(/url\((['"]?)\.\//g, `url($1${SUIT_BASE}`);
      const fontEmbedCSS = await inlineFonts(`${gCss}\n${sCss}`);
      // 길이가 길어도 오른쪽이 잘리지 않게 캔버스 최대치(≈16000px) 안에서 배율 조정 + 정확히 트레일 크기로 캡처
      const ratio = Math.max(1, Math.min(2, 16000 / trailW));
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: ratio, backgroundColor: '#9DFE3B', cacheBust: true, fontEmbedCSS,
        width: trailW, height: innerH, canvasWidth: Math.round(trailW * ratio), canvasHeight: Math.round(innerH * ratio),
      });
      setPreviewUrl(dataUrl);
    } catch (e) {
      console.error('export failed', e);
    } finally {
      setExporting(false);
    }
  };

  const downloadImage = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `spira-여정지도-${selEntry?.workspace.name ?? ''}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor: '#9DFE3B' }}>
      {/* 페이지 공통 고정 배경 — 지도 데이터와 무관하게 모든 페이지에서 동일 (뷰포트 폭 기준) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/journey-bg.svg" alt="" aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-auto pointer-events-none select-none z-0" />

      {/* 상단 바 — 로고 + 워크스페이스 필터 (뒤로가기 제거, 추출은 하단 버튼으로) */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2.5 px-4 sm:px-6 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Spira" className="w-7 h-auto flex-shrink-0" />
        <div className="flex items-center gap-2 overflow-x-auto min-w-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {entries.map(e => {
            const sel = e.workspace.id === selEntry?.workspace.id;
            return (
              <button key={e.workspace.id} onClick={() => setSelWsId(e.workspace.id)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors flex-shrink-0"
                style={sel ? { backgroundColor: '#002929', color: '#EDFF9F' } : { backgroundColor: 'rgba(255,255,255,0.55)', color: '#16211E' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: workspaceColor(entries, e.workspace.id) }} />
                {e.workspace.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 이미지로 추출 — 하단 중앙 플로팅 버튼 */}
      <button onClick={generatePreview} disabled={exporting}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 px-6 py-2.5 rounded-full text-[13px] font-semibold shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        style={{ backgroundColor: '#002929', color: '#EDFF9F' }}>
        {exporting ? '이미지 만드는 중…' : '이미지로 추출'}
      </button>

      {/* 가로 스크롤만 — 세로는 화면 높이에 맞춰 축소(스크롤 없음). 배경은 뒤(고정)가 비치도록 투명 */}
      <div className="absolute inset-0 overflow-x-auto overflow-y-hidden z-10">
        {/* 축소된 발자국(스크롤 영역) */}
        <div style={{ position: 'relative', width: trailW * scale, height: innerH * scale, minWidth: '100%' }}>
          {/* 시각적 축소 — captureRef 자체는 원본 크기(추출 화질 유지) */}
          <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <div ref={captureRef} className="relative" style={{ width: trailW, height: innerH }}>
          {/* 배경 그래픽 — 추출 이미지에만 포함(화면은 위의 고정 배경 사용). 길면 좌우반전 타일로 연장 */}
          {exporting && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0" style={{ backgroundColor: '#9DFE3B' }}>
            {Array.from({ length: bgCount }).map((_, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`bg-${i}`} src="/journey-bg.svg" alt="" aria-hidden
                style={{ position: 'absolute', top: 0, left: i * BG_W, width: BG_W, height: BG_H, transform: i % 2 ? 'scaleX(-1)' : undefined }} />
            ))}
          </div>
          )}

          {/* 길 — 길1~4 원본 조각을 끝점끼리 이어 붙임. round cap(여백 있는 viewBox)이 이웃과 겹쳐 seam 제거 */}
          {tiles.map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`road-${i}`} src={t.src} alt="" aria-hidden className="absolute pointer-events-none select-none z-[1]"
              style={{ left: t.left, top: t.top, width: t.w, height: t.h }} />
          ))}

          {/* 업무 깃발 — 길 양옆 랜덤 산포 (길과 ≥50px, 길당 3개). 호버 시 업무명 툴팁 */}
          {taskFlags.map((f, i) => (
            <div key={`task-${i}`} className="group absolute z-[2]" style={{ left: f.left, top: f.top, width: TW, height: TH }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/flag-task.svg" alt="" aria-hidden className="w-full h-full select-none" />
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-30 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-semibold shadow-lg"
                style={{ backgroundColor: '#002929', color: '#EDFF9F' }}>
                {f.name}
                <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #002929' }} />
              </div>
            </div>
          ))}

          {/* 목표/데드라인 깃발 (별 내장) — 밑동 별 좌·우 팔 끝에 길이 닿음 */}
          {flagPos.map(({ x, y, node: n }, i) => {
            const sp = flagSpec(n.kind as 'goal' | 'deadline');
            const flagLeft = x - sp.sx * sp.W;
            const flagTop = y - sp.sy * sp.H;
            return (
              <div key={`m-${i}`} className="absolute z-[3]" style={{ left: 0, top: 0 }}>
                <div className="absolute" style={{ left: flagLeft, top: flagTop, width: sp.W, height: sp.H }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sp.src} alt="" aria-hidden className="absolute inset-0 w-full h-full select-none" />
                  {n.kind === 'goal' && (
                    <span className="absolute -translate-x-1/2 -translate-y-1/2 leading-none"
                      style={{ left: '40.9%', top: '37.1%', fontFamily: 'Tomorrow, sans-serif', fontWeight: 700, fontSize: sp.W * 0.135, letterSpacing: 1, color: '#002929' }}>
                      {String(n.num ?? 1).padStart(4, '0')}
                    </span>
                  )}
                </div>
                {/* 날짜 — 상단 다이아몬드 오른쪽 */}
                {n.date && (
                  <span className="absolute -translate-y-1/2 whitespace-nowrap font-bold leading-none" style={{ left: flagLeft + sp.dx * sp.W, top: flagTop + sp.dy * sp.H, fontFamily: 'Tomorrow, sans-serif', fontSize: sp.dfs, color: '#002929' }}>{fmtMD(n.date)}</span>
                )}
                {/* 타이틀 — 깃(배너) 하단에서 8px 아래 */}
                {n.name && (
                  <span className="absolute whitespace-nowrap font-semibold" style={{ left: flagLeft + sp.tx * sp.W, top: flagTop + sp.bb * sp.H + 8, fontSize: sp.tfs, color: '#002929' }}>{n.name}</span>
                )}
              </div>
            );
          })}

          {allNodes.length === 0 && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-[16px] font-bold mb-1" style={{ color: '#16211E' }}>아직 여정이 시작되지 않았어요</p>
              <p className="text-[13px]" style={{ color: '#2C4A16' }}>업무를 완수하면 길 위에 별과 깃발이 하나씩 꽂혀요.</p>
            </div>
          )}
        </div>
          </div>
        </div>
      </div>

      {/* 미리보기 팝업 — 이미지 확인 후 다운로드 */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setPreviewUrl(null)}>
          <div className="bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden max-w-[90vw] max-h-[90vh] flex flex-col" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[14px] font-bold" style={{ color: '#16211E' }}>여정 지도 미리보기</span>
              <button onClick={() => setPreviewUrl(null)} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/40" style={{ color: '#16211E' }} aria-label="닫기">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className="px-4 overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="여정 지도" className="max-w-full h-auto rounded-xl" style={{ maxHeight: '68vh' }} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5">
              <button onClick={() => setPreviewUrl(null)} className="px-4 py-2 rounded-full text-[13px] font-semibold transition-colors hover:bg-neutral-100" style={{ color: '#5B6560' }}>닫기</button>
              <button onClick={downloadImage} className="px-4 py-2 rounded-full text-[13px] font-semibold transition-transform hover:-translate-y-0.5" style={{ backgroundColor: '#002929', color: '#EDFF9F' }}>이미지 다운로드</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
