import type { Minutes } from '../shared/units';

// メンバーは人的リソース（docs/design.md §2.5）。
// キャパシティを超える作業は割り当てられない。稼働状況はメンバー全体で計算する。
export interface Member {
  id: string;
  workspaceId: string;
  name: string;
  dailyCapacityMinutes: Minutes; // 既定 480
}

export const DEFAULT_DAILY_CAPACITY_MINUTES = 480;
