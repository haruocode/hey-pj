import type { IsoDate } from '../shared/units';

// メンバー個人の休日（有給・私用・個人の予定など）。
// 祝日/会社休日（holidays）が全員に効くのに対し、これは特定メンバーだけを
// その暦日に稼働 0 とする（docs/design.md §4.2）。スケジューリングエンジンは
// memberId + date のみに関心を持つ（id/name は表示・管理用）。
export interface MemberHoliday {
  id: string;
  projectId: string;
  memberId: string;
  date: IsoDate;
  name: string;
}
