import type { IsoDate } from './units';

// プロジェクトTZ基準の暦日（IsoDate）に対する純粋な日付演算。
// 実行環境（サーバー/ブラウザ）のタイムゾーンに依存しないよう、内部では UTC で計算する。
// IsoDate は「暦日」そのものであり、暦日の曜日や日数加算は TZ に依存しない。

function parse(date: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

function format(dt: Date): IsoDate {
  const y = dt.getUTCFullYear().toString().padStart(4, '0');
  const m = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = dt.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}` as IsoDate;
}

/** 0=日曜, 1=月曜, ... 6=土曜。 */
export function dayOfWeek(date: IsoDate): number {
  const { y, m, d } = parse(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const wd = dayOfWeek(date);
  return wd === 0 || wd === 6;
}

/** 暦日に n 日加算した暦日を返す（n は負も可）。 */
export function addDays(date: IsoDate, n: number): IsoDate {
  const { y, m, d } = parse(date);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return format(dt);
}

export function nextDay(date: IsoDate): IsoDate {
  return addDays(date, 1);
}

/** a<b で負, a>b で正, 等しいとき 0。ISO 形式は辞書順比較で日付順と一致する。 */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** [from, to] を含む昇順の暦日リストを返す。 */
export function eachDate(from: IsoDate, to: IsoDate): IsoDate[] {
  const result: IsoDate[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = nextDay(d)) {
    result.push(d);
  }
  return result;
}
