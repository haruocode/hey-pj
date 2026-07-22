import { describe, it, expect } from 'vitest';
import { calculateSchedule } from './SchedulingEngine';
import type { SchedulingInput } from './types';
import type { Task } from '../task/Task';
import type { TaskDependency } from '../task/Dependency';
import type { Member } from '../member/Member';
import type { CalendarBlock } from '../calendar/CalendarBlock';
import type { RecurringMeeting } from '../calendar/RecurringMeeting';
import { minutes, isoDate } from '../shared/units';
import type { IsoDateTime } from '../shared/units';

const ITO: Member = { id: 'ito', workspaceId: 'w1', name: '伊藤', dailyCapacityMinutes: minutes(480) };
const YAMADA: Member = { id: 'yamada', workspaceId: 'w1', name: '山田', dailyCapacityMinutes: minutes(480) };

function makeTask(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    projectId: 'p1',
    phaseId: null,
    parentTaskId: null,
    title: partial.id,
    description: '',
    estimatedMinutes: minutes(0),
    actualMinutes: minutes(0),
    assigneeId: 'ito',
    sortOrder: 1,
    status: 'not_started',
    ...partial,
  };
}

function dep(pred: string, succ: string): TaskDependency {
  return { id: `${pred}->${succ}`, predecessorTaskId: pred, successorTaskId: succ, type: 'FS' };
}

function buildInput(overrides: Partial<SchedulingInput>): SchedulingInput {
  return {
    project: { startDate: isoDate('2026-08-03'), timezone: 'Asia/Tokyo', defaultWorkdayMinutes: minutes(480) },
    tasks: [],
    dependencies: [],
    members: [ITO, YAMADA],
    calendarBlocks: [],
    recurringMeetings: [],
    holidays: [],
    horizon: { from: isoDate('2026-08-01'), to: isoDate('2026-12-31') },
    ...overrides,
  };
}

describe('calculateSchedule — 代表シナリオ', () => {
  it('960分 / キャパ480 / 毎日会議30分 → 450,450,60 の3日で完了', () => {
    const daily: RecurringMeeting = {
      id: 'mtg', projectId: 'p1', memberId: null, title: 'デイリー',
      frequency: 'daily', daysOfWeek: [], startTime: '11:00', endTime: '11:30',
    };
    const result = calculateSchedule(
      buildInput({
        tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(960) })],
        recurringMeetings: [daily],
      }),
    );
    expect(result.conflicts).toEqual([]);
    const st = result.scheduledTasks[0]!;
    expect(st.dailyAllocations).toEqual([
      { date: '2026-08-03', minutes: 450 }, // 月
      { date: '2026-08-04', minutes: 450 }, // 火
      { date: '2026-08-05', minutes: 60 }, // 水
    ]);
    expect(st.plannedStartDate).toBe('2026-08-03');
    expect(st.plannedEndDate).toBe('2026-08-05');
    expect(result.projectEndDate).toBe('2026-08-05');
  });
});

describe('calculateSchedule — カレンダー', () => {
  it('週末をスキップする', () => {
    // 金曜開始、960分、キャパ480 → 金480, (土日スキップ), 月480
    const result = calculateSchedule(
      buildInput({
        project: { startDate: isoDate('2026-08-07'), timezone: 'Asia/Tokyo', defaultWorkdayMinutes: minutes(480) },
        tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(960) })],
      }),
    );
    const st = result.scheduledTasks[0]!;
    expect(st.dailyAllocations).toEqual([
      { date: '2026-08-07', minutes: 480 }, // 金
      { date: '2026-08-10', minutes: 480 }, // 月（土日スキップ）
    ]);
    expect(st.plannedEndDate).toBe('2026-08-10');
  });

  it('祝日をスキップする', () => {
    const result = calculateSchedule(
      buildInput({
        tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(960) })],
        holidays: [isoDate('2026-08-04')], // 火曜を祝日に
      }),
    );
    const st = result.scheduledTasks[0]!;
    expect(st.dailyAllocations).toEqual([
      { date: '2026-08-03', minutes: 480 }, // 月
      { date: '2026-08-05', minutes: 480 }, // 水（火は祝日）
    ]);
  });

  it('終日休暇でスケジュールがずれる', () => {
    const leave: CalendarBlock = {
      id: 'lv', memberId: 'ito', projectId: 'p1', type: 'leave',
      startAt: '2026-08-04T00:00:00Z' as IsoDateTime, // 火 09:00 JST
      endAt: '2026-08-04T09:00:00Z' as IsoDateTime, // 火 18:00 JST
      title: '終日休暇',
    };
    const result = calculateSchedule(
      buildInput({
        tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(960) })],
        calendarBlocks: [leave],
      }),
    );
    const st = result.scheduledTasks[0]!;
    expect(st.dailyAllocations.map((a) => a.date)).toEqual(['2026-08-03', '2026-08-05']);
  });
});

