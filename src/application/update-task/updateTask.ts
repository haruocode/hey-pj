import type { ProjectRepository, TaskPatch } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

export interface UpdateTaskCommand {
  projectId: string;
  taskId: string;
  patch: TaskPatch;
}

// タスク編集ユースケース（見積工数・タイトル・ステータス等）。
// 見積変更などスケジューリング入力が変わるため、更新後に再計算する（docs/design.md §23）。
export async function updateTask(
  repo: ProjectRepository,
  cmd: UpdateTaskCommand,
): Promise<ScheduleResult> {
  await repo.updateTask(cmd.taskId, cmd.patch);
  return recalculateSchedule(repo, cmd.projectId);
}
