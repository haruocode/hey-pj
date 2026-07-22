import type { Minutes, IsoDate } from '../shared/units';

// プロジェクトは 1 つの開発イニシアチブを表す（docs/design.md §2.2）。
// startDate はスケジューリングエンジンの主要な入力の 1 つ。
export interface Project {
  id: string;
  name: string;
  description: string;
  startDate: IsoDate; // スケジューリングの起点
  timezone: string; // 既定 'Asia/Tokyo'
  defaultWorkdayMinutes: Minutes; // 既定 480
}

export const DEFAULT_TIMEZONE = 'Asia/Tokyo';
export const DEFAULT_WORKDAY_MINUTES = 480;
