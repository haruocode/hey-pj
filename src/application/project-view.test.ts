import { describe, it, expect } from 'vitest';
import { InMemoryProjectRepository } from '../infrastructure/repositories/InMemoryProjectRepository';
import type { ProjectSeed } from '../infrastructure/repositories/InMemoryProjectRepository';
import { getProjectView } from './get-project-view/getProjectView';
import { updateTask } from './update-task/updateTask';
import { createTask } from './create-task/createTask';
import type { Project } from '../domain/project/Project';
import type { Task } from '../domain/task/Task';
import type { Member } from '../domain/member/Member';
import { minutes, isoDate } from '../domain/shared/units';

const PROJECT: Project = {
  id: 'p1',
  name: '顧客管理システム フェーズ2',
  description: '',
  startDate: isoDate('2026-08-03'),
  timezone: 'Asia/Tokyo',
  defaultWorkdayMinutes: minutes(480),
};
const ITO: Member = { id: 'ito', workspaceId: 'w1', name: '伊藤', dailyCapacityMinutes: minutes(480) };

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
  return { project: PROJECT, members: [ITO], ...overrides };
}

describe('getProjectView', () => {
  it('入力（タスク）と計算値（計画日）をまとめて返す', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', title: '画面A 開発', estimatedMinutes: minutes(480) })] }),
    );
    const view = await getProjectView(repo, 'p1');

    expect(view.project.name).toBe('顧客管理システム フェーズ2');
    expect(view.members).toEqual([{ id: 'ito', name: '伊藤', dailyCapacityMinutes: 480 }]);
    expect(view.tasks).toHaveLength(1);
    const t = view.tasks[0]!;
    expect(t.title).toBe('画面A 開発');
    expect(t.estimatedMinutes).toBe(480);
    expect(t.plannedStartDate).toBe('2026-08-03'); // 計算値が付く
    expect(t.plannedEndDate).toBe('2026-08-03');
    expect(view.projectEndDate).toBe('2026-08-03');
  });

  it('sortOrder 昇順で返す', async () => {
    const repo = new InMemoryProjectRepository(
      seed({
        tasks: [
          makeTask({ id: 'b', sortOrder: 2, estimatedMinutes: minutes(60) }),
          makeTask({ id: 'a', sortOrder: 1, estimatedMinutes: minutes(60) }),
        ],
      }),
    );
    const view = await getProjectView(repo, 'p1');
    expect(view.tasks.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('競合（担当者未設定）も含めて返す', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', assigneeId: null, estimatedMinutes: minutes(60) })] }),
    );
    const view = await getProjectView(repo, 'p1');
    expect(view.conflicts).toEqual([{ kind: 'unassigned_task', taskId: 't1' }]);
    expect(view.tasks[0]!.plannedStartDate).toBeNull(); // 未スケジュール
  });
});

describe('updateTask', () => {
  it('見積変更でスケジュールが追従する', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(480) })] }),
    );
    // 480 → 960 に増やすと2日に伸びる
    const result = await updateTask(repo, {
      projectId: 'p1',
      taskId: 't1',
      patch: { estimatedMinutes: minutes(960) },
    });
    expect(result.scheduledTasks[0]!.plannedEndDate).toBe('2026-08-04'); // 月+火
  });
});

describe('createProject / addMember 経由の一連フロー', () => {
  it('空プロジェクトにタスク追加 → ビュー取得', async () => {
    const repo = new InMemoryProjectRepository(seed());
    await createTask(repo, makeTask({ id: 't1', estimatedMinutes: minutes(240) }));
    const view = await getProjectView(repo, 'p1');
    expect(view.tasks).toHaveLength(1);
    expect(view.tasks[0]!.plannedEndDate).toBe('2026-08-03');
  });
});
