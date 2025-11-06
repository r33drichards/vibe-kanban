import { memo } from 'react';
import type { TaskStatus, TaskWithAttemptStatus, Project } from 'shared/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { ActionsDropdown } from '@/components/ui/ActionsDropdown';
import { statusLabels } from '@/utils/status-labels';
import { cn } from '@/lib/utils';

type Task = TaskWithAttemptStatus;

interface TaskTableViewProps {
  tasks: Task[];
  onViewTaskDetails: (task: Task) => void;
  selectedTask?: Task;
  showProjectColumn?: boolean;
  projectsById?: Record<string, Project>;
}

function TaskTableView({
  tasks,
  onViewTaskDetails,
  selectedTask,
  showProjectColumn,
  projectsById,
}: TaskTableViewProps) {
  const getStatusBadgeColor = (status: TaskStatus) => {
    const colorMap: Record<TaskStatus, string> = {
      todo: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
      inprogress: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
      inreview: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
      done: 'bg-green-100 text-green-800 hover:bg-green-200',
      cancelled: 'bg-red-100 text-red-800 hover:bg-red-200',
    };
    return colorMap[status] || colorMap.todo;
  };

  return (
    <div className="w-full h-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={showProjectColumn ? "w-[30%]" : "w-[40%]"}>Title</TableHead>
            <TableHead className={showProjectColumn ? "w-[20%]" : "w-[30%]"}>Description</TableHead>
            {showProjectColumn && <TableHead className="w-[15%]">Project</TableHead>}
            <TableHead className="w-[12%]">Status</TableHead>
            <TableHead className="w-[12%]">Tags</TableHead>
            <TableHead className="w-[6%] text-center">Indicators</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow
              key={task.id}
              className={cn(
                'cursor-pointer',
                selectedTask?.id === task.id &&
                  'bg-accent/50 hover:bg-accent/60'
              )}
              onClick={() => onViewTaskDetails(task)}
            >
              <TableCell className="font-medium">
                <div className="line-clamp-2">{task.title}</div>
              </TableCell>
              <TableCell>
                <div className="line-clamp-2 text-sm text-muted-foreground">
                  {task.description
                    ? task.description.length > 100
                      ? `${task.description.substring(0, 100)}...`
                      : task.description
                    : '-'}
                </div>
              </TableCell>
              {showProjectColumn && (
                <TableCell>
                  {projectsById && projectsById[task.project_id] ? (
                    <Badge variant="outline" className="text-xs">
                      {projectsById[task.project_id].name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
              )}
              <TableCell>
                <Badge
                  variant="secondary"
                  className={cn('text-xs', getStatusBadgeColor(task.status))}
                >
                  {statusLabels[task.status]}
                </Badge>
              </TableCell>
              <TableCell>
                {task.tags && task.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {task.tags.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="text-xs px-1.5 py-0"
                      >
                        {tag.tag_name}
                      </Badge>
                    ))}
                    {task.tags.length > 2 && (
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 text-muted-foreground"
                      >
                        +{task.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-2">
                  {/* In Progress Spinner */}
                  {task.has_in_progress_attempt && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  )}
                  {/* Merged Indicator */}
                  {task.has_merged_attempt && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {/* Failed Indicator */}
                  {task.last_attempt_failed && !task.has_merged_attempt && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  {/* Actions Menu */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <ActionsDropdown task={task} />
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default memo(TaskTableView);
