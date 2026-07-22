// ドメイン共通の単位・ブランド型（docs/design.md §2.1）。
// 工数は整数分で扱い、浮動小数点の日数計算は用いない。
// 日付はプロジェクトのタイムゾーン基準の暦日として扱う。

export type Minutes = number & { readonly __brand: 'Minutes' };
export type IsoDate = string & { readonly __brand: 'IsoDate' }; // 'YYYY-MM-DD'（プロジェクトTZ基準）
export type IsoDateTime = string & { readonly __brand: 'IsoDateTime' }; // UTC ISO8601

/** 非負の整数分を Minutes に変換する。小数・負値は許可しない。 */
export function minutes(value: number): Minutes {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Minutes must be a non-negative integer, got: ${value}`);
  }
  return value as Minutes;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' 形式の文字列を IsoDate に変換する。 */
export function isoDate(value: string): IsoDate {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`Invalid IsoDate (expected YYYY-MM-DD), got: ${value}`);
  }
  return value as IsoDate;
}
