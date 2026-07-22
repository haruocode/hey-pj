import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { D1ProjectRepository } from '../infrastructure/repositories/D1ProjectRepository';
import { createTask } from '../application/create-task/createTask';
import { assignMember } from '../application/assign-member/assignMember';
import type { AssignMemberCommand } from '../application/assign-member/assignMember';
import { reorderTask } from '../application/reorder-task/reorderTask';
import type { ReorderTaskCommand } from '../application/reorder-task/reorderTask';
import { recalculateSchedule } from '../application/recalculate-schedule/recalculateSchedule';
import { getSchedule } from '../application/get-schedule/getSchedule';
import type { Task } from '../domain/task/Task';
import type { ScheduleResult } from '../domain/scheduling/types';

// プロジェクトごとに 1 インスタンス（docs/design.md §36）。
// スケジューリングのロジックは埋め込まず、アプリ層ユースケース（＝エンジン）を呼ぶ調整レイヤー。
// 再計算を直列化し、同時編集でも競合状態が起きないようにする。
export class ProjectScheduler extends DurableObject<Env> {
  private readonly repo: D1ProjectRepository;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.repo = new D1ProjectRepository(env.DB);
  }

  // 直前の処理の完了を待ってから実行することで、再計算を直列化する。
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  createTask(task: Task): Promise<ScheduleResult> {
    return this.serialize(() => createTask(this.repo, task));
  }

  assignMember(cmd: AssignMemberCommand): Promise<ScheduleResult> {
    return this.serialize(() => assignMember(this.repo, cmd));
  }

  reorderTask(cmd: ReorderTaskCommand): Promise<ScheduleResult> {
    return this.serialize(() => reorderTask(this.repo, cmd));
  }

  recalculate(projectId: string): Promise<ScheduleResult> {
    return this.serialize(() => recalculateSchedule(this.repo, projectId));
  }

  getSchedule(projectId: string): Promise<ScheduleResult> {
    return this.serialize(() => getSchedule(this.repo, projectId));
  }
}
