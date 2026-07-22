import type { ProjectRepository } from '../../application/ports';
import { defaultHorizon } from '../../application/ports';
import type { Project } from '../../domain/project/Project';
import type { Task } from '../../domain/task/Task';
import type { TaskDependency } from '../../domain/task/Dependency';
import type { Member } from '../../domain/member/Member';
import type { CalendarBlock } from '../../domain/calendar/CalendarBlock';
import type { RecurringMeeting } from '../../domain/calendar/RecurringMeeting';
import type { IsoDate } from '../../domain/shared/units';
import type { ScheduleResult, SchedulingInput } from '../../domain/scheduling/types';

export interface ProjectSeed {
  project: Project;
  tasks?: Task[];
  dependencies?: TaskDependency[];
  members?: Member[];
  calendarBlocks?: CalendarBlock[];
  recurringMeetings?: RecurringMeeting[];
  holidays?: IsoDate[];
}

// テスト・ローカル開発用のインメモリ実装。D1 実装と同じポートを満たす。
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly project: Project;
  private tasks: Task[];
  private dependencies: TaskDependency[];
  private members: Member[];
  private calendarBlocks: CalendarBlock[];
  private recurringMeetings: RecurringMeeting[];
  private holidays: IsoDate[];
  private lastResult: ScheduleResult | null = null;

  constructor(seed: ProjectSeed) {
    this.project = seed.project;
    this.tasks = [...(seed.tasks ?? [])];
    this.dependencies = [...(seed.dependencies ?? [])];
    this.members = [...(seed.members ?? [])];
    this.calendarBlocks = [...(seed.calendarBlocks ?? [])];
    this.recurringMeetings = [...(seed.recurringMeetings ?? [])];
    this.holidays = [...(seed.holidays ?? [])];
  }

  loadSchedulingInput(_projectId: string): Promise<SchedulingInput> {
    return Promise.resolve({
      project: {
        startDate: this.project.startDate,
        timezone: this.project.timezone,
        defaultWorkdayMinutes: this.project.defaultWorkdayMinutes,
      },
      tasks: [...this.tasks],
      dependencies: [...this.dependencies],
      members: [...this.members],
      calendarBlocks: [...this.calendarBlocks],
      recurringMeetings: [...this.recurringMeetings],
      holidays: [...this.holidays],
      horizon: defaultHorizon(this.project.startDate),
    });
  }

  saveScheduleResult(_projectId: string, result: ScheduleResult): Promise<void> {
    this.lastResult = result;
    return Promise.resolve();
  }

  insertTask(task: Task): Promise<void> {
    this.tasks.push(task);
    return Promise.resolve();
  }

  updateTaskAssignee(taskId: string, assigneeId: string | null): Promise<void> {
    this.tasks = this.tasks.map((t) => (t.id === taskId ? { ...t, assigneeId } : t));
    return Promise.resolve();
  }

  reorderTasks(_projectId: string, orderedTaskIds: string[]): Promise<void> {
    const rank = new Map(orderedTaskIds.map((id, i) => [id, i]));
    this.tasks = this.tasks.map((t) =>
      rank.has(t.id) ? { ...t, sortOrder: rank.get(t.id)! } : t,
    );
    return Promise.resolve();
  }

  /** テスト用: 最後に保存されたスケジュール結果。 */
  getLastResult(): ScheduleResult | null {
    return this.lastResult;
  }
}
