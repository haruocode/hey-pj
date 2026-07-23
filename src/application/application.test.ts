import { describe, it, expect } from 'vitest';
import { InMemoryProjectRepository } from '../infrastructure/repositories/InMemoryProjectRepository';
import type { ProjectSeed } from '../infrastructure/repositories/InMemoryProjectRepository';
import { createTask } from './create-task/createTask';
import { assignMember } from './assign-member/assignMember';
import { reorderTask } from './reorder-task/reorderTask';
import { deleteTask } from './delete-task/deleteTask';
import { recalculateSchedule } from './recalculate-schedule/recalculateSchedule';
import type { Project } from '../domain/project/Project';
import type { Task } from '../domain/task/Task';
import type { Member } from '../domain/member/Member';
import type { TaskDependency } from '../domain/task/Dependency';
import { minutes, isoDate } from '../domain/shared/units';

const PROJECT: Project = {
  id: 'p1',
  name: '顧客管理システム フェーズ2',
  description: '',
  startDate: isoDate('2026-08-03'), // 月
  timezone: 'Asia/Tokyo',
  defaultWorkdayMinutes: minutes(480),
};

const ITO: Member = { id: 'ito', workspaceId: 'w1', name: '伊藤', dailyCapacityMinutes: minutes(480) };
const YAMADA: Member = { id: 'yamada', workspaceId: 'w1', name: '山田', dailyCapacityMinutes: minutes(480) };

function makeTask(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    projectId: 'p1',
    phaseId: null,
    parentTaskId: null,
    title: partial.id,
    description: '',
    estimatedMinutes: minutes(0),
    actualMinutes: minutes(0),
    assigneeId: 'ito',
    sortOrder: 1,
    status: 'not_started',
    ...partial,
  };
}

function seed(overrides: Partial<ProjectSeed> = {}): ProjectSeed {
  return { project: PROJECT, members: [ITO, YAMADA], ...overrides };
}

describe('createTask', () => {
  it('タスクを追加し、スケジュールを再計算して返す', async () => {
    const repo = new InMemoryProjectRepository(seed());
    const result = await createTask(repo, makeTask({ id: 't1', estimatedMinutes: minutes(480) }));
    expect(result.conflicts).toEqual([]);
    expect(result.scheduledTasks[0]!.plannedEndDate).toBe('2026-08-03');
    // 保存結果と返り値が一致
    expect(repo.getLastResult()).toEqual(result);
  });
});

describe('assignMember', () => {
  it('担当者変更で担当者のカレンダーに追従する', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', assigneeId: 'ito', estimatedMinutes: minutes(480) })] }),
    );
    // 山田に付け替えても 480分/日 なので完了日は同じだが、割り当て先メンバーが変わる。
    const result = await assignMember(repo, { projectId: 'p1', taskId: 't1', assigneeId: 'yamada' });
    expect(result.conflicts).toEqual([]);
    expect(result.scheduledTasks[0]!.plannedEndDate).toBe('2026-08-03');
  });

  it('担当者を外すと unassigned_task 競合', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(60) })] }),
    );
    const result = await assignMember(repo, { projectId: 'p1', taskId: 't1', assigneeId: null });
    expect(result.conflicts).toEqual([{ kind: 'unassigned_task', taskId: 't1' }]);
  });
});

describe('reorderTask', () => {
  it('並び替えでスケジュールが自動追従する', async () => {
    // 依存なしの同一担当2タスク。並び順を入れ替えると、先に来たタスクが先に月曜を消費する。
    const tasks: Task[] = [
      makeTask({ id: 'a', estimatedMinutes: minutes(480), sortOrder: 0 }),
      makeTask({ id: 'b', estimatedMinutes: minutes(480), sortOrder: 1 }),
    ];
    const repo = new InMemoryProjectRepository(seed({ tasks }));

    const before = await recalculateSchedule(repo, 'p1');
    expect(before.scheduledTasks.find((t) => t.taskId === 'a')!.plannedStartDate).toBe('2026-08-03');
    expect(before.scheduledTasks.find((t) => t.taskId === 'b')!.plannedStartDate).toBe('2026-08-04');

    // b を先頭にする → b が月曜、a が火曜
    const after = await reorderTask(repo, { projectId: 'p1', orderedTaskIds: ['b', 'a'] });
    expect(after.scheduledTasks.find((t) => t.taskId === 'b')!.plannedStartDate).toBe('2026-08-03');
    expect(after.scheduledTasks.find((t) => t.taskId === 'a')!.plannedStartDate).toBe('2026-08-04');
  });
});

describe('deleteTask', () => {
  it('タスクを削除し、残りのスケジュールを再計算して返す', async () => {
    const tasks: Task[] = [
      makeTask({ id: 'a', estimatedMinutes: minutes(480), sortOrder: 0 }),
      makeTask({ id: 'b', estimatedMinutes: minutes(480), sortOrder: 1 }),
    ];
    const repo = new InMemoryProjectRepository(seed({ tasks }));
    // a を削除 → b が月曜開始に繰り上がる
    const result = await deleteTask(repo, { projectId: 'p1', taskId: 'a' });
    expect(result.scheduledTasks.map((t) => t.taskId)).toEqual(['b']);
    expect(result.scheduledTasks[0]!.plannedStartDate).toBe('2026-08-03');
  });

  it('子タスクを持つ親タスクは削除できない', async () => {
    const tasks: Task[] = [
      makeTask({ id: 'parent', estimatedMinutes: minutes(0), sortOrder: 0 }),
      makeTask({ id: 'child', parentTaskId: 'parent', estimatedMinutes: minutes(480), sortOrder: 1 }),
    ];
    const repo = new InMemoryProjectRepository(seed({ tasks }));
    await expect(deleteTask(repo, { projectId: 'p1', taskId: 'parent' })).rejects.toThrow(
      /子タスク/,
    );
  });

  it('存在しないタスクの削除はエラー', async () => {
    const repo = new InMemoryProjectRepository(seed({ tasks: [] }));
    await expect(deleteTask(repo, { projectId: 'p1', taskId: 'nope' })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('recalculateSchedule — 入力変化への追従', () => {
  it('依存タスク追加後も後続が先行完了後に開始する', async () => {
    const repo = new InMemoryProjectRepository(
      seed({
        tasks: [
          makeTask({ id: 'dev', estimatedMinutes: minutes(480), sortOrder: 0 }),
          makeTask({ id: 'ut', estimatedMinutes: minutes(240), sortOrder: 1 }),
        ],
        dependencies: [
          { id: 'd1', predecessorTaskId: 'dev', successorTaskId: 'ut', type: 'FS' } as TaskDependency,
        ],
      }),
    );
    const result = await recalculateSchedule(repo, 'p1');
    const ut = result.scheduledTasks.find((t) => t.taskId === 'ut')!;
    expect(ut.plannedStartDate).toBe('2026-08-04'); // dev が月曜を使い切るので火曜開始
  });
});
