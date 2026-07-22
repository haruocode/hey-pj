import type { TaskDependency } from '../task/Dependency';

export interface OrderableTask {
  id: string;
  sortOrder: number; // 依存が同点のときの優先度（表示順）
}

export type DependencyOrder =
  | { ok: true; order: string[] }
  | { ok: false; cycle: string[] };

// Finish-to-Start 依存を尊重したトポロジカル順序を求める（docs/design.md §4.2）。
// 依存が並ぶ複数タスクの間では sortOrder（優先度）で決定論的に順序付けする。
// 行順は自動的に依存順を意味しない。依存は明示的な TaskDependency のみで表現される。
// 循環依存は黙って受け入れず、cycle として報告する。
export function resolveDependencyOrder(
  tasks: readonly OrderableTask[],
  dependencies: readonly TaskDependency[],
): DependencyOrder {
  const ids = new Set(tasks.map((t) => t.id));
  const sortOrderById = new Map(tasks.map((t) => [t.id, t.sortOrder]));

  // predecessor -> successor の隣接リスト（既知タスク間のみ）。
  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const t of tasks) {
    successors.set(t.id, []);
    indegree.set(t.id, 0);
  }
  for (const dep of dependencies) {
    if (!ids.has(dep.predecessorTaskId) || !ids.has(dep.successorTaskId)) continue;
    successors.get(dep.predecessorTaskId)!.push(dep.successorTaskId);
    indegree.set(dep.successorTaskId, (indegree.get(dep.successorTaskId) ?? 0) + 1);
  }

  const byPriority = (a: string, b: string): number => {
    const sa = sortOrderById.get(a) ?? 0;
    const sb = sortOrderById.get(b) ?? 0;
    return sa !== sb ? sa - sb : a < b ? -1 : a > b ? 1 : 0;
  };

  // Kahn のアルゴリズム。ready 集合は sortOrder で決定論的に取り出す。
  const ready = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  ready.sort(byPriority);

  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of successors.get(id) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, deg);
      if (deg === 0) {
        // 優先度順を保つよう挿入位置を決める。
        const insertAt = lowerBound(ready, next, byPriority);
        ready.splice(insertAt, 0, next);
      }
    }
  }

  if (order.length !== tasks.length) {
    return { ok: false, cycle: findCycle(tasks, successors) };
  }
  return { ok: true, order };
}

function lowerBound(sorted: string[], value: string, cmp: (a: string, b: string) => number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(sorted[mid]!, value) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// DFS で 1 つの循環を検出し、A→B→C→A の形で返す（報告用）。
function findCycle(tasks: readonly OrderableTask[], successors: Map<string, string[]>): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(tasks.map((t) => [t.id, WHITE]));
  const stack: string[] = [];

  const dfs = (node: string): string[] | null => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of successors.get(node) ?? []) {
      const c = color.get(next);
      if (c === GRAY) {
        const from = stack.indexOf(next);
        return [...stack.slice(from), next];
      }
      if (c === WHITE) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    color.set(node, BLACK);
    stack.pop();
    return null;
  };

  for (const t of tasks) {
    if (color.get(t.id) === WHITE) {
      const found = dfs(t.id);
      if (found) return found;
    }
  }
  return [];
}
