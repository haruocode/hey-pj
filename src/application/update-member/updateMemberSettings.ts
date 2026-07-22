import type { ProjectRepository, MemberPatch } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

export interface UpdateMemberCommand {
  projectId: string;
  memberId: string;
  patch: MemberPatch;
}

// メンバー設定の更新（稼働時間など）。稼働キャパは実効可用分の基礎なので、
// 更新後に当該プロジェクトのスケジュールを再計算する（docs/design.md §23）。
export async function updateMemberSettings(
  repo: ProjectRepository,
  cmd: UpdateMemberCommand,
): Promise<ScheduleResult> {
  await repo.updateMember(cmd.memberId, cmd.patch);
  return recalculateSchedule(repo, cmd.projectId);
}
