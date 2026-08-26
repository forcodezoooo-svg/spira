'use client';
import { useState, useRef, useEffect } from 'react';
import { useTimer } from '../lib/TimerContext';
import { useStore } from '../lib/useStore';

export function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

interface SpotifyTrack {
  name: string;
  artist: string;
  albumArt: string;
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (data: unknown) => void) => void;
  togglePlay: () => Promise<void>;
  resume: () => Promise<void>;
  pause: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
}

declare global {
  interface Window {
    Spotify: {
      Player: new (config: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([^&\s?]+)/);
  return m?.[1] ?? null;
}

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FOCUS_ID = '__focus__';

export default function MusicTimer({ compact = false, tile = false }: { compact?: boolean; tile?: boolean }) {
  const { stopAll, anyActive, activeTaskIds, toggleTaskTimer, getDayTotalSeconds } = useTimer();
  const store = useStore();
  // 상단 버튼: 진행 중인 타이머가 있으면 전체 정지, 없으면 '일반 작업 세션' 시작.
  const isRunning = anyActive;
  const onToggle = () => { if (anyActive) stopAll(); else toggleTaskTimer(FOCUS_ID); };
  // 상단 박스 시간 = 오늘 작업 시간(벽시계). 업무가 안 돌면 증가 멈춤.
  const totalToday = getDayTotalSeconds(localDateStr());

  // 지금 타이머가 걸린 실제 업무 (__focus__ 일반 세션은 제외) — 이름 + (있으면) 상세업무(units)
  type RunningTask = { name: string; wsId?: string; programId?: string; deadlineId?: string; todoId?: string; subtaskId?: string; units?: { id: string; name: string; done: boolean }[] };
  const runningTask: RunningTask | null = (() => {
    if (!store.ready) return null;
    for (const id of activeTaskIds) {
      if (id === FOCUS_ID) continue;
      if (id.startsWith('quick:')) {
        const qid = id.slice(6);
        for (const e of store.allWorkspacesEntries) {
          const q = (e.quickTasks ?? []).find(x => x.id === qid);
          if (q) return { name: q.name };
        }
        return { name: '추가 업무' };
      }
      // 업무(subtask) 타이머: 's:wsId:programId:deadlineId:todoId:subtaskId'
      if (id.startsWith('s:')) {
        const [, wsId, pId, dlId, todoId, subtaskId] = id.split(':');
        const e = store.allWorkspacesEntries.find(x => x.workspace.id === wsId);
        if (e) for (const p of e.programs) for (const dl of p.deadlines ?? []) {
          const t = (dl.todos ?? []).find(x => x.id === todoId);
          const s = t?.subtasks?.find(x => x.id === subtaskId);
          if (s) return { name: s.name, wsId, programId: pId, deadlineId: dlId, todoId, subtaskId, units: s.units ?? [] };
        }
        return { name: '업무' };
      }
      // 산출물(todo) 타이머: 'wsId:programId:deadlineId:todoId'
      const parts = id.split(':');
      if (parts.length === 4) {
        const [wsId, , , todoId] = parts;
        const e = store.allWorkspacesEntries.find(x => x.workspace.id === wsId);
        if (e) for (const p of e.programs) for (const dl of p.deadlines ?? []) {
          const t = (dl.todos ?? []).find(x => x.id === todoId);
          if (t) return { name: t.name };
        }
        return { name: '업무' };
      }
    }
    return null;
  })();
  const runningTaskName = runningTask?.name ?? null;
  const units = runningTask?.units ?? [];
  const curUnit = units.find(u => !u.done) ?? null; // 현재(첫 미완료) 상세업무
  const doneUnitCount = units.filter(u => u.done).length;
  // 현재 상세업무 완료 → 다음으로 넘어감 (재렌더 시 curUnit이 다음 미완료로 갱신)
  const completeCurUnit = () => {
    if (!runningTask?.subtaskId || !curUnit) return;
    store.updateProgramSubtask(runningTask.wsId!, runningTask.programId!, runningTask.deadlineId!, runningTask.todoId!, runningTask.subtaskId, { units: units.map(u => u.id === curUnit.id ? { ...u, done: true } : u) });
  };
  // 플레이바에 뜨는 '현재 상세업무 + 완료(다음으로)' 요소
  const unitBar = curUnit ? (
    <button onClick={completeCurUnit} title="이 상세업무 완료하고 다음으로 넘어가기"
      className="group flex items-center gap-1.5 min-w-0 rounded-full pl-1 pr-2 py-0.5 transition-colors hover:brightness-95" style={{ backgroundColor: '#F3F0FF' }}>
      <span className="w-4 h-4 rounded-full border-[1.5px] flex-shrink-0 flex items-center justify-center transition-colors group-hover:bg-[#7C3AED]" style={{ borderColor: '#7C3AED' }}>
        <svg className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#7C3AED" className="group-hover:stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="text-[11px] font-semibold truncate" style={{ color: '#5B3FC4' }}>{curUnit.name}</span>
      {units.length > 1 && <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: '#9B8FD1' }}>{doneUnitCount}/{units.length}</span>}
    </button>
  ) : null;

  // 타이머 실행 중 브라우저 탭 타이틀에 시간 표시
  useEffect(() => {
    if (anyActive) {
      document.title = `⏱ ${formatSeconds(totalToday)} — Spira`;
    } else {
      document.title = 'Spira';
    }
  }, [anyActive, totalToday]);

  // 컴포넌트 언마운트 시 타이틀 복원
  useEffect(() => () => { document.title = 'Spira'; }, []);

  const [urlInput, setUrlInput] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [showEmbed, setShowEmbed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Spotify state
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [spotifyTrack, setSpotifyTrack] = useState<SpotifyTrack | null>(null);
  const [spotifyPaused, setSpotifyPaused] = useState(true);
  const playerRef = useRef<SpotifyPlayer | null>(null);

  const isYouTube = activeUrl.includes('youtube') || activeUrl.includes('youtu.be');
  const ytId = isYouTube ? extractYouTubeId(activeUrl) : null;
  const isDirectAudio = activeUrl && !isYouTube;

  // Sync audio element with isRunning
  useEffect(() => {
    if (!audioRef.current) return;
    if (isRunning) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isRunning]);

  // Sync Spotify with isRunning
  useEffect(() => {
    if (!playerRef.current || !spotifyToken) return;
    if (isRunning && spotifyPaused) {
      playerRef.current.resume().catch(() => playerRef.current?.togglePlay());
    } else if (!isRunning && !spotifyPaused) {
      playerRef.current.pause().catch(() => playerRef.current?.togglePlay());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  // Check Spotify token on mount (also handle OAuth callback redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spReady = params.get('sp_ready');

    const load = async () => {
      if (spReady) {
        // Exchange the key for cookies, then clean up the URL
        await fetch(`/api/spotify/activate?key=${spReady}`).catch(() => {});
        const url = new URL(window.location.href);
        url.searchParams.delete('sp_ready');
        window.history.replaceState({}, '', url.toString());
      }
      const res = await fetch('/api/spotify/token').catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        if (data?.token) setSpotifyToken(data.token);
      }
    };

    load();
  }, []);

  // Load Spotify Web Playback SDK
  useEffect(() => {
    if (!spotifyToken) return;

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Spira',
        getOAuthToken: (cb) => cb(spotifyToken),
        volume: 0.5,
      });

      player.addListener('player_state_changed', (state) => {
        const s = state as {
          paused: boolean;
          track_window: { current_track: { name: string; artists: { name: string }[]; album: { images: { url: string }[] } } };
        } | null;
        if (!s) return;
        setSpotifyPaused(s.paused);
        setSpotifyTrack({
          name: s.track_window.current_track.name,
          artist: s.track_window.current_track.artists[0].name,
          albumArt: s.track_window.current_track.album.images[0]?.url ?? '',
        });
      });

      player.connect();
      playerRef.current = player;
    };

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    const handleUnload = () => playerRef.current?.disconnect();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      playerRef.current?.disconnect();
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [spotifyToken]);

  const handleLoad = () => {
    const url = urlInput.trim();
    if (!url) return;
    setActiveUrl(url);
    setShowEmbed(true);
    setUrlInput('');
  };

  const handleSpotifyToggle = () => {
    playerRef.current?.togglePlay();
  };

  // ── 컴팩트 pill (홈 우측 대시보드용) ─────────────────────────────────────────
  if (tile) {
    return (
      <div className="relative h-full">
        <div className="flex flex-col justify-between h-full bg-white border border-neutral-200 rounded-2xl p-3.5" style={{ boxShadow: 'var(--spira-shadow)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${isRunning ? 'bg-violet-600 hover:bg-violet-500' : 'bg-neutral-100 hover:bg-neutral-200 border border-neutral-300'}`}
            >
              {isRunning ? (
                <svg className="w-4 h-4 text-neutral-900" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
              ) : (
                <svg className="w-4 h-4 text-neutral-900 ml-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5l10 5.5-10 5.5V2.5z" /></svg>
              )}
            </button>
            <span className="text-[13px] font-bold" style={{ color: '#16211E' }}>타이머</span>
            <button onClick={() => setExpanded(e => !e)} className="ml-auto flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 transition-colors flex-shrink-0" title="음악 · Spotify">
              <span className={`w-1.5 h-1.5 rounded-full ${spotifyToken ? 'bg-green-500' : 'bg-neutral-300'}`} />음악
            </button>
          </div>
          <div className="mt-2">
            <p className={`text-[22px] font-mono font-black tabular-nums tracking-tight leading-none ${anyActive ? 'text-neutral-900' : 'text-neutral-400'}`}>{formatSeconds(totalToday)}</p>
            <p className="text-[10px] font-medium mt-1 truncate" style={{ color: runningTaskName ? '#44543C' : '#9AA39D' }}>{runningTaskName ? `▶ ${runningTaskName}` : '오늘 작업 시간'}</p>
            {unitBar && <div className="mt-1.5 flex">{unitBar}</div>}
          </div>
        </div>

        {expanded && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-neutral-200 rounded-2xl shadow-lg p-3 z-30 space-y-3">
            <div className="flex gap-1.5 items-center">
              <svg className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" viewBox="0 0 16 16" fill="none"><path d="M6 12V4l8-2v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" /><circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="1.2" /></svg>
              <input className="flex-1 bg-neutral-100 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 placeholder-neutral-400 outline-none focus:border-violet-500 transition-colors" placeholder="YouTube / MP3 URL" value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLoad()} />
              <button onClick={handleLoad} disabled={!urlInput.trim()} className="text-xs text-neutral-600 hover:text-neutral-500 disabled:opacity-30 transition-colors">설정</button>
              {activeUrl && <button onClick={() => setShowEmbed(s => !s)} className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">{showEmbed ? '닫기' : '열기'}</button>}
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">음악·Spotify 설정은 상단 바에서도 열 수 있어요.</p>
          </div>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="relative">
        <div className="flex items-center gap-3 bg-white border border-neutral-200 rounded-full pl-2 pr-4 py-1.5 shadow-sm">
          <button
            onClick={onToggle}
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              isRunning ? 'bg-violet-600 hover:bg-violet-500' : 'bg-neutral-100 hover:bg-neutral-200 border border-neutral-300'
            }`}
          >
            {isRunning ? (
              <svg className="w-4 h-4 text-neutral-900" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="3.5" height="12" rx="1" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-neutral-900 ml-0.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.5l10 5.5-10 5.5V2.5z" />
              </svg>
            )}
          </button>
          <div className="flex-shrink-0 leading-none">
            <p className={`text-lg font-mono font-black tabular-nums tracking-tight ${anyActive ? 'text-neutral-900' : 'text-neutral-400'}`}>
              {formatSeconds(totalToday)}
            </p>
            <p className="text-[9px] font-medium mt-0.5 truncate max-w-[150px]" style={{ color: runningTaskName ? '#44543C' : '#9AA39D' }}>
              {runningTaskName ? `▶ ${runningTaskName}` : '오늘 작업 시간'}
            </p>
          </div>
          {unitBar && <div className="max-w-[200px] min-w-0 ml-1">{unitBar}</div>}
          <div className="flex-1" />
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-800 transition-colors flex-shrink-0"
            title="음악 · Spotify"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${spotifyToken ? 'bg-green-500' : 'bg-neutral-300'}`} />
            {spotifyToken ? 'Spotify 연결됨' : '음악'}
            <svg className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {expanded && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-neutral-200 rounded-2xl shadow-lg p-3 z-30 space-y-3">
            {/* 음악 URL 입력 */}
            <div className="flex gap-1.5 items-center">
              <svg className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" viewBox="0 0 16 16" fill="none">
                <path d="M6 12V4l8-2v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <input
                className="flex-1 bg-neutral-100 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 placeholder-neutral-400 outline-none focus:border-violet-500 transition-colors"
                placeholder="YouTube / MP3 URL"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoad()}
              />
              <button onClick={handleLoad} disabled={!urlInput.trim()} className="text-xs text-neutral-600 hover:text-neutral-500 disabled:opacity-30 transition-colors">설정</button>
              {activeUrl && (
                <button onClick={() => setShowEmbed(s => !s)} className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">{showEmbed ? '닫기' : '열기'}</button>
              )}
            </div>

            {/* Spotify */}
            <div className="flex items-center gap-3 border-t border-neutral-100 pt-3">
              {spotifyToken ? (
                spotifyTrack ? (
                  <>
                    {spotifyTrack.albumArt && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={spotifyTrack.albumArt} alt="album" className="w-8 h-8 rounded flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-neutral-800 truncate">{spotifyTrack.name}</p>
                      <p className="text-[10px] text-neutral-500 truncate">{spotifyTrack.artist}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => playerRef.current?.previousTrack()} className="text-neutral-500 hover:text-neutral-700 transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h1.5v5.3L13 2v12L4.5 8.7V14H3V2z" /></svg>
                      </button>
                      <button onClick={handleSpotifyToggle} className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center transition-colors">
                        {spotifyPaused ? (
                          <svg className="w-3 h-3 text-black ml-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5l10 5.5-10 5.5V2.5z" /></svg>
                        ) : (
                          <svg className="w-3 h-3 text-black" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3" height="12" rx="1" /><rect x="10" y="2" width="3" height="12" rx="1" /></svg>
                        )}
                      </button>
                      <button onClick={() => playerRef.current?.nextTrack()} className="text-neutral-500 hover:text-neutral-700 transition-colors">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M13 2h-1.5v5.3L3 2v12l8.5-5.3V14H13V2z" /></svg>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                    <p className="text-xs text-neutral-500">Spotify 연결됨 — 앱에서 이 기기로 재생을 전환해주세요</p>
                  </>
                )
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.072.257c-2.687-1.652-6.785-2.13-9.965-1.166a.779.779 0 01-.972-.519.779.779 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.779.779 0 01.256 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 01-.955 1.609z" />
                  </svg>
                  <p className="text-xs text-neutral-500 flex-1">Spotify 미연결</p>
                  <a href="/api/spotify/auth" className="text-xs text-green-500 hover:text-green-400 transition-colors font-medium">연결하기 →</a>
                </>
              )}
            </div>

            {/* 음악 임베드 */}
            {activeUrl && showEmbed && (
              <div className="border-t border-neutral-100 pt-3">
                {ytId ? (
                  <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=0`} className="w-full h-40 rounded-lg" allow="autoplay; encrypted-media" allowFullScreen />
                ) : isDirectAudio ? (
                  <audio ref={audioRef} src={activeUrl} controls className="w-full h-8" onPlay={() => !isRunning && onToggle()} onPause={() => isRunning && onToggle()} onEnded={() => isRunning && onToggle()} />
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
      {/* 메인 컨트롤 바 */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 재생/일시정지 버튼 */}
        <button
          onClick={onToggle}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            isRunning
              ? 'bg-violet-600 hover:bg-violet-500'
              : 'bg-neutral-100 hover:bg-neutral-200 border border-neutral-300'
          }`}
        >
          {isRunning ? (
            <svg className="w-4 h-4 text-neutral-900" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-neutral-900 ml-0.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5l10 5.5-10 5.5V2.5z" />
            </svg>
          )}
        </button>

        {/* 타이머 표시 — 오늘 작업 시간 합계 */}
        <div className="flex-shrink-0">
          <p className={`text-xl font-mono font-black tabular-nums tracking-tight ${anyActive ? 'text-neutral-900' : 'text-neutral-400'}`}>
            {formatSeconds(totalToday)}
          </p>
          <p className="text-[9px] text-neutral-400 font-medium -mt-0.5">오늘 작업 시간</p>
        </div>

        {/* 지금 실행 중인 업무 + 상세업무 진행 */}
        {runningTaskName && (
          <div className="flex items-center gap-2 min-w-0 ml-2 pl-3 border-l border-neutral-200">
            <div className="flex items-center gap-1.5 min-w-0 max-w-[200px]" title={runningTaskName}>
              <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="#44543C"><path d="M2 1.5l9 4.5-9 4.5V1.5z" /></svg>
              <span className="text-xs font-medium truncate" style={{ color: '#44543C' }}>{runningTaskName}</span>
            </div>
            {unitBar && <div className="max-w-[240px] min-w-0">{unitBar}</div>}
          </div>
        )}

<div className="flex-1" />

        {/* 음악 URL 입력 */}
        <div className="flex gap-1.5 items-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M6 12V4l8-2v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <input
            className="bg-neutral-100 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 placeholder-neutral-400 outline-none focus:border-violet-500 w-44 transition-colors"
            placeholder="YouTube / MP3 URL"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
          />
          <button
            onClick={handleLoad}
            disabled={!urlInput.trim()}
            className="text-xs text-neutral-600 hover:text-neutral-500 disabled:opacity-30 transition-colors"
          >
            설정
          </button>
          {activeUrl && (
            <button
              onClick={() => setShowEmbed(s => !s)}
              className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              {showEmbed ? '닫기' : '열기'}
            </button>
          )}
        </div>
      </div>

      {/* Spotify 플레이어 */}
      <div className="border-t border-neutral-200 px-4 py-2.5 flex items-center gap-3">
        {spotifyToken ? (
          spotifyTrack ? (
            <>
              {spotifyTrack.albumArt && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={spotifyTrack.albumArt} alt="album" className="w-8 h-8 rounded flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-neutral-800 truncate">{spotifyTrack.name}</p>
                <p className="text-[10px] text-neutral-500 truncate">{spotifyTrack.artist}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => playerRef.current?.previousTrack()}
                  className="text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2h1.5v5.3L13 2v12L4.5 8.7V14H3V2z" />
                  </svg>
                </button>
                <button
                  onClick={handleSpotifyToggle}
                  className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center transition-colors"
                >
                  {spotifyPaused ? (
                    <svg className="w-3 h-3 text-black ml-0.5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2.5l10 5.5-10 5.5V2.5z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-black" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="2" width="3" height="12" rx="1" />
                      <rect x="10" y="2" width="3" height="12" rx="1" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => playerRef.current?.nextTrack()}
                  className="text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13 2h-1.5v5.3L3 2v12l8.5-5.3V14H13V2z" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <p className="text-xs text-neutral-500">Spotify 연결됨 — Spotify 앱에서 이 기기로 재생을 전환해주세요</p>
            </>
          )
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.072.257c-2.687-1.652-6.785-2.13-9.965-1.166a.779.779 0 01-.972-.519.779.779 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.779.779 0 01.256 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 01-.955 1.609z" />
            </svg>
            <p className="text-xs text-neutral-500 flex-1">Spotify 미연결</p>
            <a
              href="/api/spotify/auth"
              className="text-xs text-green-500 hover:text-green-400 transition-colors font-medium"
            >
              연결하기 →
            </a>
          </>
        )}
      </div>

      {/* 음악 임베드 */}
      {activeUrl && showEmbed && (
        <div className="border-t border-neutral-200">
          {ytId ? (
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=0`}
              className="w-full h-48"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : isDirectAudio ? (
            <div className="px-4 py-3">
              <audio
                ref={audioRef}
                src={activeUrl}
                controls
                className="w-full h-8"
                onPlay={() => !isRunning && onToggle()}
                onPause={() => isRunning && onToggle()}
                onEnded={() => isRunning && onToggle()}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
