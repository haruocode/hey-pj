import { useEffect, useState } from 'react';

// フェーズ1の足場。WBS テーブルはフェーズ6で features/wbs として実装する（docs/design.md §8）。
export function App() {
  const [health, setHealth] = useState<string>('...');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<{ status: string }>)
      .then((data) => setHealth(data.status))
      .catch(() => setHealth('error'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>HeyPJ!</h1>
      <p>WBSの日付を、人間がメンテナンスしない。</p>
      <p>API health: {health}</p>
    </main>
  );
}
