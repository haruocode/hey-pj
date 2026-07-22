import type { ProjectView } from '../../application/get-project-view/getProjectView';
import type { TaskStatus } from '../../domain/task/Task';

// WBS 画面用の API クライアント。Workers の /api/* を叩く。
export type { ProjectView };
export type { ProjectViewTask } from '../../application/get-project-view/getProjectView';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface ProjectSummary {
  id: string;
  name: string;
  startDate: string;
  timezone: string;
  defaultWorkdayMinutes: number;
}

export function listProjects(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>(`/projects`);
}

export interface NewProjectInput {
  name: string;
  startDate: string;
  timezone?: string;
  defaultWorkdayMinutes?: number;
}

export function createProject(input: NewProjectInput): Promise<{ id: string }> {
  return request<{ id: string }>(`/projects`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getProjectView(projectId: string): Promise<ProjectView> {
  return request<ProjectView>(`/projects/${encodeURIComponent(projectId)}`);
}

export interface NewTaskInput {
  title: string;
  estimatedMinutes: number;
  assigneeId: string | null;
  sortOrder: number;
}

export function createTask(projectId: string, task: NewTaskInput): Promise<unknown> {
  return request(`/projects/${encodeURIComponent(projectId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export interface TaskPatchInput {
  title?: string;
  estimatedMinutes?: number;
  status?: TaskStatus;
}

export function updateTask(
  projectId: string,
  taskId: string,
  patch: TaskPatchInput,
): Promise<unknown> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}

export function assignMember(
  projectId: string,
  taskId: string,
  assigneeId: string | null,
): Promise<unknown> {
  return request(`/projects/${encodeURIComponent(projectId)}/assign`, {
    method: 'POST',
    body: JSON.stringify({ taskId, assigneeId }),
  });
}

export function reorderTasks(projectId: string, orderedTaskIds: string[]): Promise<unknown> {
  return request(`/projects/${encodeURIComponent(projectId)}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ orderedTaskIds }),
  });
}

export interface ProjectPatchInput {
  name?: string;
  startDate?: string;
  timezone?: string;
  defaultWorkdayMinutes?: number;
}

export function updateProject(projectId: string, patch: ProjectPatchInput): Promise<unknown> {
  return request(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export interface MemberPatchInput {
  name?: string;
  dailyCapacityMinutes?: number;
}

export function updateMember(
  projectId: string,
  memberId: string,
  patch: MemberPatchInput,
): Promise<unknown> {
  return request(
    `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}

export function addMember(
  projectId: string,
  member: { name: string; dailyCapacityMinutes: number },
): Promise<unknown> {
  return request(`/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    body: JSON.stringify(member),
  });
}

// デモ用のブートストラップ（プロジェクト + メンバー作成）。
export async function createDemoProject(projectId: string): Promise<void> {
  await request(`/projects`, {
    method: 'POST',
    body: JSON.stringify({
      id: projectId,
      name: '顧客管理システム フェーズ2',
      startDate: '2026-08-03',
      timezone: 'Asia/Tokyo',
      defaultWorkdayMinutes: 480,
    }),
  });
  await request(`/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ id: 'ito', name: '伊藤', dailyCapacityMinutes: 480 }),
  });
  await request(`/projects/${encodeURIComponent(projectId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ id: 'yamada', name: '山田', dailyCapacityMinutes: 480 }),
  });
}
