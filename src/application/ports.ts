import type { IsoDate, Minutes } from '../domain/shared/units';
import { addDays } from '../domain/shared/calendar-date';
import type { Task, TaskStatus } from '../domain/task/Task';
import type { Project } from '../domain/project/Project';
import type { Member } from '../domain/member/Member';
import type { ScheduleResult, SchedulingInput } from '../domain/scheduling/types';

// タスクの部分更新（インライン編集で使う編集可能フィールド）。
// planned_* は計算値なのでここには含めない。
export interface TaskPatch {
  title?: string;
  description?: string;
  estimatedMinutes?: Minutes;
  phaseId?: string | null;
  status?: TaskStatus;
}

// アプリケーション層が依存するリポジトリのポート（インターフェース）。
// D1 実装（infrastructure）と in-memory 実装（テスト用）を差し替え可能にする。
// これにより、スケジューリングのオーケストレーションは Cloudflare 非依存でテストできる。
export interface ProjectRepository {
  /** プロジェクトのスケジューリング入力一式を組み立てて返す。 */
  loadSchedulingInput(projectId: string): Promise<SchedulingInput>;
  /** 計算結果（計画日・日次割当）をキャッシュとして永続化する（洗い替え）。 */
  saveScheduleResult(projectId: string, result: ScheduleResult): Promise<void>;

  getProject(projectId: string): Promise<Project | null>;
  createProject(project: Project): Promise<void>;
  addMember(member: Member): Promise<void>;

  insertTask(task: Task): Promise<void>;
  updateTask(taskId: string, patch: TaskPatch): Promise<void>;
  updateTaskAssignee(taskId: string, assigneeId: string | null): Promise<void>;
  /** orderedTaskIds の並びで各タスクの sortOrder を 0..n-1 に更新する。 */
  reorderTasks(projectId: string, orderedTaskIds: string[]): Promise<void>;
}

/** スケジューリングの計算対象期間の既定値。プロジェクト開始日から約2年。 */
export const DEFAULT_HORIZON_DAYS = 730;

export function defaultHorizon(startDate: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: startDate, to: addDays(startDate, DEFAULT_HORIZON_DAYS) };
}
