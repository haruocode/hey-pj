import type { ProjectRepository } from '../ports';
import { calculateSchedule } from '../../domain/scheduling/SchedulingEngine';
import type { Conflict, DailyAllocation } from '../../domain/scheduling/types';
import type { TaskStatus } from '../../domain/task/Task';
import type { IsoDate } from '../../domain/shared/units';

// WBS 画面が必要とする読み取りモデル（docs/design.md §26-30）。
// 入力（タスク・工数・担当）と、計算結果（計画日・日次割当）をまとめて返す。
export interface ProjectViewMember {
  id: string;
  name: string;
  dailyCapacityMinutes: number;
}

export interface ProjectViewMemberHoliday {
  id: string;
  memberId: string;
  date: IsoDate;
  name: string;
}

export interface ProjectViewTask {
  id: string;
  phaseId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string;
  estimatedMinutes: number;
  actualMinutes: number;
  assigneeId: string | null;
  sortOrder: number;
  status: TaskStatus;
  // 計算値（計画日・日次割当）。未スケジュール（競合等）の場合は null / 空。
  plannedStartDate: IsoDate | null;
  plannedEndDate: IsoDate | null;
  dailyAllocations: DailyAllocation[];
}

export interface ProjectView {
  project: {
    id: string;
    name: string;
    startDate: IsoDate;
    timezone: string;
    defaultWorkdayMinutes: number;
  };
  members: ProjectViewMember[];
  memberHolidays: ProjectViewMemberHoliday[]; // メンバー個人休日（ガント表示・設定管理用）
  tasks: ProjectViewTask[]; // sortOrder 昇順
  conflicts: Conflict[];
  projectEndDate: IsoDate | null;
}

export async function getProjectView(
  repo: ProjectRepository,
  projectId: string,
): Promise<ProjectView> {
  const project = await repo.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const input = await repo.loadSchedulingInput(projectId);
  const result = calculateSchedule(input);
  const scheduledById = new Map(result.scheduledTasks.map((s) => [s.taskId, s]));

  const tasks: ProjectViewTask[] = [...input.tasks]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => {
      const scheduled = scheduledById.get(t.id);
      return {
        id: t.id,
        phaseId: t.phaseId,
        parentTaskId: t.parentTaskId,
        title: t.title,
        description: t.description,
        estimatedMinutes: t.estimatedMinutes,
        actualMinutes: t.actualMinutes,
        assigneeId: t.assigneeId,
        sortOrder: t.sortOrder,
        status: t.status,
        plannedStartDate: scheduled?.plannedStartDate ?? null,
        plannedEndDate: scheduled?.plannedEndDate ?? null,
        dailyAllocations: scheduled ? [...scheduled.dailyAllocations] : [],
      };
    });

  return {
    project: {
      id: project.id,
      name: project.name,
      startDate: project.startDate,
      timezone: project.timezone,
      defaultWorkdayMinutes: project.defaultWorkdayMinutes,
    },
    members: input.members.map((m) => ({
      id: m.id,
      name: m.name,
      dailyCapacityMinutes: m.dailyCapacityMinutes,
    })),
    memberHolidays: input.memberHolidays.map((h) => ({
      id: h.id,
      memberId: h.memberId,
      date: h.date,
      name: h.name,
    })),
    tasks,
    conflicts: [...result.conflicts],
    projectEndDate: result.projectEndDate,
  };
}
