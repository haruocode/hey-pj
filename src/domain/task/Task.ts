import type { Minutes } from '../shared/units';

export type TaskStatus = 'not_started' | 'in_progress' | 'done';

// タスクは作業の基本単位（docs/design.md §2.4）。
//
// planned_start_at / planned_end_at はスケジューリングエンジンの計算値であり、
// Task 本体には持たせない（論点A）。計算結果は ScheduleResult 側に分離する。
// 見積工数と実績工数は独立して保持し、見積を実績で上書きしない。
export interface Task {
  id: string;
  projectId: string;
  phaseId: string | null;
  parentTaskId: string | null; // 階層。WBS番号(1.1.1)は保持せず、階層と順序から導出する
  title: string;
  description: string;
  estimatedMinutes: Minutes;
  actualMinutes: Minutes; // 見積とは独立
  assigneeId: string | null;
  sortOrder: number; // 表示順。行順は自動的に依存順を意味しない
  status: TaskStatus;
}
