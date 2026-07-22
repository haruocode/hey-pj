import type { ProjectRepository } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { calculateSchedule } from '../../domain/scheduling/SchedulingEngine';

// 再計算ユースケース（docs/design.md §5, §23）。
// スケジューリング入力が変わったら、入力を読み込み → エンジンで計算 → 結果を永続化する。
// エンジンは純粋なので、ここは「読み込み・計算・保存」の調整のみを担う。
export async function recalculateSchedule(
  repo: ProjectRepository,
  projectId: string,
): Promise<ScheduleResult> {
  const input = await repo.loadSchedulingInput(projectId);
  const result = calculateSchedule(input);
  await repo.saveScheduleResult(projectId, result);
  return result;
}
