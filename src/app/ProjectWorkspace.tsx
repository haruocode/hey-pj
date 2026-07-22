import { useCallback, useEffect, useState } from 'react';
import { WbsTable } from '../features/wbs/WbsTable';
import { GanttChart } from '../features/gantt/GanttChart';
import { ProjectSettings } from '../features/settings/ProjectSettings';
import type { ProjectView } from '../features/wbs/api';
import * as api from '../features/wbs/api';
import type { Tab } from './router';
import { listPath, projectPath } from './router';

interface Props {
  projectId: string;
  tab: Tab;
  navigate: (path: string) => void;
}

export function ProjectWorkspace({ projectId, tab, navigate }: Props) {
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.getProjectView(projectId));
      setError(null);
    } catch (e) {
      setView(null);
      setError((e as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!view) {
    return (
      <main className="wbs-bootstrap">
        <h1>HeyPJ!</h1>
        <p>プロジェクト「{projectId}」を開けませんでした。</p>
        {error && <p className="wbs-error">エラー: {error}</p>}
        <button onClick={() => navigate(listPath())}>← プロジェクト一覧へ</button>
      </main>
    );
  }

  return (
    <>
      <div className="app-shell">
        <button className="app-back" onClick={() => navigate(listPath())}>
          ← プロジェクト一覧
        </button>
        <h1 className="app-title">
          {view.project.name}
          <small>
            開始 {view.project.startDate} ／ 完了予定 {view.projectEndDate ?? '—'}
          </small>
        </h1>
        <nav className="app-tabs">
          <button
            className={tab === 'wbs' ? 'active' : ''}
            onClick={() => navigate(projectPath(projectId, 'wbs'))}
          >
            WBS
          </button>
          <button
            className={tab === 'gantt' ? 'active' : ''}
            onClick={() => navigate(projectPath(projectId, 'gantt'))}
          >
            ガント
          </button>
          <button
            className={tab === 'settings' ? 'active' : ''}
            onClick={() => navigate(projectPath(projectId, 'settings'))}
          >
            設定
          </button>
        </nav>
      </div>
      {tab === 'wbs' && <WbsTable projectId={projectId} view={view} onChanged={load} />}
      {tab === 'gantt' && <GanttChart view={view} />}
      {tab === 'settings' && (
        <ProjectSettings projectId={projectId} view={view} onChanged={load} />
      )}
    </>
  );
}