describe('calculateSchedule — 依存関係', () => {
  it('Finish-to-Start: 後続は先行の完了後に開始する', () => {
    // dev 480分(月を使い切る) → ut 240分 は火曜開始
    const result = calculateSchedule(
      buildInput({
        tasks: [
          makeTask({ id: 'ut', estimatedMinutes: minutes(240), sortOrder: 1 }),
          makeTask({ id: 'dev', estimatedMinutes: minutes(480), sortOrder: 2 }),
        ],
        dependencies: [dep('dev', 'ut')],
      }),
    );
    expect(result.conflicts).toEqual([]);
    const dev = result.scheduledTasks.find((t) => t.taskId === 'dev')!;
    const ut = result.scheduledTasks.find((t) => t.taskId === 'ut')!;
    expect(dev.plannedEndDate).toBe('2026-08-03'); // 月
    expect(ut.plannedStartDate).toBe('2026-08-04'); // 火（月は満杯）
  });

  it('先行完了と同日の残キャパから後続を開始できる（§22）', () => {
    // dev 300分(月に余り180) → ut 120分 は同じ月曜の残180から開始
    const result = calculateSchedule(
      buildInput({
        tasks: [
          makeTask({ id: 'ut', estimatedMinutes: minutes(120), sortOrder: 1 }),
          makeTask({ id: 'dev', estimatedMinutes: minutes(300), sortOrder: 2 }),
        ],
        dependencies: [dep('dev', 'ut')],
      }),
    );
    const ut = result.scheduledTasks.find((t) => t.taskId === 'ut')!;
    expect(ut.dailyAllocations).toEqual([{ date: '2026-08-03', minutes: 120 }]);
  });

  it('循環依存を検出する', () => {
    const result = calculateSchedule(
      buildInput({
        tasks: [
          makeTask({ id: 'a', estimatedMinutes: minutes(60) }),
          makeTask({ id: 'b', estimatedMinutes: minutes(60) }),
        ],
        dependencies: [dep('a', 'b'), dep('b', 'a')],
      }),
    );
    expect(result.scheduledTasks).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.kind).toBe('cyclic_dependency');
  });
});

describe('calculateSchedule — リソースと競合', () => {
  it('同一メンバーの並行タスクはキャパを共有する（過剰割り当てしない）', () => {
    // 伊藤に 300分 + 300分 を同時付与。1日480なので月に480、火に120。
    const result = calculateSchedule(
      buildInput({
        tasks: [
          makeTask({ id: 'a', estimatedMinutes: minutes(300), sortOrder: 1 }),
          makeTask({ id: 'b', estimatedMinutes: minutes(300), sortOrder: 2 }),
        ],
      }),
    );
    const a = result.scheduledTasks.find((t) => t.taskId === 'a')!;
    const b = result.scheduledTasks.find((t) => t.taskId === 'b')!;
    expect(a.dailyAllocations).toEqual([{ date: '2026-08-03', minutes: 300 }]);
    // b は月の残180 + 火の120
    expect(b.dailyAllocations).toEqual([
      { date: '2026-08-03', minutes: 180 },
      { date: '2026-08-04', minutes: 120 },
    ]);
  });

  it('別メンバーは並行して稼働する', () => {
    const result = calculateSchedule(
      buildInput({
        tasks: [
          makeTask({ id: 'a', assigneeId: 'ito', estimatedMinutes: minutes(480) }),
          makeTask({ id: 'b', assigneeId: 'yamada', estimatedMinutes: minutes(480) }),
        ],
      }),
    );
    const a = result.scheduledTasks.find((t) => t.taskId === 'a')!;
    const b = result.scheduledTasks.find((t) => t.taskId === 'b')!;
    expect(a.plannedEndDate).toBe('2026-08-03');
    expect(b.plannedEndDate).toBe('2026-08-03'); // 別メンバーなので同日完了
  });

  it('担当者未設定は unassigned_task 競合', () => {
    const result = calculateSchedule(
      buildInput({
        tasks: [makeTask({ id: 't1', assigneeId: null, estimatedMinutes: minutes(60) })],
      }),
    );
    expect(result.scheduledTasks).toEqual([]);
    expect(result.conflicts).toEqual([{ kind: 'unassigned_task', taskId: 't1' }]);
  });

  it('horizon 内に収まらなければ capacity_exhausted', () => {
    const result = calculateSchedule(
      buildInput({
        tasks: [makeTask({ id: 't1', estimatedMinutes: minutes(4800) })],
        horizon: { from: isoDate('2026-08-03'), to: isoDate('2026-08-05') }, // 3日では足りない
      }),
    );
    expect(result.conflicts).toEqual([{ kind: 'capacity_exhausted', taskId: 't1' }]);
  });
});

describe('calculateSchedule — 決定論', () => {
  it('同じ入力からは常に同じ結果', () => {
    const build = (): SchedulingInput =>
      buildInput({
        tasks: [
          makeTask({ id: 'a', estimatedMinutes: minutes(300), sortOrder: 1 }),
          makeTask({ id: 'b', estimatedMinutes: minutes(700), sortOrder: 2 }),
        ],
        dependencies: [dep('a', 'b')],
      });
    expect(calculateSchedule(build())).toEqual(calculateSchedule(build()));
  });
});
