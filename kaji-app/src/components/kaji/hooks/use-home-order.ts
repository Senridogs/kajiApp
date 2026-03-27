"use client";

import { useState, useCallback } from "react";

const STORAGE_KEY = "ietask-home-order-v2";

function loadOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as string[]) : [];
  } catch {
    return [];
  }
}

export function useHomeOrder() {
  const [order, setOrder] = useState<string[]>(loadOrder);

  const updateOrder = useCallback((newOrder: string[]) => {
    setOrder(newOrder);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
    } catch {
      // localStorage full — ignore
    }
  }, []);

  const applyOrder = useCallback(
    <T extends { id: string }>(items: T[]): T[] => {
      if (order.length === 0) return items;
      const orderMap = new Map(order.map((id, i) => [id, i]));
      return [...items].sort((a, b) => {
        const ai = orderMap.get(a.id) ?? Infinity;
        const bi = orderMap.get(b.id) ?? Infinity;
        return ai - bi;
      });
    },
    [order],
  );

  return { order, updateOrder, applyOrder };
}
