import type { ProjectRepository } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

export interface DeleteTaskCommand {
  projectId: string;
  taskId: string;
}

// タスク削除。子タスクを持つ親タスクは削除できない（先に子を削除させる）。
// 削除後は当該プロジェクトのスケジュールを再計算する。
export async function deleteTask(
  repo: ProjectRepository,
  cmd: DeleteTaskCommand,
): Promise<ScheduleResult> {
  const input = await repo.loadSchedulingInput(cmd.projectId);
  const target = input.tasks.find((t) => t.id === cmd.taskId);
  if (!target) throw new Error(`Task not found: ${cmd.taskId}`);

  const hasChildren = input.tasks.some((t) => t.parentTaskId === cmd.taskId);
  if (hasChildren) {
    throw new Error('子タスクを持つタスクは削除できません。先に子タスクを削除してください。');
  }

  await repo.deleteTask(cmd.taskId);
  return recalculateSchedule(repo, cmd.projectId);
}
