"use client";

import { useState, useEffect, useCallback } from "react";
import type { BootstrapResponse } from "@/lib/types";
import { apiFetch } from "@/components/kaji/helpers";

export function useBootstrap() {
  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBootstrap = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
      const data = await apiFetch<BootstrapResponse>("/api/bootstrap");
      setBoot(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  return { boot, setBoot, loading, error, refresh: fetchBootstrap };
}
