import { useCallback, useEffect, useState } from 'react';

// 依存を増やさない自前ルーター（History API ベース）。
export type Tab = 'wbs' | 'gantt' | 'settings';
const TABS: Tab[] = ['wbs', 'gantt', 'settings'];

export type Route =
  | { name: 'list' }
  | { name: 'project'; projectId: string; tab: Tab };

export function parseLocation(pathname: string): Route {
  const segs = pathname.split('/').filter((s) => s.length > 0);
  // /p/:projectId[/:tab]
  if (segs[0] === 'p' && segs[1]) {
    const projectId = decodeURIComponent(segs[1]);
    const tab = segs[2] && TABS.includes(segs[2] as Tab) ? (segs[2] as Tab) : 'wbs';
    return { name: 'project', projectId, tab };
  }
  return { name: 'list' };
}

export function listPath(): string {
  return '/';
}

export function projectPath(projectId: string, tab: Tab = 'wbs'): string {
  const base = `/p/${encodeURIComponent(projectId)}`;
  return tab === 'wbs' ? base : `${base}/${tab}`;
}

// 現在のルートと navigate 関数を返す。popstate（戻る/進む）にも追従する。
export function useRoute(): [Route, (path: string) => void] {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = (): void => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    setPathname(path);
  }, []);

  return [parseLocation(pathname), navigate];
}
