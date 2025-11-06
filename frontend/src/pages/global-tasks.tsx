import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, LayoutGrid, Table } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { tasksApi } from '@/lib/api';
import type { GitBranch } from 'shared/types';
import { FeatureShowcaseModal } from '@/components/showcase/FeatureShowcaseModal';
import { showcases } from '@/config/showcases';
import { useShowcaseTrigger } from '@/hooks/useShowcaseTrigger';
import { usePostHog } from 'posthog-js/react';
import { TagFilter } from '@/components/TagFilter';
import { ProjectFilter } from '@/components/ProjectFilter';
import { groupedTopologicalSort, reverseTopologicalSort } from '@/lib/topologicalSort';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useSearch } from '@/contexts/search-context';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useBranchStatus, useAttemptExecution } from '@/hooks';
import { projectsApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import {
  useKeyCreate,
  useKeyExit,
  useKeyFocusSearch,
  useKeyNavUp,
  useKeyNavDown,
  useKeyNavLeft,
  useKeyNavRight,
  useKeyOpenDetails,
  Scope,
  useKeyDeleteTask,
  useKeyCycleViewBackward,
} from '@/keyboard';

import TaskKanbanBoard from '@/components/tasks/TaskKanbanBoard';
import TaskTableView from '@/components/tasks/TaskTableView';
import type { TaskWithAttemptStatus, Project } from 'shared/types';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { TasksLayout, type LayoutMode } from '@/components/layout/TasksLayout';
import { PreviewPanel } from '@/components/panels/PreviewPanel';
import { DiffsPanel } from '@/components/panels/DiffsPanel';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import TaskPanel from '@/components/panels/TaskPanel';
import TodoPanel from '@/components/tasks/TodoPanel';
import { NewCard, NewCardHeader } from '@/components/ui/new-card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { TaskPanelHeaderActions } from '@/components/panels/TaskPanelHeaderActions';

type Task = TaskWithAttemptStatus;

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

export function GlobalTasks() {
  const { t } = useTranslation(['tasks', 'common']);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { taskId, attemptId } = useParams();
  const posthog = usePostHog();

  const [tasks, setTasks] = useState<TaskWithAttemptStatus[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'date' | 'topological' | 'reverse-topological'>('date');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  const { searchQuery, inputRef, focusInput } = useSearch();
  const isMobile = useMediaQuery('(max-width: 640px)');

  // Load tasks and projects
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [tasksData, projectsData] = await Promise.all([
          tasksApi.getAllGlobal(),
          projectsApi.getAll(),
        ]);
        setTasks(tasksData);
        setProjects(projectsData);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const tasksById = useMemo(() => {
    const map: Record<string, Task> = {};
    tasks.forEach((task) => {
      map[task.id] = task;
    });
    return map;
  }, [tasks]);

  const selectedTask = taskId ? tasksById[taskId] : undefined;
  const isPanelOpen = !!taskId;

  const handleViewTaskDetails = useCallback(
    (task: Task) => {
      navigate(paths.task(task.project_id, task.id));
    },
    [navigate]
  );

  const handleClosePanel = useCallback(() => {
    navigate('/tasks');
  }, [navigate]);

  const handleDeleteTask = useCallback(
    async (deletedTaskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== deletedTaskId));
      if (taskId === deletedTaskId) {
        handleClosePanel();
      }
    },
    [taskId, handleClosePanel]
  );

  useKeyExit(
    () => {
      if (isPanelOpen) {
        handleClosePanel();
      } else {
        navigate('/projects');
      }
    },
    { scope: Scope.KANBAN }
  );

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          (task.description && task.description.toLowerCase().includes(query))
      );
    }

    // Apply project filter
    if (selectedProjectIds.length > 0) {
      result = result.filter((task) => selectedProjectIds.includes(task.project_id));
    }

    // Apply tag filter
    if (selectedTagIds.length > 0) {
      result = result.filter((task) =>
        task.tags.some((tag) => selectedTagIds.includes(tag.id))
      );
    }

    // Apply sort mode
    if (sortMode === 'topological') {
      result = groupedTopologicalSort(result);
    } else if (sortMode === 'reverse-topological') {
      result = reverseTopologicalSort(result);
    }

    return result;
  }, [tasks, searchQuery, selectedProjectIds, selectedTagIds, sortMode]);

  const groupedFilteredTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    TASK_STATUSES.forEach((status) => {
      groups[status] = [];
    });

    filteredTasks.forEach((task) => {
      const status = task.status.toLowerCase();
      if (groups[status]) {
        groups[status].push(task);
      }
    });

    return groups;
  }, [filteredTasks]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const draggedTaskId = active.id as string;
      const newStatus = over.id as Task['status'];
      const task = tasksById[draggedTaskId];
      if (!task || task.status === newStatus) return;

      try {
        await tasksApi.update(draggedTaskId, {
          title: task.title,
          description: task.description,
          status: newStatus,
          parent_task_attempt: task.parent_task_attempt,
          image_ids: null,
          tag_ids: null,
        });

        // Update local state
        setTasks((prev) =>
          prev.map((t) =>
            t.id === draggedTaskId ? { ...t, status: newStatus } : t
          )
        );
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    },
    [tasksById]
  );

  if (isLoading) {
    return <Loader message="Loading tasks..." size={32} className="py-8" />;
  }

  const projectsById = useMemo(() => {
    const map: Record<string, Project> = {};
    projects.forEach((project) => {
      map[project.id] = project;
    });
    return map;
  }, [projects]);

  const kanbanContent =
    tasks.length === 0 ? (
      <div className="max-w-7xl mx-auto mt-8">
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">No tasks found</p>
          </CardContent>
        </Card>
      </div>
    ) : (
      <div className="w-full h-full flex flex-col">
        <div className="shrink-0 px-4 py-2 border-b bg-background flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ProjectFilter
              selectedProjectIds={selectedProjectIds}
              onProjectsChange={setSelectedProjectIds}
            />
            <TagFilter
              selectedTagIds={selectedTagIds}
              onTagsChange={setSelectedTagIds}
            />
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={sortMode}
              onValueChange={(value) => setSortMode(value as 'date' | 'topological' | 'reverse-topological')}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">
                  <div className="flex items-center gap-2">
                    <span>📅 By Date</span>
                  </div>
                </SelectItem>
                <SelectItem value="topological">
                  <div className="flex items-center gap-2">
                    <span>🔀 Parents First</span>
                  </div>
                </SelectItem>
                <SelectItem value="reverse-topological">
                  <div className="flex items-center gap-2">
                    <span>🔀 Children First</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => {
                if (value) setViewMode(value as 'kanban' | 'table');
              }}
              className="border rounded-md p-0.5"
            >
              <ToggleGroupItem value="kanban" className="h-7 px-2">
                <LayoutGrid className="h-3.5 w-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="table" className="h-7 px-2">
                <Table className="h-3.5 w-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {viewMode === 'kanban' ? (
            <TaskKanbanBoard
              tasks={groupedFilteredTasks}
              onTaskClick={handleViewTaskDetails}
              onDragEnd={handleDragEnd}
              selectedTaskId={taskId}
              showProjectBadge={true}
              projectsById={projectsById}
            />
          ) : (
            <TaskTableView
              tasks={filteredTasks}
              onTaskClick={handleViewTaskDetails}
              selectedTaskId={taskId}
              showProjectColumn={true}
              projectsById={projectsById}
            />
          )}
        </div>
      </div>
    );

  return (
    <ExecutionProcessesProvider>
      <ClickedElementsProvider>
        <ReviewProvider>
          <div className="h-screen flex flex-col">
            <div className="border-b px-4 py-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>All Tasks</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex-1 overflow-hidden">{kanbanContent}</div>
          </div>
        </ReviewProvider>
      </ClickedElementsProvider>
    </ExecutionProcessesProvider>
  );
}
