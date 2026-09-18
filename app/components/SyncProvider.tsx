'use client';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { useToast } from '../lib/ToastContext';
import { ERR } from '../lib/copy';
import BrandLoader from './BrandLoader';
import { createClient } from '../lib/supabase/client';
import { load, writeLocalRaw, setServerPusher, empty } from '../lib/store';
import { setGlobalStoreData, getGlobalStoreData } from '../lib/useStore';
import { pullAppData, upsertAppData } from '../lib/appDataSync';
import type { AppData } from '../lib/types';

const UID_KEY = 'spira_uid';

// 데이터 '내용량' 점수 — 프로그램/데드라인/프로젝트 총합. 서버가 로컬보다 내용이 적으면(가져오기 유실 등) 로컬을 우선.
function contentScore(d: AppData): number {
  return (d.workspaces ?? []).reduce((n, e) => {
    const progs = e.programs ?? [];
    const dls = progs.reduce((m, p) => m + (p.deadlines?.length ?? 0), 0);
    return n + progs.length + dls + (e.plan?.projects?.length ?? 0) + (e.plan?.goals?.length ?? 0);
  }, 0);
}

// 타이머 누적시간(날짜·task별 초 + 하루 총 초)은 기기별로 각각 쌓이므로 로컬↔서버를 무조건 max-merge (한쪽 덮어쓰기 방지 → 기기 간 동기화)
function mergeTimerTimes(a?: AppData | null, b?: AppData | null): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const src of [a?.timerTimes ?? {}, b?.timerTimes ?? {}]) for (const date in src) { out[date] = out[date] ?? {}; for (const tk in src[date]) out[date][tk] = Math.max(out[date][tk] ?? 0, src[date][tk]); }
  return out;
}
function mergeTimerFocus(a?: AppData | null, b?: AppData | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [a?.timerFocus ?? {}, b?.timerFocus ?? {}]) for (const date in src) out[date] = Math.max(out[date] ?? 0, src[date]);
  return out;
}

