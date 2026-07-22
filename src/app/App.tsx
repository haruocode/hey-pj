import { useCallback, useEffect, useState } from 'react';
import { WbsTable } from '../features/wbs/WbsTable';
import { GanttChart } from '../features/gantt/GanttChart';
import type { ProjectView } from '../features/wbs/api';
import * as api from '../features/wbs/api';

const PROJECT_ID = 'p1';
type ViewMode = 'wbs' | 'gantt';

export function App() {
  const [view, setView] = useState<ProjectView | null>(null);
  const [mode, setMode] = useState<ViewMode>('wbs');
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.getProjectView(PROJECT_ID));
      setNotFound(false);
    } catch (e) {
      // プロジェクト未作成（初回）
      setNotFound(true);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDemo(): Promise<void> {
    setError(null);
    try {
      await api.createDemoProject(PROJECT_ID);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (view) {
    return (
      <>
        <div className="app-shell">
          <h1 className="app-title">
            HeyPJ! — {view.project.name}
            <small>
              開始 {view.project.startDate} ／ 完了予定 {view.projectEndDate ?? '—'}
            </small>
          </h1>
          <nav className="app-tabs">
            <button className={mode === 'wbs' ? 'active' : ''} onClick={() => setMode('wbs')}>
              WBS
            </button>
            <button className={mode === 'gantt' ? 'active' : ''} onClick={() => setMode('gantt')}>
              ガント
            </button>
          </nav>
        </div>
        {mode === 'wbs' ? (
          <WbsTable projectId={PROJECT_ID} view={view} onChanged={load} />
        ) : (
          <GanttChart view={view} />
        )}
      </>
    );
  }

  return (
    <main className="wbs-bootstrap">
      <h1>HeyPJ!</h1>
      <p>WBSの日付を、人間がメンテナンスしない。</p>
      {notFound && (
        <>
          <p>プロジェクト「{PROJECT_ID}」がまだありません。</p>
          <button onClick={createDemo}>デモプロジェクトを作成</button>
        </>
      )}
      {error && !notFound && <p className="wbs-error">エラー: {error}</p>}
    </main>
  );
}
