'use client';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { useToast } from '../lib/ToastContext';
import { ERR } from '../lib/copy';
import BrandLoader from './BrandLoader';
import { createClient } from '../lib/supabase/client';
import { load, writeLocalRaw, setServerPusher, empty } from '../lib/store';
import { setGlobalStoreData } from '../lib/useStore';
import { pullAppData, upsertAppData } from '../lib/appDataSync';
import type { AppData } from '../lib/types';

const UID_KEY = 'spira_uid';

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

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (loading) return;
    if (!user) {
      setSynced(false);
      setServerPusher(null);
      return;
    }
    let cancelled = false;

    (async () => {
      const uid = user.id;
      let server: AppData | null = null;
      let pullOk = true;
      try { server = await pullAppData(supabase, uid); }
      catch { pullOk = false; toastOnce('sync-fail', ERR.sync, 'error'); }
      if (cancelled) return;

      if (server && Array.isArray(server.workspaces) && server.workspaces.length > 0) {
        // 서버에 데이터 있음. 단, 같은 사용자의 로컬이 더 최신(아직 서버에 못 올린 변경)이면 로컬을 유지.
        const prevUid = localStorage.getItem(UID_KEY);
        const local = load();
        const localNewer = prevUid === uid && (local.workspaces?.length ?? 0) > 0 && (local.updatedAt ?? 0) > (server.updatedAt ?? 0);
        if (localNewer) {
          try { await upsertAppData(supabase, uid, local); } catch { /* 서버 저장 실패해도 로컬 기준으로 진행 */ }
          localStorage.setItem(UID_KEY, uid);
          setGlobalStoreData(local);
        } else {
          try { writeLocalRaw(server); } catch { /* 용량 초과여도 서버 데이터 기준으로 진행 */ }
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
        if (pushTimer.current) clearTimeout(pushTimer.current);
        pushTimer.current = setTimeout(() => { void save(d); }, 800);
      });

      if (!cancelled) setSynced(true);
    })();

    return () => {
      cancelled = true;
      setServerPusher(null);
      if (pushTimer.current) clearTimeout(pushTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user, loading, supabase, toastOnce, dismiss]);

  // 인증 확인 중이거나, 로그인했지만 아직 동기화 전 → 로딩 화면
  if (loading || (user && !synced)) {
    return <BrandLoader label={loading ? '불러오는 중…' : '동기화하는 중…'} />;
  }

  return <>{children}</>;
}