// 로그인 후 서버(app_data)와 로컬(localStorage)을 동기화한다.
// - 서버에 데이터 있으면 → 로컬을 서버 데이터로 교체
// - 서버가 비어 있고 로컬에 (로그인 전) 데이터가 있으면 → 서버로 이전(1회 마이그레이션)
// - 이후 모든 변경은 디바운스로 서버에 자동 저장
export default function SyncProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { toastOnce, dismiss } = useToast();
  const [supabase] = useState(() => createClient());
  const [synced, setSynced] = useState(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<AppData | null>(null); // 아직 서버로 못 올린 최신 데이터(디바운스 대기 중)
  const lastResyncRef = useRef(0); // 재동기화 쓰로틀

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (loading) return;
    if (!user) {
      setSynced(false);
      setServerPusher(null);
      return;
    }
    let cancelled = false;
    let flushCleanup: (() => void) | null = null;

    (async () => {
      const uid = user.id;
      let server: AppData | null = null;
      let pullOk = true;
      try { server = await pullAppData(supabase, uid); }
      catch { pullOk = false; toastOnce('sync-fail', ERR.sync, 'error'); }
      if (cancelled) return;

      if (server && Array.isArray(server.workspaces) && server.workspaces.length > 0) {
        // 서버에 데이터 있음. 단, 같은 사용자의 로컬이 더 최신(아직 서버에 못 올린 변경)이거나
        // 로컬에 더 많은 내용(아직 서버에 반영 못 한 가져오기 등)이 있으면 로컬을 유지 → 새로고침 시 유실 방지.
        const prevUid = localStorage.getItem(UID_KEY);
        const local = load();
        const sameUser = prevUid === uid || !prevUid; // UID 미기록(로그인 전 데이터 포함)도 같은 사용자로 취급
        const localHas = (local.workspaces?.length ?? 0) > 0;
        const localNewer = sameUser && localHas
          && ((local.updatedAt ?? 0) >= (server.updatedAt ?? 0) || contentScore(local) > contentScore(server));
        const mergedTimer = mergeTimerTimes(local, server); // 타이머 시간은 로컬·서버 합산(max) 보존
        const mergedFocus = mergeTimerFocus(local, server);
        if (localNewer) {
          const chosen = { ...local, timerTimes: mergedTimer, timerFocus: mergedFocus };
          try { await upsertAppData(supabase, uid, chosen); } catch { /* 서버 저장 실패해도 로컬 기준으로 진행 */ }
          localStorage.setItem(UID_KEY, uid);
          try { writeLocalRaw(chosen); } catch { /* ignore */ }
          setGlobalStoreData(chosen);
        } else {
          const chosen = { ...server, timerTimes: mergedTimer, timerFocus: mergedFocus };
          try { writeLocalRaw(chosen); } catch { /* 용량 초과여도 서버 데이터 기준으로 진행 */ }
          localStorage.setItem(UID_KEY, uid);
          setGlobalStoreData(load());
        }
      } else if (pullOk) {
        // 서버 비어 있음
        const prevUid = localStorage.getItem(UID_KEY);
        const localData = load();
        const localHasData = (localData.workspaces?.length ?? 0) > 0;
        if (localHasData && (!prevUid || prevUid === uid)) {
          // 이 사용자의 기존 로컬 데이터(로그인 전 포함)를 서버로 이전
          try { await upsertAppData(supabase, uid, localData); } catch { toastOnce('save-fail', ERR.initSave, 'error'); }
          localStorage.setItem(UID_KEY, uid);
          setGlobalStoreData(localData);
        } else {
          // 다른 사용자의 로컬이거나 로컬도 비어 있음 → 빈 상태로 시작
          try { writeLocalRaw(empty); } catch { /* ignore */ }
          localStorage.setItem(UID_KEY, uid);
          setGlobalStoreData(load());
        }
      }

      // 서버 저장(실패 시 토스트 + 자동 재시도, 복구되면 토스트 해제)
      const save = async (d: AppData, attempt = 0) => {
        try {
          await upsertAppData(supabase, uid, d);
          dismiss('save-fail');
        } catch {
          toastOnce('save-fail', ERR.save, 'error');
          if (attempt < 6 && !cancelled) {
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => { void save(d, attempt + 1); }, 4000);
          }
        }
      };

      // 이후 변경사항을 디바운스(800ms)로 서버에 저장
      setServerPusher((d: AppData) => {
        pendingRef.current = d;
        if (pushTimer.current) clearTimeout(pushTimer.current);
        pushTimer.current = setTimeout(() => { pendingRef.current = null; void save(d); }, 800);
      });

      // 페이지 이탈/숨김 시 디바운스 대기 중인 변경을 즉시 서버로 flush (새로고침·탭전환 시 유실 방지)
      const flush = () => {
        const d = pendingRef.current;
        if (!d) return;
        pendingRef.current = null;
        if (pushTimer.current) clearTimeout(pushTimer.current);
        try { void upsertAppData(supabase, uid, d); } catch { /* best-effort */ }
      };
      // 창을 다시 볼 때/포커스 시 서버에서 재동기화 → 다른 기기 변경(타이머·완료 등)이 반영됨. (타이머 시간은 항상 max-merge로 보존)
      const resync = async () => {
        if (cancelled || document.visibilityState === 'hidden') return;
        if (Date.now() - lastResyncRef.current < 3000) return;
        lastResyncRef.current = Date.now();
        flush(); // 대기 중 로컬 변경 먼저 서버로
        let srv: AppData | null = null;
        try { srv = await pullAppData(supabase, uid); } catch { return; }
        if (!srv || cancelled) return;
        const cur = getGlobalStoreData();
        const mergedTimer = mergeTimerTimes(cur, srv);
        const mergedFocus = mergeTimerFocus(cur, srv);
        const serverNewer = (srv.updatedAt ?? 0) > (cur.updatedAt ?? 0) && (srv.workspaces?.length ?? 0) > 0;
        const base = serverNewer ? srv : cur;
        const chosen = { ...base, timerTimes: mergedTimer, timerFocus: mergedFocus } as AppData;
        if (JSON.stringify(chosen) === JSON.stringify(cur)) return; // 변화 없음
        try { writeLocalRaw(chosen); } catch { /* ignore */ }
        setGlobalStoreData(chosen);
      };
      const onHide = () => { if (document.visibilityState === 'hidden') flush(); else void resync(); };
      const onFocus = () => void resync();
      window.addEventListener('pagehide', flush);
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onHide);
      flushCleanup = () => {
        window.removeEventListener('pagehide', flush);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onHide);
      };

      if (!cancelled) setSynced(true);
    })();

    return () => {
      cancelled = true;
      setServerPusher(null);
      if (pushTimer.current) clearTimeout(pushTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      flushCleanup?.();
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user, loading, supabase, toastOnce, dismiss]);

  // 인증 확인 중이거나, 로그인했지만 아직 동기화 전 → 로딩 화면
  if (loading || (user && !synced)) {
    return <BrandLoader label={loading ? '불러오는 중…' : '동기화하는 중…'} />;
  }

  return <>{children}</>;
}
