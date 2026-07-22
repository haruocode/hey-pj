import type { ProjectRepository } from '../../application/ports';
import { defaultHorizon } from '../../application/ports';
import type { Task, TaskStatus } from '../../domain/task/Task';
import type { TaskDependency, DependencyType } from '../../domain/task/Dependency';
import type { Member } from '../../domain/member/Member';
import type { CalendarBlock, BlockType } from '../../domain/calendar/CalendarBlock';
import type {
  RecurringMeeting,
  MeetingFrequency,
  DayOfWeek,
} from '../../domain/calendar/RecurringMeeting';
import { minutes, isoDate } from '../../domain/shared/units';
import type { IsoDate, IsoDateTime } from '../../domain/shared/units';
import type { ScheduleResult, SchedulingInput } from '../../domain/scheduling/types';

interface ProjectRow {
  id: string;
  start_date: string;
  timezone: string;
  default_workday_minutes: number;
}
interface TaskRow {
  id: string;
  project_id: string;
  phase_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  estimated_minutes: number;
  actual_minutes: number;
  assignee_id: string | null;
  sort_order: number;
  status: string;
}
interface DependencyRow {
  id: string;
  predecessor_task_id: string;
  successor_task_id: string;
  type: string;
}
interface MemberRow {
  id: string;
  workspace_id: string;
  name: string;
  daily_capacity_minutes: number;
}
interface BlockRow {
  id: string;
  member_id: string | null;
  project_id: string | null;
  type: string;
  start_at: string;
  end_at: string;
  title: string;
}
interface MeetingRow {
  id: string;
  project_id: string;
  member_id: string | null;
  title: string;
  frequency: string;
  days_of_week: string;
  start_time: string;
  end_time: string;
}
interface DateRow {
  date: string;
}

function parseDaysOfWeek(csv: string): DayOfWeek[] {
  if (csv.trim() === '') return [];
  return csv
    .split(',')
    .map((s) => Number(s.trim()) as DayOfWeek)
    .filter((n) => n >= 0 && n <= 6);
}

// D1（SQLite）実装。ドメインオブジェクトとの変換はこの層に隔離する（docs/design.md §6）。
// スケジューリングエンジンはこの実装を知らず、Cloudflare ランタイム外でもテスト可能なまま。
export class D1ProjectRepository implements ProjectRepository {
  constructor(private readonly db: D1Database) {}

