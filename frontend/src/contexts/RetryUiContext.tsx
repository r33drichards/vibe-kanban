import React, { createContext, useContext, useMemo } from 'react';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { useDraftStream } from '@/hooks/follow-up/useDraftStream';

type RetryUiContextType = {
  activeRetryProcessId: string | null;
  processOrder: Record<string, number>;
  isProcessGreyed: (processId?: string) => boolean;
};

const RetryUiContext = createContext<RetryUiContextType | null>(null);

export function RetryUiProvider({
  attemptId,
  children,
}: {
  attemptId?: string;
  children: React.ReactNode;
}) {
  const { executionProcesses } = useExecutionProcesses(attemptId ?? '', {
    showSoftDeleted: true,
  });
  const { retryDraft } = useDraftStream(attemptId);
  // No REST polling; rely on WS stream events only

  const processOrder = useMemo(() => {
    const order: Record<string, number> = {};
    executionProcesses.forEach((p, idx) => {
      order[p.id] = idx;
    });
    return order;
  }, [executionProcesses.map((p) => p.id).join(',')]);

  const activeRetryProcessId = retryDraft?.retry_process_id ?? null;
  const targetOrder = activeRetryProcessId
    ? (processOrder[activeRetryProcessId] ?? -1)
    : -1;

  const isProcessGreyed = (processId?: string) => {
    if (!activeRetryProcessId || !processId) return false;
    const idx = processOrder[processId];
    if (idx === undefined) return false;
    return idx >= targetOrder; // grey target and later
  };

  // Removed stream-lag REST polling. With server-side direct WS patches,
  // the WS should reflect retry state in real time.

  const value: RetryUiContextType = {
    activeRetryProcessId,
    processOrder,
    isProcessGreyed,
  };

  return (
    <RetryUiContext.Provider value={value}>{children}</RetryUiContext.Provider>
  );
}

export function useRetryUi() {
  const ctx = useContext(RetryUiContext);
  if (!ctx)
    return {
      activeRetryProcessId: null,
      processOrder: {},
      isProcessGreyed: () => false,
    } as RetryUiContextType;
  return ctx;
}
