-- メンバー個人の休日（有給・私用など）。祝日・会社休日（holidays）はプロジェクト全員に効くのに対し、
-- こちらは特定メンバーだけをその暦日に稼働 0 とする（docs/design.md §4.2）。
CREATE TABLE member_holidays (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  date TEXT NOT NULL,                 -- 'YYYY-MM-DD'（プロジェクトTZ）
  name TEXT NOT NULL DEFAULT '',
  UNIQUE(project_id, member_id, date)
);

CREATE INDEX idx_member_holidays_project ON member_holidays(project_id);
