// hooks/useProcessRetry.ts
import { useCallback, useMemo, useState } from 'react';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import type { ExecutionProcess, TaskAttempt } from 'shared/types';

/**
 * Reusable hook to retry a process given its executionProcessId and a new prompt.
 * Handles:
 *  - Preventing retry while anything is running (or that process is already running)
 *  - Optional worktree reset (via modal)
 *  - Variant extraction for coding-agent processes
 *  - Refetching attempt + branch data after replace
 */
export function useProcessRetry(attempt: TaskAttempt | undefined) {
  const attemptId = attempt?.id;

  // Fetch attempt + branch state the same way your component did
  const { attemptData } = useAttemptExecution(attemptId);
  useBranchStatus(attemptId); // keep branch cache fresh; no direct use here

  const [busy, setBusy] = useState(false);

  // Any process running at all?
  const anyRunning = useMemo(
    () => (attemptData.processes || []).some((p) => p.status === 'running'),
    [attemptData.processes?.map((p) => p.status).join(',')]
  );

  // Convenience lookups
  const getProcessById = useCallback(
    (pid: string): ExecutionProcess | undefined =>
      (attemptData.processes || []).find((p) => p.id === pid),
    [attemptData.processes]
  );

  /**
   * Returns whether a process is currently allowed to retry, and why not.
   * Useful if you want to gray out buttons in any component.
   */
  const getRetryDisabledState = useCallback(
    (pid: string) => {
      const proc = getProcessById(pid);
      const isRunningProc = proc?.status === 'running';
      const disabled = busy || anyRunning || isRunningProc;
      let reason: string | undefined;
      if (isRunningProc) reason = 'Finish or stop this run to retry.';
      else if (anyRunning) reason = 'Cannot retry while a process is running.';
      else if (busy) reason = 'Retry in progress.';
      return { disabled, reason };
    },
    [busy, anyRunning, getProcessById]
  );

  /**
   * Primary entrypoint: retry a process with a new prompt.
   */
  // Initialize retry mode by creating a retry draft populated from the process
  const startRetry = useCallback(
    async (executionProcessId: string, newPrompt: string) => {
      if (!attemptId) return;
      const proc = getProcessById(executionProcessId);
      if (!proc) return;
      const { disabled } = getRetryDisabledState(executionProcessId);
      if (disabled) return;

      // Read variant from process details (ensure we have full details)
      let variant: string | null = null;
      try {
        const details =
          await executionProcessesApi.getDetails(executionProcessId);
        const typ: any = details?.executor_action?.typ as any;
        if (
          typ &&
          (typ.type === 'CodingAgentInitialRequest' ||
            typ.type === 'CodingAgentFollowUpRequest')
        ) {
          variant = (typ.executor_profile_id?.variant as string | null) ?? null;
        }
      } catch {
        /* ignore */
      }

      setBusy(true);
      try {
        await attemptsApi.saveDraft(attemptId, 'retry', {
          retry_process_id: executionProcessId,
          prompt: newPrompt,
          variant,
          image_ids: [],
          version: null as any,
        });
      } finally {
        setBusy(false);
      }
    },
    [attemptId, getProcessById, getRetryDisabledState]
  );

  return {
    startRetry,
    busy,
    anyRunning,
    /** Helpful for buttons/tooltips */
    getRetryDisabledState,
  };
}

export type UseProcessRetryReturn = ReturnType<typeof useProcessRetry>;
