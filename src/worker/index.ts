import type { Env } from './env';
import { ProjectScheduler } from './ProjectScheduler';
import { minutes } from '../domain/shared/units';
import type { Task, TaskStatus } from '../domain/task/Task';

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
    id: str(body.id),
    projectId,
    phaseId: strOrNull(body.phaseId),
    parentTaskId: strOrNull(body.parentTaskId),
    title: str(body.title),
    description: str(body.description),
    estimatedMinutes: minutes(num(body.estimatedMinutes)),
    actualMinutes: minutes(num(body.actualMinutes)),
    assigneeId: strOrNull(body.assigneeId),
    sortOrder: num(body.sortOrder),
    status: (str(body.status, 'not_started') as TaskStatus) satisfies TaskStatus,
  };
}

const ROUTE = /^\/api\/projects\/([^/]+)\/(tasks|reorder|assign|recalculate|schedule)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health') {
        return Response.json({ status: 'ok', app: 'HeyPJ!' });
      }

      const match = ROUTE.exec(path);
      if (match) {
        const projectId = decodeURIComponent(match[1]!);
        const action = match[2]!;
        const stub = schedulerStub(env, projectId);

        if (action === 'schedule') {
          if (request.method !== 'GET') return methodNotAllowed();
          return Response.json(await stub.getSchedule(projectId));
        }

        if (request.method !== 'POST') return methodNotAllowed();
        const body = ((await request.json()) ?? {}) as Record<string, unknown>;

        switch (action) {
          case 'tasks':
            return Response.json(await stub.createTask(parseTask(body, projectId)));
          case 'reorder':
            return Response.json(
              await stub.reorderTask({
                projectId,
                orderedTaskIds: Array.isArray(body.orderedTaskIds)
                  ? (body.orderedTaskIds as string[])
                  : [],
              }),
            );
          case 'assign':
            return Response.json(
              await stub.assignMember({
                projectId,
                taskId: str(body.taskId),
                assigneeId: strOrNull(body.assigneeId),
              }),
            );
          case 'recalculate':
            return Response.json(await stub.recalculate(projectId));
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
