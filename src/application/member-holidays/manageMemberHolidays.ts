import type { ProjectRepository } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import type { IsoDate } from '../../domain/shared/units';
import { recalculateSchedule } from '../recalculate-schedule/recalculateSchedule';

export interface AddMemberHolidayCommand {
  projectId: string;
  memberId: string;
  date: IsoDate;
  name?: string;
  id?: string;
}

export interface RemoveMemberHolidayCommand {
  projectId: string;
  holidayId: string;
}

// メンバー個人休日の追加。個人休日はその日のメンバー稼働を 0 にするため、
// 追加後に当該プロジェクトのスケジュールを再計算する（docs/design.md §23）。
export async function addMemberHoliday(
  repo: ProjectRepository,
  cmd: AddMemberHolidayCommand,
): Promise<ScheduleResult> {
  await repo.addMemberHoliday({
    id: cmd.id ?? crypto.randomUUID(),
    projectId: cmd.projectId,
    memberId: cmd.memberId,
    date: cmd.date,
    name: cmd.name ?? '',
  });
  return recalculateSchedule(repo, cmd.projectId);
}

// メンバー個人休日の削除。削除後に再計算する。
export async function removeMemberHoliday(
  repo: ProjectRepository,
  cmd: RemoveMemberHolidayCommand,
): Promise<ScheduleResult> {
  await repo.removeMemberHoliday(cmd.holidayId);
  return recalculateSchedule(repo, cmd.projectId);
}
