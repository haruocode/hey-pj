import { useCallback, useEffect, useState } from 'react';
import { WbsTable } from '../features/wbs/WbsTable';
import type { ProjectView } from '../features/wbs/api';
import * as api from '../features/wbs/api';

const PROJECT_ID = 'p1';

export function App() {
  const [view, setView] = useState<ProjectView | null>(null);
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
    return <WbsTable projectId={PROJECT_ID} view={view} onChanged={load} />;
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
