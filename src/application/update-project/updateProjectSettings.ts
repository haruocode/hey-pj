import type { ProjectRepository, ProjectPatch } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

export interface UpdateProjectCommand {
  projectId: string;
  patch: ProjectPatch;
}

// プロジェクト設定の更新（名前・開始日・タイムゾーン等）。
// 開始日/タイムゾーンはスケジューリング入力なので、更新後に再計算する（docs/design.md §23, §43）。
export async function updateProjectSettings(
  repo: ProjectRepository,
  cmd: UpdateProjectCommand,
): Promise<ScheduleResult> {
  await repo.updateProject(cmd.projectId, cmd.patch);
  return recalculateSchedule(repo, cmd.projectId);
}
