# HeyPJ! 設計書（MVP）

本ドキュメントは、実装に入る前に確定させた設計方針をまとめたものです。
プロダクト哲学・要件の詳細は [../AGENTS.md](../AGENTS.md) を、概要は [../README.md](../README.md) を参照してください。

> **人が管理するのは、作業・工数・担当・依存関係。日付の管理は HeyPJ! に任せる。**

---

## 0. 設計の前提と優先順位

AGENTS.md §45 の優先順位に従う。

1. スケジューリングの正確性
2. データ整合性
3. WBS 編集のしやすさ
4. 明確なドメインモデル
5. テスト可能性
6. パフォーマンス
7. 視覚的な洗練
8. 追加機能

**エンジン・ファースト**で進める。スケジューリングコアは Cloudflare 非依存・純粋・決定論的・単体テスト可能に保ち、D1 / Durable Objects / UI はエンジンを「呼ぶ器」とする。

### 確定した設計論点

| 論点 | 決定 | 理由 |
| --- | --- | --- |
| A: 計算値（planned_start/end・日次割当）の持たせ方 | **Task と分離**。`ScheduleResult` に持ち、DB へはキャッシュとして書き戻す | 「計算値を手作業で永続化しない」（AGENTS.md §46-7）。入力と出力を明確に分離 |
| B: MVP の定例会議（繰り返し）表現 | **曜日 + 時刻の簡易形**。RRULE は不採用（将来拡張） | MVP を軽くし、エンジンのテストを書きやすくする |

---

## 1. ディレクトリ構成

AGENTS.md §35 に準拠。

```text
src/
  domain/          # 純粋なドメイン。フレームワーク非依存
    shared/        #   単位・ブランド型（Minutes / IsoDate 等）
    project/
    phase/
    task/          #   Task / TaskDependency
    member/
    calendar/      #   CalendarBlock / RecurringMeeting / ResourceCalendar
    scheduling/    #   SchedulingEngine / ScheduleCalculator / DependencyResolver
  application/     # ユースケース
    create-task/
    reorder-task/
    assign-member/
    recalculate-schedule/
  infrastructure/  # Cloudflare 依存はここに隔離
    database/      #   D1 マイグレーション / クエリ
    repositories/  #   ドメイン ⇄ D1 の変換
  features/        # UI（React）
    wbs/
    gantt/
    members/
    calendars/
migrations/        # D1 マイグレーション SQL
```

スケジューリングロジックを React コンポーネントや Durable Object の中に埋め込まない。

---

## 2. ドメイン型（`src/domain`）

工数は整数分、日付はプロジェクトのタイムゾーン基準。浮動小数点の日数計算は用いない。

### 2.1 単位・ブランド型

```typescript
// domain/shared/units.ts
type Minutes = number & { readonly __brand: 'Minutes' };        // 整数分のみ
type IsoDate = string & { readonly __brand: 'IsoDate' };        // 'YYYY-MM-DD'（プロジェクトTZ基準の暦日）
type IsoDateTime = string & { readonly __brand: 'IsoDateTime' };// UTC ISO8601
```

### 2.2 Project

```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  startDate: IsoDate;                 // スケジューリングの起点
  timezone: string;                   // 既定 'Asia/Tokyo'
  defaultWorkdayMinutes: Minutes;     // 既定 480
}
```

### 2.3 Phase

```typescript
interface Phase {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;                  // 順序は可変。ウォーターフォール固定にしない（フェーズ重複あり）
}
```

### 2.4 Task / TaskDependency

```typescript
type TaskStatus = 'not_started' | 'in_progress' | 'done';

interface Task {
  id: string;
  projectId: string;
  phaseId: string | null;
  parentTaskId: string | null;        // 階層。WBS番号(1.1.1)は保持せず、階層と順序から導出
  title: string;
  description: string;
  estimatedMinutes: Minutes;
  actualMinutes: Minutes;             // 見積とは独立。見積を実績で上書きしない
  assigneeId: string | null;
  sortOrder: number;
  status: TaskStatus;
  // planned_* / actual_* は Task 本体には持たせない（論点A）。
  // planned_* は ScheduleResult 側の計算値、actual_* は別途の実績記録。
}

type DependencyType = 'FS';           // MVPは Finish-to-Start のみ。型は将来拡張可能に
interface TaskDependency {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: DependencyType;
}
```

