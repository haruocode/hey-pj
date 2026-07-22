import { describe, it, expect } from 'vitest';
import { resolveDependencyOrder } from './DependencyResolver';
import type { OrderableTask } from './DependencyResolver';
import type { TaskDependency } from '../task/Dependency';

function dep(pred: string, succ: string): TaskDependency {
  return { id: `${pred}->${succ}`, predecessorTaskId: pred, successorTaskId: succ, type: 'FS' };
}

describe('resolveDependencyOrder', () => {
  it('依存がなければ sortOrder 順', () => {
    const tasks: OrderableTask[] = [
      { id: 'b', sortOrder: 2 },
      { id: 'a', sortOrder: 1 },
      { id: 'c', sortOrder: 3 },
    ];
    const result = resolveDependencyOrder(tasks, []);
    expect(result).toEqual({ ok: true, order: ['a', 'b', 'c'] });
  });

  it('先行タスクが後続より前に来る', () => {
    // 開発(dev) → 単体テスト(ut)。sortOrder は逆でも依存が優先される。
    const tasks: OrderableTask[] = [
      { id: 'ut', sortOrder: 1 },
      { id: 'dev', sortOrder: 2 },
    ];
    const result = resolveDependencyOrder(tasks, [dep('dev', 'ut')]);
    expect(result).toEqual({ ok: true, order: ['dev', 'ut'] });
  });

  it('複数依存でも順序が保たれる', () => {
    const tasks: OrderableTask[] = [
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
      { id: 'c', sortOrder: 3 },
    ];
    // a→c, b→c
    const result = resolveDependencyOrder(tasks, [dep('a', 'c'), dep('b', 'c')]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.indexOf('c')).toBe(2);
      expect(result.order.indexOf('a')).toBeLessThan(result.order.indexOf('c'));
      expect(result.order.indexOf('b')).toBeLessThan(result.order.indexOf('c'));
    }
  });

  it('循環依存を検出する', () => {
    const tasks: OrderableTask[] = [
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
      { id: 'c', sortOrder: 3 },
    ];
    // a→b→c→a
    const result = resolveDependencyOrder(tasks, [dep('a', 'b'), dep('b', 'c'), dep('c', 'a')]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 循環に含まれるノードが返る（先頭と末尾が一致する閉路）
      expect(result.cycle.length).toBeGreaterThanOrEqual(2);
      expect(result.cycle[0]).toBe(result.cycle[result.cycle.length - 1]);
      expect(new Set(result.cycle)).toEqual(new Set(['a', 'b', 'c']));
    }
  });

  it('未知タスクへの依存は無視する', () => {
    const tasks: OrderableTask[] = [{ id: 'a', sortOrder: 1 }];
    const result = resolveDependencyOrder(tasks, [dep('a', 'ghost')]);
    expect(result).toEqual({ ok: true, order: ['a'] });
  });
});
