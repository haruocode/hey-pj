import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { D1ProjectRepository } from '../infrastructure/repositories/D1ProjectRepository';
import { createTask } from '../application/create-task/createTask';
import { assignMember } from '../application/assign-member/assignMember';
import type { AssignMemberCommand } from '../application/assign-member/assignMember';
import { reorderTask } from '../application/reorder-task/reorderTask';
import type { ReorderTaskCommand } from '../application/reorder-task/reorderTask';
import { updateTask } from '../application/update-task/updateTask';
import type { UpdateTaskCommand } from '../application/update-task/updateTask';
import { deleteTask } from '../application/delete-task/deleteTask';
import type { DeleteTaskCommand } from '../application/delete-task/deleteTask';
import { updateProjectSettings } from '../application/update-project/updateProjectSettings';
import type { UpdateProjectCommand } from '../application/update-project/updateProjectSettings';
import { updateMemberSettings } from '../application/update-member/updateMemberSettings';
import type { UpdateMemberCommand } from '../application/update-member/updateMemberSettings';
import {
  addMemberHoliday,
  removeMemberHoliday,
} from '../application/member-holidays/manageMemberHolidays';
import type {
  AddMemberHolidayCommand,
  RemoveMemberHolidayCommand,
} from '../application/member-holidays/manageMemberHolidays';
import { recalculateSchedule } from '../application/recalculate-schedule/recalculateSchedule';
import { getSchedule } from '../application/get-schedule/getSchedule';
import { getProjectView } from '../application/get-project-view/getProjectView';
import type { ProjectView } from '../application/get-project-view/getProjectView';
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

  updateTask(cmd: UpdateTaskCommand): Promise<ScheduleResult> {
    return this.serialize(() => updateTask(this.repo, cmd));
  }

  deleteTask(cmd: DeleteTaskCommand): Promise<ScheduleResult> {
    return this.serialize(() => deleteTask(this.repo, cmd));
  }

  updateProject(cmd: UpdateProjectCommand): Promise<ScheduleResult> {
    return this.serialize(() => updateProjectSettings(this.repo, cmd));
  }

  updateMember(cmd: UpdateMemberCommand): Promise<ScheduleResult> {
    return this.serialize(() => updateMemberSettings(this.repo, cmd));
  }

  addMemberHoliday(cmd: AddMemberHolidayCommand): Promise<ScheduleResult> {
    return this.serialize(() => addMemberHoliday(this.repo, cmd));
  }

  removeMemberHoliday(cmd: RemoveMemberHolidayCommand): Promise<ScheduleResult> {
    return this.serialize(() => removeMemberHoliday(this.repo, cmd));
  }

  getProjectView(projectId: string): Promise<ProjectView> {
    return this.serialize(() => getProjectView(this.repo, projectId));
  }

  recalculate(projectId: string): Promise<ScheduleResult> {
    return this.serialize(() => recalculateSchedule(this.repo, projectId));
  }

  getSchedule(projectId: string): Promise<ScheduleResult> {
    return this.serialize(() => getSchedule(this.repo, projectId));
  }
}
