import { describe, it, expect } from 'vitest';
import { minutes, isoDate } from './units';

describe('minutes', () => {
  it('非負整数を受け付ける', () => {
    expect(minutes(480)).toBe(480);
    expect(minutes(0)).toBe(0);
  });

  it('小数を拒否する', () => {
    expect(() => minutes(0.5)).toThrow();
  });

  it('負値を拒否する', () => {
    expect(() => minutes(-1)).toThrow();
  });
});

describe('isoDate', () => {
  it('YYYY-MM-DD を受け付ける', () => {
    expect(isoDate('2026-08-03')).toBe('2026-08-03');
  });

  it('不正な形式を拒否する', () => {
    expect(() => isoDate('2026/08/03')).toThrow();
    expect(() => isoDate('2026-8-3')).toThrow();
  });
});