  async loadSchedulingInput(projectId: string): Promise<SchedulingInput> {
    const projectRow = await this.db
      .prepare('SELECT id, start_date, timezone, default_workday_minutes FROM projects WHERE id = ?')
      .bind(projectId)
      .first<ProjectRow>();
    if (!projectRow) throw new Error(`Project not found: ${projectId}`);

    const [taskRows, depRows, memberRows, blockRows, meetingRows, holidayRows] = await Promise.all([
      this.db
        .prepare(
          'SELECT id, project_id, phase_id, parent_task_id, title, description, estimated_minutes, actual_minutes, assignee_id, sort_order, status FROM tasks WHERE project_id = ? ORDER BY sort_order',
        )
        .bind(projectId)
        .all<TaskRow>(),
      this.db
        .prepare(
          `SELECT d.id, d.predecessor_task_id, d.successor_task_id, d.type
           FROM task_dependencies d
           JOIN tasks t ON d.predecessor_task_id = t.id
           WHERE t.project_id = ?`,
        )
        .bind(projectId)
        .all<DependencyRow>(),
      this.db
        .prepare('SELECT id, workspace_id, name, daily_capacity_minutes FROM members')
        .all<MemberRow>(),
      this.db
        .prepare(
          'SELECT id, member_id, project_id, type, start_at, end_at, title FROM calendar_blocks WHERE project_id = ? OR project_id IS NULL',
        )
        .bind(projectId)
        .all<BlockRow>(),
      this.db
        .prepare(
          'SELECT id, project_id, member_id, title, frequency, days_of_week, start_time, end_time FROM recurring_meetings WHERE project_id = ?',
        )
        .bind(projectId)
        .all<MeetingRow>(),
      this.db.prepare('SELECT date FROM holidays WHERE project_id = ?').bind(projectId).all<DateRow>(),
    ]);

    const tasks: Task[] = taskRows.results.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      phaseId: r.phase_id,
      parentTaskId: r.parent_task_id,
      title: r.title,
      description: r.description,
      estimatedMinutes: minutes(r.estimated_minutes),
      actualMinutes: minutes(r.actual_minutes),
      assigneeId: r.assignee_id,
      sortOrder: r.sort_order,
      status: r.status as TaskStatus,
    }));

    const dependencies: TaskDependency[] = depRows.results.map((r) => ({
      id: r.id,
      predecessorTaskId: r.predecessor_task_id,
      successorTaskId: r.successor_task_id,
      type: r.type as DependencyType,
    }));

    const members: Member[] = memberRows.results.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
      dailyCapacityMinutes: minutes(r.daily_capacity_minutes),
    }));

    const calendarBlocks: CalendarBlock[] = blockRows.results.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      projectId: r.project_id,
      type: r.type as BlockType,
      startAt: r.start_at as IsoDateTime,
      endAt: r.end_at as IsoDateTime,
      title: r.title,
    }));

    const recurringMeetings: RecurringMeeting[] = meetingRows.results.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      memberId: r.member_id,
      title: r.title,
      frequency: r.frequency as MeetingFrequency,
      daysOfWeek: parseDaysOfWeek(r.days_of_week),
      startTime: r.start_time,
      endTime: r.end_time,
    }));

    const holidays: IsoDate[] = holidayRows.results.map((r) => isoDate(r.date));
    const startDate = isoDate(projectRow.start_date);

    return {
      project: {
        startDate,
        timezone: projectRow.timezone,
        defaultWorkdayMinutes: minutes(projectRow.default_workday_minutes),
      },
      tasks,
      dependencies,
      members,
      calendarBlocks,
      recurringMeetings,
      holidays,
      horizon: defaultHorizon(startDate),
    };
  }

  async saveScheduleResult(projectId: string, result: ScheduleResult): Promise<void> {
    const computedAt = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      // 当該プロジェクト分を洗い替える。
      this.db
        .prepare(
          'DELETE FROM task_daily_allocations WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)',
        )
        .bind(projectId),
      this.db
        .prepare('DELETE FROM task_schedule WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)')
        .bind(projectId),
    ];

    for (const st of result.scheduledTasks) {
      statements.push(
        this.db
          .prepare(
            'INSERT INTO task_schedule (task_id, planned_start_at, planned_end_at, computed_at) VALUES (?, ?, ?, ?)',
          )
          .bind(st.taskId, st.plannedStartDate, st.plannedEndDate, computedAt),
      );
      for (const alloc of st.dailyAllocations) {
        statements.push(
          this.db
            .prepare(
              'INSERT INTO task_daily_allocations (id, task_id, work_date, allocated_minutes) VALUES (?, ?, ?, ?)',
            )
            .bind(`${st.taskId}:${alloc.date}`, st.taskId, alloc.date, alloc.minutes),
        );
      }
    }

    await this.db.batch(statements);
  }

  async insertTask(task: Task): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO tasks
          (id, project_id, phase_id, parent_task_id, title, description, estimated_minutes,
           actual_minutes, assignee_id, sort_order, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        task.id,
        task.projectId,
        task.phaseId,
        task.parentTaskId,
        task.title,
        task.description,
        task.estimatedMinutes,
        task.actualMinutes,
        task.assigneeId,
        task.sortOrder,
        task.status,
        now,
        now,
      )
      .run();
  }

  async updateTaskAssignee(taskId: string, assigneeId: string | null): Promise<void> {
    await this.db
      .prepare('UPDATE tasks SET assignee_id = ?, updated_at = ? WHERE id = ?')
      .bind(assigneeId, new Date().toISOString(), taskId)
      .run();
  }

  async reorderTasks(_projectId: string, orderedTaskIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const statements = orderedTaskIds.map((id, index) =>
      this.db
        .prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?')
        .bind(index, now, id),
    );
    if (statements.length > 0) await this.db.batch(statements);
  }
}
