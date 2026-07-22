import { describe, it, expect } from 'vitest';
import { InMemoryProjectRepository } from '../infrastructure/repositories/InMemoryProjectRepository';
import type { ProjectSeed } from '../infrastructure/repositories/InMemoryProjectRepository';
import { updateProjectSettings } from './update-project/updateProjectSettings';
import { updateMemberSettings } from './update-member/updateMemberSettings';
import { getProjectView } from './get-project-view/getProjectView';
import type { Project } from '../domain/project/Project';
import type { Task } from '../domain/task/Task';
import type { Member } from '../domain/member/Member';
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

describe('updateProjectSettings', () => {
  it('開始日を変更するとスケジュールがずれる', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(480) })] }),
    );
    // 月(08-03) → 火(08-04) 開始に変更
    const result = await updateProjectSettings(repo, {
      projectId: 'p1',
      patch: { startDate: isoDate('2026-08-04') },
    });
    expect(result.scheduledTasks[0]!.plannedStartDate).toBe('2026-08-04');
    expect(result.scheduledTasks[0]!.plannedEndDate).toBe('2026-08-04');
  });

  it('名前の変更がビューに反映される（再計算は結果に影響しない）', async () => {
    const repo = new InMemoryProjectRepository(seed());
    await updateProjectSettings(repo, { projectId: 'p1', patch: { name: '新名称' } });
    const view = await getProjectView(repo, 'p1');
    expect(view.project.name).toBe('新名称');
  });

  it('開始日が週末なら最初の稼働日に送られる', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(480) })] }),
    );
    // 土(08-08)開始 → 実際の割り当ては月(08-10)から
    const result = await updateProjectSettings(repo, {
      projectId: 'p1',
      patch: { startDate: isoDate('2026-08-08') },
    });
    expect(result.scheduledTasks[0]!.plannedStartDate).toBe('2026-08-10');
  });
});

describe('updateMemberSettings', () => {
  it('稼働時間を減らすとタスクが長くなる', async () => {
    const repo = new InMemoryProjectRepository(
      seed({ tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(480) })] }),
    );
    // 伊藤のキャパを 480→240 に半減 → 480分は2日に伸びる
    const result = await updateMemberSettings(repo, {
      projectId: 'p1',
      memberId: 'ito',
      patch: { dailyCapacityMinutes: minutes(240) },
    });
    expect(result.scheduledTasks[0]!.dailyAllocations).toEqual([
      { date: '2026-08-03', minutes: 240 },
      { date: '2026-08-04', minutes: 240 },
    ]);
  });
});
