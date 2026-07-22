// タスクはフェーズに属することができる（docs/design.md §2.3）。
// フェーズの順序は可変。厳密なウォーターフォールを前提にせず、フェーズの重複も許容する。
export interface Phase {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
}
