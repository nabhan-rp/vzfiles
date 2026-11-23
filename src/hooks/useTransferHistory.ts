import { useCallback, useEffect, useState } from 'react';

export interface LocalTransferRecord {
  hash: string;
  name: string;
  size: number;
  url: string;
  sourceType: 'file' | 'remote';
  profileLabel: string;
  path?: string;
  createdAt: string;
}

const HISTORY_STORAGE_KEY = 'vz_files_history_v1';
const MAX_HISTORY_ITEMS = 50;

function loadHistory(): LocalTransferRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function useTransferHistory() {
  const [history, setHistory] = useState<LocalTransferRecord[]>(() => loadHistory());

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore storage errors
    }
  }, [history]);

  const addHistoryItem = useCallback((item: LocalTransferRecord) => {
    setHistory((prev) => {
      const deduped = prev.filter((entry) => entry.hash !== item.hash);
      return [item, ...deduped].slice(0, MAX_HISTORY_ITEMS);
    });
  }, []);

  const removeHistoryItem = useCallback((hash: string) => {
    setHistory((prev) => prev.filter((entry) => entry.hash !== hash));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    addHistoryItem,
    removeHistoryItem,
    clearHistory,
  };
}
