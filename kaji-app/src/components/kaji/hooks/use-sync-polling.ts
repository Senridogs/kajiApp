"use client";

import { useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/components/kaji/helpers";

type SyncResponse = {
  token: string;
};

export function useSyncPolling(
  householdId: string | null,
  onSync: () => void,
  intervalMs: number = 15000,
) {
  const tokenRef = useRef<string | null>(null);

  const checkSync = useCallback(async () => {
    if (!householdId) return;
    try {
      const data = await apiFetch<SyncResponse>("/api/sync");
      const newToken = data.token;
      if (tokenRef.current && tokenRef.current !== newToken) {
        onSync();
      }
      tokenRef.current = newToken;
    } catch {
      // ネットワークエラーは無視（次回ポーリングでリトライ）
    }
  }, [householdId, onSync]);

  useEffect(() => {
    if (!householdId) return;
    checkSync();
    const id = setInterval(checkSync, intervalMs);
    return () => clearInterval(id);
  }, [householdId, checkSync, intervalMs]);
}
