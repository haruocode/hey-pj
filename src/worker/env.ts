import type { ProjectScheduler } from './ProjectScheduler';

// Worker / Durable Object が受け取るバインディング（wrangler.jsonc と対応）。
export interface Env {
  DB: D1Database;
  PROJECT_SCHEDULER: DurableObjectNamespace<ProjectScheduler>;
}
