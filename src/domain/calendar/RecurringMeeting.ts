// 定例会議は「曜日 + 時刻」の簡易形で表現する（docs/design.md §2.6、論点B）。
// RRULE は将来拡張。定例会議はスケジュール可能なタスクキャパシティを減少させる。
export type MeetingFrequency = 'daily' | 'weekly'; // daily = 稼働日ごと

// 0=日曜 .. 6=土曜
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RecurringMeeting {
  id: string;
  projectId: string;
  memberId: string | null; // null = プロジェクト共通（参加者全員）
  title: string;
  frequency: MeetingFrequency;
  daysOfWeek: DayOfWeek[]; // weekly のとき対象曜日。daily では未使用
  startTime: string; // 'HH:MM'（プロジェクトTZ）
  endTime: string; // 'HH:MM'
}
