import { useEffect, useState } from 'react';
import * as api from '../wbs/api';
import type { ProjectSummary } from '../wbs/api';
import { projectPath } from '../../app/router';

interface Props {
  navigate: (path: string) => void;
}

const DEMO_PROJECT_ID = 'p1';

// プロジェクト一覧・新規作成（ルート `/`）。
export function ProjectList({ navigate }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  async function load(): Promise<void> {
    try {
      setProjects(await api.listProjects());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function create(): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(async () => {
      const { id } = await api.createProject({ name: trimmed, startDate });
      navigate(projectPath(id));
    });
  }

  function createDemo(): void {
    void run(async () => {
      await api.createDemoProject(DEMO_PROJECT_ID);
      navigate(projectPath(DEMO_PROJECT_ID));
    });
  }

  return (
    <main className="projects">
      <h1 className="app-title">HeyPJ!</h1>
      <p className="wbs-sub">WBSの日付を、人間がメンテナンスしない。</p>

      {error && <div className="wbs-error">エラー: {error}</div>}

      <section className="settings-section">
        <h2>プロジェクト</h2>
        {projects === null ? (
          <p className="wbs-note">読み込み中…</p>
        ) : projects.length === 0 ? (
          <p className="wbs-note">
            プロジェクトがありません。下で新規作成するか、
            <button className="link-button" disabled={busy} onClick={createDemo}>
              デモを作成
            </button>
            してください。
          </p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button className="project-link" onClick={() => navigate(projectPath(p.id))}>
                  <span className="project-name">{p.name || p.id}</span>
                  <span className="project-meta">開始 {p.startDate}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <h2>新規プロジェクト</h2>
        <div className="settings-grid">
          <label>
            プロジェクト名
            <input
              value={name}
              placeholder="例: 顧客管理システム フェーズ2"
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </label>
          <label>
            開始日
            <input
              type="date"
              value={startDate}
              disabled={busy}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
        </div>
        <button className="primary-button" disabled={busy || !name.trim()} onClick={create}>
          作成して開く
        </button>
      </section>
    </main>
  );
}
