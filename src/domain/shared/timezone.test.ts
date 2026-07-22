import { describe, it, expect } from 'vitest';
import { instantToProjectDate, durationMinutes, timeToMinutes } from './timezone';
import type { IsoDateTime } from './units';

describe('instantToProjectDate', () => {
  it('Asia/Tokyo で暦日に変換する（日跨ぎ）', () => {
    // UTC 2026-08-04T20:00Z は JST では 2026-08-05 05:00
    expect(instantToProjectDate('2026-08-04T20:00:00Z' as IsoDateTime, 'Asia/Tokyo')).toBe(
      '2026-08-05',
    );
    // UTC 2026-08-05T00:00Z は JST では 2026-08-05 09:00
    expect(instantToProjectDate('2026-08-05T00:00:00Z' as IsoDateTime, 'Asia/Tokyo')).toBe(
      '2026-08-05',
    );
  });
});

describe('durationMinutes', () => {
  it('分単位の差を返す', () => {
    expect(
      durationMinutes('2026-08-05T09:00:00Z' as IsoDateTime, '2026-08-05T13:00:00Z' as IsoDateTime),
    ).toBe(240);
  });
});

describe('timeToMinutes', () => {
  it('HH:MM を分に変換する', () => {
    expect(timeToMinutes('11:00')).toBe(660);
    expect(timeToMinutes('14:30')).toBe(870);
  });
});
