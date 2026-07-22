-- HeyPJ! 初期スキーマ（docs/design.md §3）
-- 工数は整数分で保存。planned_* は計算結果のキャッシュ（source of truth はエンジン出力）。

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  default_workday_minutes INTEGER NOT NULL DEFAULT 480,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  daily_capacity_minutes INTEGER NOT NULL DEFAULT 480
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  phase_id TEXT REFERENCES phases(id),
  parent_task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  assignee_id TEXT REFERENCES members(id),
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  actual_start_at TEXT,
  actual_end_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_project ON tasks(project_id);

CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  predecessor_task_id TEXT NOT NULL REFERENCES tasks(id),
  successor_task_id   TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL DEFAULT 'FS',
  UNIQUE(predecessor_task_id, successor_task_id)
);

CREATE TABLE calendar_blocks (
  id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(id),
  project_id TEXT REFERENCES projects(id),
  type TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recurring_meetings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  member_id TEXT REFERENCES members(id),
  title TEXT NOT NULL,
  frequency TEXT NOT NULL,            -- 'daily' | 'weekly'
  days_of_week TEXT NOT NULL DEFAULT '', -- 'weekly' のとき CSV 例 '2' / '1,3'
  start_time TEXT NOT NULL,           -- 'HH:MM'
  end_time TEXT NOT NULL
);

-- 祝日 + 会社休日（docs/design.md §15）。会社ごとに異なるため設定可能に保つ。
CREATE TABLE holidays (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  date TEXT NOT NULL,                 -- 'YYYY-MM-DD'（プロジェクトTZ）
  name TEXT NOT NULL DEFAULT '',
  UNIQUE(project_id, date)
);

-- 計算結果のキャッシュ（source of truth はエンジン出力）。再計算のたびに洗い替える。
CREATE TABLE task_schedule (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  planned_start_at TEXT,             -- 現状は日付（docs/design.md §4.1 実装注記）
  planned_end_at TEXT,
  computed_at TEXT NOT NULL
);

-- 日次割り当ての明細（docs/design.md §21：スケジュールの説明可能性のため保持）。
CREATE TABLE task_daily_allocations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  work_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  allocated_minutes INTEGER NOT NULL
);

CREATE INDEX idx_allocations_task ON task_daily_allocations(task_id);
