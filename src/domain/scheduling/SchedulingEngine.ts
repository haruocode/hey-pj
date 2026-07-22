import type { IsoDate } from '../shared/units';
import { minutes } from '../shared/units';
import { compareDates, nextDay } from '../shared/calendar-date';
import { ResourceCalendar } from '../calendar/ResourceCalendar';
import { resolveDependencyOrder } from './DependencyResolver';
import type {
  Conflict,
  DailyAllocation,
  ScheduleResult,
  ScheduledTask,
  SchedulingInput,
} from './types';

// スケジューリングエンジン（docs/design.md §4, §22）。
//
// 依存順に各タスクを処理し、担当者の実効可用分を消費しながら
// 計画開始日 / 計画終了日 / 日次割り当てを確定する。
// メンバーの残キャパシティは「台帳(ledger)」で追跡し、過剰割り当てを防ぐ。
// これにより、同一メンバーの連続タスクや、先行タスク完了後の当日残時間の利用も自然に扱える。
export function calculateSchedule(input: SchedulingInput): ScheduleResult {
  const conflicts: Conflict[] = [];
  const calendar = new ResourceCalendar({
    timezone: input.project.timezone,
    members: input.members,
    holidays: input.holidays,
    recurringMeetings: input.recurringMeetings,
    calendarBlocks: input.calendarBlocks,
  });

  // スケジュール対象は葉タスク（他タスクの親でない）かつ見積 > 0。
  // 親タスクの集計は表示側の関心事（docs/design.md §30）でありエンジンは扱わない。
  const parentIds = new Set(
    input.tasks.map((t) => t.parentTaskId).filter((id): id is string => id !== null),
  );
  const schedulable = input.tasks.filter(
    (t) => !parentIds.has(t.id) && (t.estimatedMinutes as number) > 0,
  );

  const orderResult = resolveDependencyOrder(
    schedulable.map((t) => ({ id: t.id, sortOrder: t.sortOrder })),
    input.dependencies,
  );
  if (!orderResult.ok) {
    // 循環依存はスケジュール計算前の明確なエラー。黙って受け入れない。
    return {
      scheduledTasks: [],
      projectEndDate: null,
      conflicts: [{ kind: 'cyclic_dependency', taskIds: orderResult.cycle }],
    };
  }

  const taskById = new Map(schedulable.map((t) => [t.id, t]));

  // 先行タスク（既知タスク間のみ）。
  const predecessorsOf = new Map<string, string[]>();
  for (const dep of input.dependencies) {
    if (!taskById.has(dep.predecessorTaskId) || !taskById.has(dep.successorTaskId)) continue;
    const list = predecessorsOf.get(dep.successorTaskId) ?? [];
    list.push(dep.predecessorTaskId);
    predecessorsOf.set(dep.successorTaskId, list);
  }

  // リソース台帳: memberId -> (date -> 残キャパ分)。初回アクセス時に calendar から遅延初期化。
  const ledger = new Map<string, Map<string, number>>();
  const remainingMinutes = (memberId: string, date: IsoDate): number => {
    let perDate = ledger.get(memberId);
    if (!perDate) {
      perDate = new Map();
      ledger.set(memberId, perDate);
    }
    const cached = perDate.get(date);
    if (cached !== undefined) return cached;
    const initial = calendar.availableMinutes(memberId, date) as number;
    perDate.set(date, initial);
    return initial;
  };
  const consume = (memberId: string, date: IsoDate, amount: number): void => {
    const perDate = ledger.get(memberId)!;
    perDate.set(date, (perDate.get(date) ?? 0) - amount);
  };

  const scheduledById = new Map<string, ScheduledTask>();
  const scheduledTasks: ScheduledTask[] = [];

  for (const taskId of orderResult.order) {
    const task = taskById.get(taskId)!;
    if (task.assigneeId === null) {
      conflicts.push({ kind: 'unassigned_task', taskId });
      continue;
    }
    const memberId = task.assigneeId;

    // 計画開始 = max(プロジェクト開始, すべての先行タスクの計画終了日)。
    // 先行完了と同日でも、その日の残キャパから開始できる（docs/design.md §22）。
    let startDate: IsoDate = input.project.startDate;
    for (const predId of predecessorsOf.get(taskId) ?? []) {
      const pred = scheduledById.get(predId);
      if (pred && compareDates(pred.plannedEndDate, startDate) > 0) {
        startDate = pred.plannedEndDate;
      }
    }

    // 見積分を担当者の実効可用分にわたって消費する。
    let remainingEstimate = task.estimatedMinutes as number;
    const allocations: DailyAllocation[] = [];
    let planStart: IsoDate | null = null;
    let planEnd: IsoDate | null = null;
    let date = startDate;
    let exhausted = false;

    while (remainingEstimate > 0) {
      if (compareDates(date, input.horizon.to) > 0) {
        exhausted = true;
        break;
      }
      const avail = remainingMinutes(memberId, date);
      if (avail > 0) {
        const take = Math.min(avail, remainingEstimate);
        consume(memberId, date, take);
        allocations.push({ date, minutes: minutes(take) });
        if (planStart === null) planStart = date;
        planEnd = date;
        remainingEstimate -= take;
      }
      if (remainingEstimate > 0) date = nextDay(date);
    }

    if (exhausted || planStart === null || planEnd === null) {
      conflicts.push({ kind: 'capacity_exhausted', taskId });
      continue;
    }

    const scheduled: ScheduledTask = {
      taskId,
      plannedStartDate: planStart,
      plannedEndDate: planEnd,
      dailyAllocations: allocations,
    };
    scheduledById.set(taskId, scheduled);
    scheduledTasks.push(scheduled);
  }

  const projectEndDate = scheduledTasks.reduce<IsoDate | null>(
    (max, t) => (max === null || compareDates(t.plannedEndDate, max) > 0 ? t.plannedEndDate : max),
    null,
  );

  return { scheduledTasks, projectEndDate, conflicts };
}
