import type { IsoDate, IsoDateTime } from './units';

// UTC の絶対時刻（IsoDateTime）と、プロジェクトTZ基準の暦日（IsoDate）の変換。
// Workers は UTC 実行のため、暦日の判定は必ずプロジェクトTZで行う（docs/design.md §4.3）。

/** UTC の絶対時刻を、指定タイムゾーンでの暦日（YYYY-MM-DD）に変換する。 */
export function instantToProjectDate(instant: IsoDateTime, timeZone: string): IsoDate {
  // en-CA ロケールは YYYY-MM-DD 形式を返す。
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
  return formatted as IsoDate;
}

/** 2 つの絶対時刻の差を分で返す（end - start）。 */
export function durationMinutes(start: IsoDateTime, end: IsoDateTime): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

/** 'HH:MM' を 0 時からの分に変換する。 */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}