> 行順（sortOrder）は自動的に依存順を意味しない（AGENTS.md §46-8）。依存は `TaskDependency` で明示的に表現する。

### 2.5 Member

```typescript
interface Member {
  id: string;
  workspaceId: string;
  name: string;
  dailyCapacityMinutes: Minutes;      // 既定 480
}
```

### 2.6 CalendarBlock / RecurringMeeting

単発の利用不可期間（休暇・祝日・出張など）は `CalendarBlock` で統一表現する（AGENTS.md §18）。

```typescript
type BlockType = 'leave' | 'holiday' | 'training' | 'business_trip' | 'internal_event' | 'other';

interface CalendarBlock {
  id: string;
  memberId: string | null;           // null = プロジェクト/組織全体（祝日など）
  projectId: string | null;
  type: BlockType;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  title: string;
}
```

定例会議は **曜日 + 時刻の簡易形**で表現する（論点B。RRULE は将来拡張）。

```typescript
type MeetingFrequency = 'daily' | 'weekly';   // daily = 稼働日ごと

interface RecurringMeeting {
  id: string;
  projectId: string;
  memberId: string | null;           // null = 参加者全員（プロジェクト共通）
  title: string;
  frequency: MeetingFrequency;
  daysOfWeek: number[];              // weekly のとき対象曜日 [0=日 .. 6=土]。daily では未使用
  startTime: string;                 // 'HH:MM'（プロジェクトTZ）
  endTime: string;                   // 'HH:MM'
}
```

> 例：デイリースタンドアップ = `{ frequency: 'daily', startTime: '11:00', endTime: '11:30' }`。
> 顧客定例 = `{ frequency: 'weekly', daysOfWeek: [2], startTime: '14:00', endTime: '15:00' }`。

半日休暇は `CalendarBlock('leave')` の時間帯で表現する（午前休 = 稼働開始〜正午、など）。

---

## 3. データベース設計（D1 / SQLite）

工数は整数分で保存。スキーマ変更は wrangler の D1 マイグレーションで管理。

`migrations/0001_init.sql`:

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  default_workday_minutes INTEGER NOT NULL DEFAULT 480,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  daily_capacity_minutes INTEGER NOT NULL DEFAULT 480
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  phase_id TEXT REFERENCES phases(id),
  parent_task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  assignee_id TEXT REFERENCES members(id),
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  -- 実績の記録値（手動 or 作業ログ由来）
  actual_start_at TEXT,
  actual_end_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  predecessor_task_id TEXT NOT NULL REFERENCES tasks(id),
  successor_task_id   TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL DEFAULT 'FS',
  UNIQUE(predecessor_task_id, successor_task_id)
);

CREATE TABLE calendar_blocks (
  id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(id),
  project_id TEXT REFERENCES projects(id),
  type TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recurring_meetings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  member_id TEXT REFERENCES members(id),
  title TEXT NOT NULL,
  frequency TEXT NOT NULL,            -- 'daily' | 'weekly'
  days_of_week TEXT NOT NULL DEFAULT '', -- 'weekly' のとき CSV 例 '2' / '1,3'
  start_time TEXT NOT NULL,           -- 'HH:MM'
  end_time TEXT NOT NULL
);

-- 論点A: スケジュール計算結果のキャッシュ（source of truth はエンジン出力）
CREATE TABLE task_schedule (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  planned_start_at TEXT,
  planned_end_at TEXT,
  computed_at TEXT NOT NULL
);

