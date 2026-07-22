import type { ProjectRepository } from '../ports';
import type { Task } from '../../domain/task/Task';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

// タスク作成ユースケース。作成後にスケジュールを再計算し、新しいスケジュールを返す。
// これが HeyPJ! の核心：入力を変えればスケジュールが自動追従する。
export async function createTask(repo: ProjectRepository, task: Task): Promise<ScheduleResult> {
  await repo.insertTask(task);
  return recalculateSchedule(repo, task.projectId);
}
