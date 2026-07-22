import type { ProjectRepository } from '../ports';
import type { ScheduleResult } from '../../domain/scheduling/types';
import { calculateSchedule } from '../../domain/scheduling/SchedulingEngine';

// スケジュール取得（読み取り専用）。エンジンは決定論的なので、
// 保存済みキャッシュと同じ結果を再計算で得られる。保存は行わない。
export async function getSchedule(
  repo: ProjectRepository,
  projectId: string,
): Promise<ScheduleResult> {
  const input = await repo.loadSchedulingInput(projectId);
  return calculateSchedule(input);
}