-- 日次割り当ての明細（AGENTS.md §21：スケジュールの説明可能性のため保持）
CREATE TABLE task_daily_allocations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  work_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  allocated_minutes INTEGER NOT NULL
);
```

> `task_schedule` と `task_daily_allocations` はエンジン出力の書き戻し先。再計算のたびに当該プロジェクト分を洗い替える。

---

## 4. スケジューリングエンジン（`src/domain/scheduling`）

「同じ入力 → 同じ出力」の決定論的コア。DB・Durable Object・`Date.now()`・実行環境の TZ に依存しない純粋関数。

### 4.1 入出力インターフェース

```typescript
interface SchedulingInput {
  project: {
    startDate: IsoDate;
    timezone: string;
    defaultWorkdayMinutes: Minutes;
  };
  tasks: ReadonlyArray<Task>;                        // sortOrder 順・階層込み
  dependencies: ReadonlyArray<TaskDependency>;
  members: ReadonlyArray<Member>;
  calendarBlocks: ReadonlyArray<CalendarBlock>;      // 祝日・休暇・出張などの単発ブロック
  recurringMeetings: ReadonlyArray<RecurringMeeting>;// 定例会議
  holidays: ReadonlyArray<IsoDate>;                  // 日本の祝日 + 会社休日（暦日リスト）
  horizon: { from: IsoDate; to: IsoDate };           // 計算対象期間（会議展開・打ち切りの範囲）
}

interface ScheduledTask {
  taskId: string;
  plannedStartAt: IsoDateTime;
  plannedEndAt: IsoDateTime;
  dailyAllocations: ReadonlyArray<{ date: IsoDate; minutes: Minutes }>;
}

type Conflict =
  | { kind: 'cyclic_dependency'; taskIds: string[] }
  | { kind: 'resource_overallocation'; memberId: string; date: IsoDate; over: Minutes }
  | { kind: 'capacity_exhausted'; taskId: string }              // horizon 内に割り当てきれない
  | { kind: 'assigned_on_full_leave'; taskId: string; date: IsoDate }
  | { kind: 'unassigned_task'; taskId: string };                // 担当者未設定

interface ScheduleResult {
  scheduledTasks: ReadonlyArray<ScheduledTask>;
  projectEndDate: IsoDate | null;
  conflicts: ReadonlyArray<Conflict>;                // 循環依存は必ずここでエラー化（黙認しない）
}

