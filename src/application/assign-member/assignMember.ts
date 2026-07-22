import type { ProjectRepository } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

export interface AssignMemberCommand {
  projectId: string;
  taskId: string;
  assigneeId: string | null;
}

// 担当者変更ユースケース。変更後にスケジュールを再計算する（docs/design.md §23）。
export async function assignMember(
  repo: ProjectRepository,
  cmd: AssignMemberCommand,
): Promise<ScheduleResult> {
  await repo.updateTaskAssignee(cmd.taskId, cmd.assigneeId);
  return recalculateSchedule(repo, cmd.projectId);
}
