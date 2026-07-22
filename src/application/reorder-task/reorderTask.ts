import type { ProjectRepository } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

export interface ReorderTaskCommand {
  projectId: string;
  orderedTaskIds: string[]; // 新しい表示順（先頭が sortOrder 最小）
}

// タスク並び替えユースケース。並び替え後にスケジュールを再計算する（docs/design.md §9, §23）。
// ユーザーが開始日・終了日を手作業で書き直す必要はない。
export async function reorderTask(
  repo: ProjectRepository,
  cmd: ReorderTaskCommand,
): Promise<ScheduleResult> {
  await repo.reorderTasks(cmd.projectId, cmd.orderedTaskIds);
  return recalculateSchedule(repo, cmd.projectId);
}