// エントリポイント
function calculateSchedule(input: SchedulingInput): ScheduleResult;
```

### 4.2 内部コンポーネント

- **`ResourceCalendar`** — `availableMinutes(memberId, date): Minutes` を返す。
  `defaultWorkdayMinutes` から、週末・祝日・休日・当該メンバーの休暇（終日/半日）・定例会議・単発ブロックを差し引いた**実効可用分**を算出する。
  「1 稼働日 = 常に 8 時間スケジュール可能」とは想定しない。
- **`DependencyResolver`** — Finish-to-Start 依存のトポロジカルソート。計算前に**循環を検出**して `cyclic_dependency` を返す。
- **`ScheduleCalculator`** — 依存順に各タスクを処理。
  - 計画開始 = max(プロジェクト稼働可能, 先行タスク完了後の可用時刻, 担当者の可用時刻)
  - 見積分を、担当者の日次実効可用分にわたって消費し、消費しきった時点を計画終了とする。
  - 消費過程を `dailyAllocations` として記録（説明可能性）。

### 4.3 タイムゾーン方針

- Workers は UTC 実行。暦日計算は必ず `project.timezone`（既定 `Asia/Tokyo`）で行う。
- サーバー / ブラウザの TZ を信頼しない。境界（週末・祝日・日跨ぎ）は必ずプロジェクト TZ で判定。

---

## 5. 再計算フロー

スケジューリング入力が変わったら再計算する（AGENTS.md §23）。トリガー：

タスクの並び替え / 見積工数の変更 / 担当者の変更 / 依存関係の変更 / メンバーの休暇追加 / 会議の追加・削除 / 休日の追加 / プロジェクト開始日の変更。

- MVP はプロジェクト全体の再計算で可（正確性優先、早すぎる最適化を避ける）。
- 再計算はプロジェクトの **Durable Object** を通して**直列**に実行し、競合状態を避ける。
- ロジックは DO に埋め込まず、DO は `calculateSchedule` を呼ぶ調整レイヤーに徹する。
- 結果を `task_schedule` / `task_daily_allocations` に洗い替え保存し、WebSocket で WBS に反映。

---

## 6. インフラ（Cloudflare）

| レイヤー | 採用技術 |
| --- | --- |
| フロントエンド（WBS / ガント UI） | React SPA（Workers Static Assets 配信） |
| バックエンド API | Cloudflare Workers |
| データベース | Cloudflare D1（SQLite） |
| プロジェクト単位の調整・再計算・同時編集 | Durable Objects（プロジェクトごとに 1 インスタンス） |
| セッション / キャッシュ | Workers KV |
| ファイル（Excel 入出力など） | R2 |

- ドメインコアは Cloudflare 固有 API に非依存。D1 / DO / KV / R2 へのアクセスは infrastructure / repositories 層の背後に隠す。
- Durable Objects 注意：1 インスタンス約 1,000 req/s 上限、alarm は 1 インスタンス 1 つ（キューパターンで束ねる）、ハイバネーションで in-memory 状態は失われるため確定データは D1 / DO ストレージへ永続化。

---

## 7. テスト方針（エンジン優先・TDD）

スケジューリングエンジンには広範な自動テストを置く（AGENTS.md §39）。最低限：

通常の連続タスク / 週末スキップ / 祝日スキップ / 終日休暇 / 午前休 / 午後休 / 毎日の定例会議 / 週次の顧客会議 / 担当者変更 / タスク並び替え / 依存スケジューリング / 複数依存 / 並行担当者 / 複数プロジェクトの同一メンバー / リソースキャパ枯渇 / 循環依存検出 / プロジェクト開始日変更。

**代表シナリオ（回帰テストの基準）:**

```text
プロジェクト開始: 月曜
タスク: 960分
メンバーキャパ: 480分/日
毎日の会議: 30分/日
実効キャパ: 450分/日

期待:
1日目 450分 / 2日目 450分 / 3日目 60分  → タスクは3日目に完了
```

---

## 8. MVP スコープと進行ステップ

**MVP スコープ:** 認証 / プロジェクト / メンバー / フェーズ / タスク（階層・並び替え）/ 見積・実績工数 / 担当者 / Finish-to-Start 依存 / 週末・日本の祝日 / メンバーの休暇（終日・半日）/ 定例会議 / 自動スケジューリング / 自動計画開始日・終了日 / 基本的なリソース競合検出 / WBS テーブル。

**進行ステップ（エンジン・ファースト）:**

1. **足場** — Vite + React + TS / Vitest / Wrangler。ディレクトリ骨格のみ。
2. **ドメイン型** — 本書 §2 の型と値オブジェクトを定義。
3. **スケジューリングエンジン** — §7 のテストを先に書き、`ResourceCalendar` → `DependencyResolver` → `ScheduleCalculator` を TDD で実装。★最重要
4. **永続化 + アプリケーション層** — D1 マイグレーション（§3）、リポジトリ、`create-task` / `reorder-task` / `assign-member` / `recalculate-schedule`。
5. **Durable Object** — プロジェクト 1 インスタンス。再計算の直列化と WebSocket 同期。
6. **WBS UI** — Excel ライクなテーブル。計画日は計算値として表示。
7. **以降** — ガント / Excel 入出力 / 影響分析（後回しリスト）。

---

## 9. 後回し（MVP では実装しない）

AI アシスタント / Wiki / チャット / 複雑なダッシュボード / 財務管理 / CRM / タイムトラッキングのデスクトップエージェント / 複雑な外部連携 / 双方向カレンダー同期 / 4 種類すべての依存タイプ / 高度な最適化アルゴリズム / キャパシティ配分（%）/ シナリオシミュレーション。

> スケジューリングエンジンこそがプロダクト。
