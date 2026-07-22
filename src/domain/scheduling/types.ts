import type { Task } from '../task/Task';
import type { TaskDependency } from '../task/Dependency';
import type { Member } from '../member/Member';
import type { CalendarBlock } from '../calendar/CalendarBlock';
import type { RecurringMeeting } from '../calendar/RecurringMeeting';
import type { IsoDate, Minutes } from '../shared/units';

// スケジューリングエンジンの入出力（docs/design.md §4.1）。
// エンジンは純粋・決定論的。同じ入力からは常に同じ出力を返す。
export interface SchedulingInput {
  project: {
    startDate: IsoDate;
    timezone: string;
    defaultWorkdayMinutes: Minutes;
  };
  tasks: readonly Task[]; // sortOrder 順・階層込み
  dependencies: readonly TaskDependency[];
  members: readonly Member[];
  calendarBlocks: readonly CalendarBlock[]; // 祝日・休暇・出張などの単発ブロック
  recurringMeetings: readonly RecurringMeeting[]; // 定例会議
  holidays: readonly IsoDate[]; // 日本の祝日 + 会社休日
  horizon: { from: IsoDate; to: IsoDate }; // 計算対象期間（打ち切りの範囲）
}

export interface DailyAllocation {
  date: IsoDate;
  minutes: Minutes;
}

// 計画開始/終了は日単位（IsoDate）。現モデルは稼働開始時刻を持たないため、
// 時刻粒度の割り付けは将来（日内レイアウト導入時）に精緻化する（docs/design.md §4.1 の注記参照）。
export interface ScheduledTask {
  taskId: string;
  plannedStartDate: IsoDate;
  plannedEndDate: IsoDate;
  dailyAllocations: readonly DailyAllocation[];
}

export type Conflict =
  | { kind: 'cyclic_dependency'; taskIds: string[] }
  | { kind: 'unassigned_task'; taskId: string }
  | { kind: 'capacity_exhausted'; taskId: string } // horizon 内に割り当てきれない
  | { kind: 'resource_overallocation'; memberId: string; date: IsoDate; over: Minutes }
  | { kind: 'assigned_on_full_leave'; taskId: string; date: IsoDate };

export interface ScheduleResult {
  scheduledTasks: readonly ScheduledTask[];
  projectEndDate: IsoDate | null;
  conflicts: readonly Conflict[];
}
