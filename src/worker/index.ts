import type { Env } from './env';
import { ProjectScheduler } from './ProjectScheduler';
import { D1ProjectRepository } from '../infrastructure/repositories/D1ProjectRepository';
import { createProject, addMember } from '../application/create-project/createProject';
import type { TaskPatch, ProjectPatch, MemberPatch } from '../application/ports';
import { minutes, isoDate } from '../domain/shared/units';
import type { Task, TaskStatus } from '../domain/task/Task';
import type { Project } from '../domain/project/Project';
import type { Member } from '../domain/member/Member';

// Durable Object クラスはランタイムが解決できるよう worker モジュールから re-export する。
export { ProjectScheduler };

function schedulerStub(env: Env, projectId: string) {
  const id = env.PROJECT_SCHEDULER.idFromName(projectId);
  return env.PROJECT_SCHEDULER.get(id);
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parseTask(body: Record<string, unknown>, projectId: string): Task {
  return {
    id: str(body.id) || crypto.randomUUID(),
    projectId,
    phaseId: strOrNull(body.phaseId),
    parentTaskId: strOrNull(body.parentTaskId),
    title: str(body.title),
    description: str(body.description),
    estimatedMinutes: minutes(num(body.estimatedMinutes)),
    actualMinutes: minutes(num(body.actualMinutes)),
    assigneeId: strOrNull(body.assigneeId),
    sortOrder: num(body.sortOrder),
    status: str(body.status, 'not_started') as TaskStatus,
  };
}

function parseTaskPatch(body: Record<string, unknown>): TaskPatch {
  const patch: TaskPatch = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.estimatedMinutes === 'number')
    patch.estimatedMinutes = minutes(body.estimatedMinutes);
  if ('phaseId' in body) patch.phaseId = strOrNull(body.phaseId);
  if (typeof body.status === 'string') patch.status = body.status as TaskStatus;
  return patch;
}

function parseProjectPatch(body: Record<string, unknown>): ProjectPatch {
  const patch: ProjectPatch = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.startDate === 'string') patch.startDate = isoDate(body.startDate);
  if (typeof body.timezone === 'string') patch.timezone = body.timezone;
  if (typeof body.defaultWorkdayMinutes === 'number')
    patch.defaultWorkdayMinutes = minutes(body.defaultWorkdayMinutes);
  return patch;
}

function parseMemberPatch(body: Record<string, unknown>): MemberPatch {
  const patch: MemberPatch = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.dailyCapacityMinutes === 'number')
    patch.dailyCapacityMinutes = minutes(body.dailyCapacityMinutes);
  return patch;
}

function parseProject(body: Record<string, unknown>): Project {
  return {
    id: str(body.id) || crypto.randomUUID(),
    name: str(body.name),
    description: str(body.description),
    startDate: isoDate(str(body.startDate)),
    timezone: str(body.timezone, 'Asia/Tokyo'),
    defaultWorkdayMinutes: minutes(num(body.defaultWorkdayMinutes, 480)),
  };
}

function parseMember(body: Record<string, unknown>): Member {
  return {
    id: str(body.id) || crypto.randomUUID(),
    workspaceId: str(body.workspaceId, 'w1'),
    name: str(body.name),
    dailyCapacityMinutes: minutes(num(body.dailyCapacityMinutes, 480)),
  };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  return ((await request.json()) ?? {}) as Record<string, unknown>;
}

function json(data: unknown): Response {
  return Response.json(data);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/api/health') return json({ status: 'ok', app: 'HeyPJ!' });
      if (!path.startsWith('/api/')) return new Response('Not Found', { status: 404 });

      const segs = path
        .replace(/^\/api\//, '')
        .split('/')
        .map((s) => decodeURIComponent(s));

      // GET /api/projects — 一覧 ／ POST /api/projects — 作成（DO を介さないグローバル操作）
      if (segs[0] === 'projects' && segs.length === 1) {
        const repo = new D1ProjectRepository(env.DB);
        if (method === 'GET') return json(await repo.listProjects());
        if (method === 'POST') {
          const project = parseProject(await readBody(request));
          await createProject(repo, project);
          return json({ id: project.id });
        }
        return methodNotAllowed();
      }

      if (segs[0] === 'projects' && segs.length >= 2) {
        const projectId = segs[1]!;
        const stub = schedulerStub(env, projectId);

        // GET /api/projects/:id — WBS 読み取りモデル
        // PATCH /api/projects/:id — プロジェクト設定更新（名前・開始日・TZ 等）
        if (segs.length === 2) {
          if (method === 'GET') return json(await stub.getProjectView(projectId));
          if (method === 'PATCH') {
            const patch = parseProjectPatch(await readBody(request));
            return json(await stub.updateProject({ projectId, patch }));
          }
          return methodNotAllowed();
        }

        const action = segs[2]!;

        // PATCH /api/projects/:id/tasks/:taskId — タスク編集
        if (segs.length === 4 && action === 'tasks') {
          if (method !== 'PATCH') return methodNotAllowed();
          const taskId = segs[3]!;
          const patch = parseTaskPatch(await readBody(request));
          return json(await stub.updateTask({ projectId, taskId, patch }));
        }

        // PATCH /api/projects/:id/members/:memberId — メンバー設定更新（稼働時間 等）
        if (segs.length === 4 && action === 'members') {
          if (method !== 'PATCH') return methodNotAllowed();
          const memberId = segs[3]!;
          const patch = parseMemberPatch(await readBody(request));
          return json(await stub.updateMember({ projectId, memberId, patch }));
        }

        // POST /api/projects/:id/members/:memberId/holidays — メンバー個人休日を追加
        if (segs.length === 5 && action === 'members' && segs[4] === 'holidays') {
          if (method !== 'POST') return methodNotAllowed();
          const memberId = segs[3]!;
          const body = await readBody(request);
          return json(
            await stub.addMemberHoliday({
              projectId,
              memberId,
              date: isoDate(str(body.date)),
              name: str(body.name),
            }),
          );
        }

        // DELETE /api/projects/:id/members/:memberId/holidays/:holidayId — メンバー個人休日を削除
        if (segs.length === 6 && action === 'members' && segs[4] === 'holidays') {
          if (method !== 'DELETE') return methodNotAllowed();
          const holidayId = segs[5]!;
          return json(await stub.removeMemberHoliday({ projectId, holidayId }));
        }

        if (segs.length !== 3) return new Response('Not Found', { status: 404 });

        if (action === 'schedule') {
          if (method !== 'GET') return methodNotAllowed();
          return json(await stub.getSchedule(projectId));
        }

        if (method !== 'POST') return methodNotAllowed();
        const body = await readBody(request);

        switch (action) {
          case 'members': {
            const repo = new D1ProjectRepository(env.DB);
            const member = parseMember(body);
            await addMember(repo, member);
            return json({ id: member.id });
          }
          case 'tasks':
            return json(await stub.createTask(parseTask(body, projectId)));
          case 'reorder':
            return json(
              await stub.reorderTask({
                projectId,
                orderedTaskIds: Array.isArray(body.orderedTaskIds)
                  ? (body.orderedTaskIds as string[])
                  : [],
              }),
            );
          case 'assign':
            return json(
              await stub.assignMember({
                projectId,
                taskId: str(body.taskId),
                assigneeId: strOrNull(body.assigneeId),
              }),
            );
          case 'recalculate':
            return json(await stub.recalculate(projectId));
        }
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  },
} satisfies ExportedHandler<Env>;

function methodNotAllowed(): Response {
  return new Response('Method Not Allowed', { status: 405 });
}
