import { describe, it, expect } from 'vitest';
import { isoDate } from './units';
import {
  dayOfWeek,
  isWeekend,
  addDays,
  nextDay,
  compareDates,
  eachDate,
} from './calendar-date';

describe('dayOfWeek / isWeekend', () => {
  it('曜日を返す（0=日..6=土）', () => {
    expect(dayOfWeek(isoDate('2026-08-03'))).toBe(1); // 月
    expect(dayOfWeek(isoDate('2026-08-07'))).toBe(5); // 金
    expect(dayOfWeek(isoDate('2026-08-08'))).toBe(6); // 土
    expect(dayOfWeek(isoDate('2026-08-09'))).toBe(0); // 日
  });

  it('週末を判定する', () => {
    expect(isWeekend(isoDate('2026-08-07'))).toBe(false); // 金
    expect(isWeekend(isoDate('2026-08-08'))).toBe(true); // 土
    expect(isWeekend(isoDate('2026-08-09'))).toBe(true); // 日
  });
});

describe('addDays / nextDay', () => {
  it('日数を加算する', () => {
    expect(addDays(isoDate('2026-08-03'), 2)).toBe('2026-08-05');
    expect(nextDay(isoDate('2026-08-31'))).toBe('2026-09-01'); // 月跨ぎ
    expect(addDays(isoDate('2026-12-31'), 1)).toBe('2027-01-01'); // 年跨ぎ
    expect(addDays(isoDate('2026-03-01'), -1)).toBe('2026-02-28'); // 負の加算
  });
});

describe('compareDates / eachDate', () => {
  it('日付を比較する', () => {
    expect(compareDates(isoDate('2026-08-03'), isoDate('2026-08-05'))).toBeLessThan(0);
    expect(compareDates(isoDate('2026-08-05'), isoDate('2026-08-03'))).toBeGreaterThan(0);
    expect(compareDates(isoDate('2026-08-03'), isoDate('2026-08-03'))).toBe(0);
  });

  it('範囲を昇順で列挙する（両端含む）', () => {
    expect(eachDate(isoDate('2026-08-07'), isoDate('2026-08-10'))).toEqual([
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
    ]);
  });
});
