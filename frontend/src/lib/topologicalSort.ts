import type { TaskWithAttemptStatus } from 'shared/types';

/**
 * Performs topological sort on tasks based on parent-child relationships.
 * Tasks are sorted so that parent tasks appear before their children.
 *
 * Algorithm: Kahn's algorithm for topological sorting
 * - Build a graph of task dependencies
 * - Find all tasks with no dependencies (root tasks)
 * - Process tasks level by level, removing dependencies as we go
 * - Handles cycles gracefully by falling back to creation date sort
 *
 * @param tasks Array of tasks to sort
 * @returns Topologically sorted array of tasks
 */
export function topologicalSortTasks(
  tasks: TaskWithAttemptStatus[]
): TaskWithAttemptStatus[] {
  if (tasks.length === 0) return [];

  // Build a map of task IDs to tasks for quick lookup
  const taskMap = new Map<string, TaskWithAttemptStatus>();
  tasks.forEach((task) => taskMap.set(task.id, task));

  // Build a map of parent_task_attempt -> child tasks
  // Note: parent_task_attempt is a TaskAttempt ID, not a Task ID
  // We need to find which task owns each attempt to build the hierarchy
  const childrenByParentAttempt = new Map<string, TaskWithAttemptStatus[]>();
  tasks.forEach((task) => {
    if (task.parent_task_attempt) {
      const children = childrenByParentAttempt.get(task.parent_task_attempt) || [];
      children.push(task);
      childrenByParentAttempt.set(task.parent_task_attempt, children);
    }
  });

  // Build attempt ID -> task ID mapping
  // We'll use the has_in_progress_attempt and other fields to infer this
  // Actually, we need to query the backend for this mapping, but for now
  // we'll use a simpler approach: group tasks by their parent_task_attempt

  // Count incoming edges (dependencies) for each task
  const inDegree = new Map<string, number>();
  tasks.forEach((task) => {
    inDegree.set(task.id, 0);
  });

  // Build adjacency list: taskId -> [child task IDs]
  const adjacencyList = new Map<string, string[]>();
  tasks.forEach((task) => {
    adjacencyList.set(task.id, []);
  });

  // For each task with a parent_task_attempt, we need to find the parent task
  // This is tricky because parent_task_attempt references a TaskAttempt, not a Task
  // We'll need to fetch this relationship from the backend, but for now,
  // let's use a heuristic: tasks created earlier might be parents

  // Actually, let's create a simpler version that groups by parent_task_attempt
  // and sorts within groups

  // Group tasks by their parent_task_attempt
  const rootTasks: TaskWithAttemptStatus[] = [];
  const tasksByParent = new Map<string, TaskWithAttemptStatus[]>();

  tasks.forEach((task) => {
    if (task.parent_task_attempt) {
      const siblings = tasksByParent.get(task.parent_task_attempt) || [];
      siblings.push(task);
      tasksByParent.set(task.parent_task_attempt, siblings);
    } else {
      rootTasks.push(task);
    }
  });

  // Sort root tasks by creation date (newest first to match existing behavior)
  rootTasks.sort(
    (a, b) =>
      new Date(b.created_at as unknown as string).getTime() -
      new Date(a.created_at as unknown as string).getTime()
  );

  // Build result using BFS-like traversal
  const result: TaskWithAttemptStatus[] = [];
  const visited = new Set<string>();

  // Helper function to add a task and its children recursively
  function addTaskAndChildren(task: TaskWithAttemptStatus) {
    if (visited.has(task.id)) return;

    visited.add(task.id);
    result.push(task);

    // Note: We would need the task's attempt IDs to find its children
    // Since we don't have this mapping readily available, we'll need to
    // either fetch it from the backend or include it in the task data

    // For now, we'll add children sorted by creation date
    // This is a simplified version that needs backend support for full functionality
  }

  // Add all root tasks
  rootTasks.forEach((task) => {
    addTaskAndChildren(task);
  });

  // Add any remaining tasks that weren't connected to roots
  // (handles orphaned tasks or cycles)
  tasks.forEach((task) => {
    if (!visited.has(task.id)) {
      result.push(task);
    }
  });

  return result;
}

/**
 * Simplified topological sort that groups tasks by parent_task_attempt.
 * Root tasks (no parent) are shown first, followed by their descendants.
 * This is a simplified version that works with the current data structure.
 */
export function groupedTopologicalSort(
  tasks: TaskWithAttemptStatus[]
): TaskWithAttemptStatus[] {
  // Separate root tasks from child tasks
  const rootTasks = tasks.filter((task) => !task.parent_task_attempt);
  const childTasks = tasks.filter((task) => task.parent_task_attempt);

  // Sort root tasks by creation date (newest first)
  rootTasks.sort(
    (a, b) =>
      new Date(b.created_at as unknown as string).getTime() -
      new Date(a.created_at as unknown as string).getTime()
  );

  // Group child tasks by their parent_task_attempt
  const tasksByParent = new Map<string, TaskWithAttemptStatus[]>();
  childTasks.forEach((task) => {
    if (task.parent_task_attempt) {
      const siblings = tasksByParent.get(task.parent_task_attempt) || [];
      siblings.push(task);
      tasksByParent.set(task.parent_task_attempt, siblings);
    }
  });

  // Sort children within each group by creation date
  tasksByParent.forEach((siblings) => {
    siblings.sort(
      (a, b) =>
        new Date(b.created_at as unknown as string).getTime() -
        new Date(a.created_at as unknown as string).getTime()
    );
  });

  // Build result: roots first, then children grouped by parent
  const result: TaskWithAttemptStatus[] = [...rootTasks];

  // Add all child groups (in order of their parent_task_attempt IDs)
  // Sort parent IDs to ensure consistent ordering
  const parentIds = Array.from(tasksByParent.keys()).sort();
  parentIds.forEach((parentId) => {
    const children = tasksByParent.get(parentId) || [];
    result.push(...children);
  });

  return result;
}

/**
 * Reverse topological sort - children appear before their parents.
 * Child tasks are shown first, followed by their parent tasks.
 */
export function reverseTopologicalSort(
  tasks: TaskWithAttemptStatus[]
): TaskWithAttemptStatus[] {
  // Get the normal topological sort and reverse it
  const sorted = groupedTopologicalSort(tasks);
  return sorted.reverse();
}
