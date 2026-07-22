import type { IsoDateTime } from '../shared/units';

// 単発の利用不可期間（休暇・祝日・出張など）を統一表現する（docs/design.md §2.6）。
// スケジューリングエンジンが関心を持つのは、ある時間範囲がメンバーのキャパシティを消費するか。
// 半日休暇は type='leave' の時間帯で表現する（午前休 = 稼働開始〜正午 など）。
export type BlockType =
  | 'leave'
  | 'holiday'
  | 'training'
  | 'business_trip'
  | 'internal_event'
  | 'other';

export interface CalendarBlock {
  id: string;
  memberId: string | null; // null = プロジェクト/組織全体（祝日など）
  projectId: string | null;
  type: BlockType;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  title: string;
}
