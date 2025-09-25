import {
  ExternalLink,
  GitBranch as GitBranchIcon,
  GitFork,
  GitPullRequest,
  History,
  Play,
  Plus,
  RefreshCw,
  ScrollText,
  Settings,
  StopCircle,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import type {
  GitBranch,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
import { useBranchStatus, useOpenInEditor } from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useDevServer } from '@/hooks/useDevServer';
import { useChangeTargetBranch } from '@/hooks/useChangeTargetBranch';
import { useRebase } from '@/hooks/useRebase';
import { useMerge } from '@/hooks/useMerge';
import NiceModal from '@ebay/nice-modal-react';
import { ApiError, Err } from '@/lib/api';
import type { GitOperationError } from 'shared/types';
import { displayConflictOpLabel } from '@/lib/conflicts';
import { usePush } from '@/hooks/usePush';
import { useUserSystem } from '@/components/config-provider.tsx';

import { writeClipboardViaBridge } from '@/vscode/bridge';
import { useProcessSelection } from '@/contexts/ProcessSelectionContext';
import { openTaskForm } from '@/lib/openTaskForm';
import { showModal } from '@/lib/modals';

// Helper function to get the display name for different editor types
function getEditorDisplayName(editorType: string): string {
  switch (editorType) {
    case 'VS_CODE':
      return 'Visual Studio Code';
    case 'CURSOR':
      return 'Cursor';
    case 'WINDSURF':
      return 'Windsurf';
    case 'INTELLI_J':
      return 'IntelliJ IDEA';
    case 'ZED':
      return 'Zed';
    case 'XCODE':
      return 'Xcode';
    case 'CUSTOM':
      return 'Editor';
    default:
      return 'Editor';
  }
}

type Props = {
  task: TaskWithAttemptStatus;
  projectId: string;
  projectHasDevScript: boolean;
  setError: Dispatch<SetStateAction<string | null>>;

  selectedBranch: string | null;
  selectedAttempt: TaskAttempt;
  taskAttempts: TaskAttempt[];
  creatingPR: boolean;
  handleEnterCreateAttemptMode: () => void;
  branches: GitBranch[];
  setSelectedAttempt: (attempt: TaskAttempt | null) => void;
};

function CurrentAttempt({
  task,
  projectId,
  projectHasDevScript,
  setError,
  selectedBranch,
  selectedAttempt,
  taskAttempts,
  creatingPR,
  handleEnterCreateAttemptMode,
  branches,
  setSelectedAttempt,
}: Props) {
  const { config } = useUserSystem();
  const { isAttemptRunning, stopExecution, isStopping } = useAttemptExecution(
    selectedAttempt?.id,
    task.id
  );
  const { data: branchStatus, refetch: refetchBranchStatus } = useBranchStatus(
    selectedAttempt?.id
  );
  const hasConflicts = useMemo(
    () => Boolean((branchStatus?.conflicted_files?.length ?? 0) > 0),
    [branchStatus?.conflicted_files]
  );
  const conflictOpLabel = useMemo(
    () => displayConflictOpLabel(branchStatus?.conflict_op),
    [branchStatus?.conflict_op]
  );
  const handleOpenInEditor = useOpenInEditor(selectedAttempt);
  const { jumpToProcess } = useProcessSelection();

  // Attempt action hooks
  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    runningDevServer,
    latestDevServerProcess,
  } = useDevServer(selectedAttempt?.id);
  const changeTargetBranchMutation = useChangeTargetBranch(
    selectedAttempt?.id,
    projectId
  );
  const rebaseMutation = useRebase(selectedAttempt?.id, projectId);
  const mergeMutation = useMerge(selectedAttempt?.id);
  const pushMutation = usePush(selectedAttempt?.id);

  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  const handleViewDevServerLogs = () => {
    if (latestDevServerProcess) {
      jumpToProcess(latestDevServerProcess.id);
    }
  };

  const handleCreateSubtaskClick = () => {
    openTaskForm({
      projectId,
      initialBaseBranch: selectedAttempt.branch || selectedAttempt.base_branch,
      parentTaskAttemptId: selectedAttempt.id,
    });
  };

  // Use the stopExecution function from the hook

  const handleAttemptChange = useCallback(
    (attempt: TaskAttempt) => {
      setSelectedAttempt(attempt);
      // React Query will handle refetching when attemptId changes
    },
    [setSelectedAttempt]
  );

  const handleMergeClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // Directly perform merge without checking branch status
    await performMerge();
  };

  const handlePushClick = async () => {
    try {
      setPushing(true);
      await pushMutation.mutateAsync();
      setError(null); // Clear any previous errors on success
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 2000);
    } catch (error: any) {
      setError(error.message || 'Failed to push changes');
    } finally {
      setPushing(false);
    }
  };

  const performMerge = async () => {
    try {
      setMerging(true);
      await mergeMutation.mutateAsync();
      setError(null); // Clear any previous errors on success
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
    } catch (error) {
      // @ts-expect-error it is type ApiError
      setError(error.message || 'Failed to merge changes');
    } finally {
      setMerging(false);
    }
  };

  const handleChangeTargetBranchClick = async (newBranch: string) => {
    await changeTargetBranchMutation
      .mutateAsync(newBranch)
      .then(() => setError(null))
      .catch((err: ApiError) => {
        setError(err.message || 'Failed to change target branch');
      });
    setRebasing(false);
  };

  const handleRebaseClick = async () => {
    setRebasing(true);
    await rebaseMutation
      .mutateAsync()
      .then(() => setError(null))
      .catch((err: Err<GitOperationError>) => {
        const data = err?.error;
        const isConflict =
          data?.type === 'merge_conflicts' ||
          data?.type === 'rebase_in_progress';
        if (!isConflict) setError(err.message || 'Failed to rebase branch');
      });
    setRebasing(false);
  };

  const handleChangeTargetBranchDialogOpen = async () => {
    try {
      const result = await showModal<{
        action: 'confirmed' | 'canceled';
        branchName: string;
      }>('change-target-branch-dialog', {
        branches,
        isChangingTargetBranch: rebasing,
      });

      if (result.action === 'confirmed' && result.branchName) {
        await handleChangeTargetBranchClick(result.branchName);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  const handlePRButtonClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // If PR already exists, push to it
    if (mergeInfo.hasOpenPR) {
      await handlePushClick();
      return;
    }

    NiceModal.show('create-pr', {
      attempt: selectedAttempt,
      task,
      projectId,
    });
  };

  // Refresh branch status when a process completes (e.g., rebase resolved by agent)
  const prevRunningRef = useRef<boolean>(isAttemptRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isAttemptRunning && selectedAttempt?.id) {
      refetchBranchStatus();
    }
    prevRunningRef.current = isAttemptRunning;
  }, [isAttemptRunning, selectedAttempt?.id, refetchBranchStatus]);

  // Get display name for selected branch
  const selectedBranchDisplayName = useMemo(() => {
    if (!selectedBranch) return 'current';

    // For remote branches, show just the branch name without the remote prefix
    if (selectedBranch.includes('/')) {
      const parts = selectedBranch.split('/');
      return parts[parts.length - 1];
    }
    return selectedBranch;
  }, [selectedBranch]);

  // Get display name for the configured editor
  const editorDisplayName = useMemo(() => {
    if (!config?.editor?.editor_type) return 'Editor';
    return getEditorDisplayName(config.editor.editor_type);
  }, [config?.editor?.editor_type]);

  // Memoize merge status information to avoid repeated calculations
  const mergeInfo = useMemo(() => {
    if (!branchStatus?.merges)
      return {
        hasOpenPR: false,
        openPR: null,
        hasMergedPR: false,
        mergedPR: null,
        hasMerged: false,
        latestMerge: null,
      };

    const openPR = branchStatus.merges.find(
      (m) => m.type === 'pr' && m.pr_info.status === 'open'
    );

    const mergedPR = branchStatus.merges.find(
      (m) => m.type === 'pr' && m.pr_info.status === 'merged'
    );

    const merges = branchStatus.merges.filter(
      (m) =>
        m.type === 'direct' ||
        (m.type === 'pr' && m.pr_info.status === 'merged')
    );

    return {
      hasOpenPR: !!openPR,
      openPR,
      hasMergedPR: !!mergedPR,
      mergedPR,
      hasMerged: merges.length > 0,
      latestMerge: branchStatus.merges[0] || null, // Most recent merge
    };
  }, [branchStatus?.merges]);

  const truncatedBaseBranch = useMemo(() => {
    const baseName = branchStatus?.base_branch_name;
    if (!baseName) return null;
    if (baseName.length < 13) return baseName;
    return `${baseName.slice(0, 10)}...`;
  }, [branchStatus?.base_branch_name]);

  const mergeButtonLabel = useMemo(() => {
    if (mergeSuccess) return 'Merged!';
    if (merging) return 'Merging...';
    if (truncatedBaseBranch) return `Merge into ${truncatedBaseBranch}`;
    return 'Merge';
  }, [mergeSuccess, merging, truncatedBaseBranch]);

  const rebaseButtonLabel = useMemo(() => {
    if (rebasing) return 'Rebasing...';
    if (truncatedBaseBranch) return `Rebase onto ${truncatedBaseBranch}`;
    return 'Rebase';
  }, [rebasing, truncatedBaseBranch]);

  const handleCopyWorktreePath = useCallback(async () => {
    try {
      await writeClipboardViaBridge(selectedAttempt.container_ref || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy worktree path:', err);
    }
  }, [selectedAttempt.container_ref]);

  const formatAheadBehind = useCallback(
    (ahead?: number | null, behind?: number | null) =>
      ` ${(ahead ?? 0) >= 0 ? '+' : ''}${ahead ?? 0}/${(behind ?? 0) >= 0 ? '-' : ''}${behind ?? 0}`,
    []
  );

  // Get status information for display
  const getStatusInfo = useCallback(() => {
    const countsLabel = formatAheadBehind(
      branchStatus?.commits_ahead,
      branchStatus?.commits_behind
    );

    if (hasConflicts) {
      return {
        dotColor: 'bg-orange-500',
        textColor: 'text-orange-700',
        text: `${conflictOpLabel} conflicts${countsLabel}`,
        isClickable: false,
      } as const;
    }
    if (branchStatus?.is_rebase_in_progress) {
      return {
        dotColor: 'bg-orange-500',
        textColor: 'text-orange-700',
        text: `Rebase in progress${countsLabel}`,
        isClickable: false,
      } as const;
    }
    if (mergeInfo.hasMergedPR && mergeInfo.mergedPR?.type === 'pr') {
      const prMerge = mergeInfo.mergedPR;
      return {
        dotColor: 'bg-green-500',
        textColor: 'text-green-700',
        text: `PR #${prMerge.pr_info.number} merged${countsLabel}`,
        isClickable: true,
        onClick: () => window.open(prMerge.pr_info.url, '_blank'),
      };
    }
    if (
      mergeInfo.hasMerged &&
      mergeInfo.latestMerge?.type === 'direct' &&
      (branchStatus?.commits_ahead ?? 0) === 0
    ) {
      return {
        dotColor: 'bg-green-500',
        textColor: 'text-green-700',
        text: `Merged${countsLabel}`,
        isClickable: false,
      };
    }

    if (mergeInfo.hasOpenPR && mergeInfo.openPR?.type === 'pr') {
      const prMerge = mergeInfo.openPR;
      return {
        dotColor: 'bg-blue-500',
        textColor: 'text-blue-700 dark:text-blue-400',
        text: `PR #${prMerge.pr_info.number}${countsLabel}`,
        isClickable: true,
        onClick: () => window.open(prMerge.pr_info.url, '_blank'),
      };
    }

    if ((branchStatus?.commits_behind ?? 0) > 0) {
      return {
        dotColor: 'bg-orange-500',
        textColor: 'text-orange-700',
        text: `Rebase needed${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}${countsLabel}`,
        isClickable: false,
      };
    }

    if ((branchStatus?.commits_ahead ?? 0) > 0) {
      return {
        dotColor: 'bg-yellow-500',
        textColor: 'text-yellow-700',
        text:
          branchStatus?.commits_ahead === 1
            ? `1 commit ahead${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}${countsLabel}`
            : `${branchStatus?.commits_ahead} commits ahead${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}${countsLabel}`,
        isClickable: false,
      };
    }

    return {
      dotColor: 'bg-gray-500',
      textColor: 'text-gray-700',
      text: `Up to date${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}${countsLabel}`,
      isClickable: false,
    };
  }, [mergeInfo, branchStatus, formatAheadBehind]);

  return (
    <div className="space-y-2 @container">
      {/* <div className="flex gap-6 items-start"> */}
      <div className="grid grid-cols-2 gap-3 items-start @md:flex @md:items-start">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Agent
          </div>
          <div className="text-sm font-medium">{selectedAttempt.executor}</div>
        </div>

        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Task Branch
          </div>
          <div className="flex items-center gap-1.5">
            <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium truncate">
              {selectedAttempt.branch}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            <span className="truncate">Target Branch</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleChangeTargetBranchDialogOpen}
                    disabled={rebasing || isAttemptRunning || hasConflicts}
                    className="h-4 w-4 p-0 hover:bg-muted"
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Change target branch</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-1.5">
            <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium truncate">
              {branchStatus?.base_branch_name || selectedBranchDisplayName}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Status
          </div>
          <div className="flex items-center gap-1.5">
            {(() => {
              const statusInfo = getStatusInfo();
              return (
                <>
                  <div
                    className={`h-2 w-2 ${statusInfo.dotColor} rounded-full`}
                  />
                  {statusInfo.isClickable ? (
                    <button
                      onClick={statusInfo.onClick}
                      className={`text-sm font-medium ${statusInfo.textColor} hover:underline cursor-pointer`}
                    >
                      {statusInfo.text}
                    </button>
                  ) : (
                    <span
                      className={`text-sm font-medium ${statusInfo.textColor} truncate`}
                      title={statusInfo.text}
                    >
                      {statusInfo.text}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 pt-1">
            Path
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleOpenInEditor()}
            className="h-6 px-2 text-xs hover:bg-muted gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Open in {editorDisplayName}
          </Button>
        </div>
        <div
          className={`text-xs font-mono px-2 py-1 break-all cursor-pointer transition-all duration-300 flex items-center gap-2 ${
            copied
              ? 'bg-green-100 text-green-800 border border-green-300'
              : 'text-muted-foreground bg-muted hover:bg-muted/80'
          }`}
          onClick={handleCopyWorktreePath}
          title={copied ? 'Copied!' : 'Click to copy worktree path'}
        >
          <span
            className={`truncate ${copied ? 'text-green-800' : ''}`}
            dir="rtl"
          >
            {selectedAttempt.container_ref}
          </span>
          {copied && (
            <span className="text-green-700 font-medium whitespace-nowrap">
              Copied!
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-3 @md:flex @md:flex-wrap @md:items-center">
          <div className="flex gap-2 @md:flex-none">
            <Button
              variant={runningDevServer ? 'destructive' : 'outline'}
              size="xs"
              onClick={() =>
                runningDevServer ? stopDevServer() : startDevServer()
              }
              disabled={
                isStartingDevServer || !projectHasDevScript || hasConflicts
              }
              className="gap-1 flex-1"
            >
              {runningDevServer ? (
                <>
                  <StopCircle className="h-3 w-3" />
                  Stop Dev
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Dev
                </>
              )}
            </Button>

            {/* View Dev Server Logs Button */}
            {latestDevServerProcess && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleViewDevServerLogs}
                      className="gap-1"
                    >
                      <ScrollText className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View dev server logs</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Git Operations */}
          {selectedAttempt && branchStatus && !mergeInfo.hasMergedPR && (
            <>
              <Button
                onClick={handleRebaseClick}
                disabled={
                  rebasing ||
                  isAttemptRunning ||
                  hasConflicts ||
                  (branchStatus.commits_behind ?? 0) === 0
                }
                variant="outline"
                size="xs"
                className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1"
              >
                <RefreshCw
                  className={`h-3 w-3 ${rebasing ? 'animate-spin' : ''}`}
                />
                {rebaseButtonLabel}
              </Button>
              <>
                <Button
                  onClick={handlePRButtonClick}
                  disabled={
                    creatingPR ||
                    pushing ||
                    Boolean((branchStatus.commits_behind ?? 0) > 0) ||
                    isAttemptRunning ||
                    hasConflicts ||
                    (mergeInfo.hasOpenPR &&
                      branchStatus.remote_commits_ahead === 0) ||
                    ((branchStatus.commits_ahead ?? 0) === 0 &&
                      (branchStatus.remote_commits_ahead ?? 0) === 0 &&
                      !pushSuccess &&
                      !mergeSuccess)
                  }
                  variant="outline"
                  size="xs"
                  className="border-blue-300  dark:border-blue-700 text-blue-700 dark:text-blue-500 hover:bg-blue-50 dark:hover:bg-transparent dark:hover:text-blue-400 dark:hover:border-blue-400 gap-1 min-w-[120px]"
                >
                  <GitPullRequest className="h-3 w-3" />
                  {mergeInfo.hasOpenPR
                    ? pushSuccess
                      ? 'Pushed!'
                      : pushing
                        ? 'Pushing...'
                        : branchStatus.remote_commits_ahead === 0
                          ? 'Push to PR'
                          : branchStatus.remote_commits_ahead === 1
                            ? 'Push 1 commit'
                            : `Push ${branchStatus.remote_commits_ahead || 0} commits`
                    : creatingPR
                      ? 'Creating...'
                      : 'Create PR'}
                </Button>
                <Button
                  onClick={handleMergeClick}
                  disabled={
                    mergeInfo.hasOpenPR ||
                    merging ||
                    hasConflicts ||
                    Boolean((branchStatus.commits_behind ?? 0) > 0) ||
                    isAttemptRunning ||
                    ((branchStatus.commits_ahead ?? 0) === 0 &&
                      !pushSuccess &&
                      !mergeSuccess)
                  }
                  size="xs"
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-900 dark:hover:bg-green-700 gap-1 min-w-[120px]"
                >
                  <GitBranchIcon className="h-3 w-3" />
                  {mergeButtonLabel}
                </Button>
              </>
            </>
          )}

          <div className="flex gap-2 @md:flex-none">
            {isStopping || isAttemptRunning ? (
              <Button
                variant="destructive"
                size="xs"
                onClick={stopExecution}
                disabled={isStopping}
                className="gap-1 flex-1"
              >
                <StopCircle className="h-4 w-4" />
                {isStopping ? 'Stopping...' : 'Stop Attempt'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="xs"
                onClick={handleEnterCreateAttemptMode}
                className="gap-1 flex-1"
              >
                <Plus className="h-4 w-4" />
                New Attempt
              </Button>
            )}
            {taskAttempts.length > 1 && (
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="xs" className="gap-1">
                          <History className="h-3 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View attempt history</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="start" className="w-64">
                  {taskAttempts.map((attempt) => (
                    <DropdownMenuItem
                      key={attempt.id}
                      onClick={() => handleAttemptChange(attempt)}
                      className={
                        selectedAttempt?.id === attempt.id ? 'bg-accent' : ''
                      }
                    >
                      <div className="flex flex-col w-full">
                        <span className="font-medium text-sm">
                          {new Date(attempt.created_at).toLocaleDateString()}{' '}
                          {new Date(attempt.created_at).toLocaleTimeString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {attempt.executor || 'Base Agent'}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <Button
            onClick={handleCreateSubtaskClick}
            variant="outline"
            size="xs"
            className="gap-1 min-w-[120px]"
          >
            <GitFork className="h-3 w-3" />
            Create Subtask
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CurrentAttempt;
