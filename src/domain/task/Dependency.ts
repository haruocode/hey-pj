// タスク依存関係（docs/design.md §2.4）。
// MVP は Finish-to-Start のみをサポートする。将来 SS / FF / SF を追加できるよう型で表現しておく。
export type DependencyType = 'FS';

export interface TaskDependency {
  id: string;
  predecessorTaskId: string; // 先行タスク
  successorTaskId: string; // 後続タスク
  type: DependencyType;
}
