import type { Conflict } from '../../domain/scheduling/types';

// 画面表示は時間(h)、内部は整数分。分↔時間の変換はここに集約する。
export function minutesToHours(min: number): number {
  return Number((min / 60).toFixed(2)); // 末尾ゼロを落とす（480→8, 90→1.5）
}
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

// 分を人間向けに表示（480分=1人日）。UI 表示専用。内部計算は常に整数分。
export function formatMinutes(min: number): string {
  if (min === 0) return '—';
  if (min % 480 === 0) return `${min / 480}人日`;
  if (min % 60 === 0) return `${min / 60}時間`;
  return `${min}分`;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  done: '完了',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function conflictMessage(conflict: Conflict, titleOf: (taskId: string) => string): string {
  switch (conflict.kind) {
    case 'cyclic_dependency':
      return `循環依存: ${conflict.taskIds.map(titleOf).join(' → ')}`;
    case 'unassigned_task':
      return `担当者未設定: ${titleOf(conflict.taskId)}`;
    case 'capacity_exhausted':
      return `期間内に収まりません: ${titleOf(conflict.taskId)}`;
    case 'resource_overallocation':
      return `リソース過剰割り当て: ${conflict.memberId} (${conflict.date})`;
    case 'assigned_on_full_leave':
      return `休暇日に割り当て: ${titleOf(conflict.taskId)} (${conflict.date})`;
  }
}
