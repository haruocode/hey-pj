import { useState, type DragEvent } from 'react';
import type { ProjectView, ProjectViewTask } from './api';
import * as api from './api';
import { formatMinutes, statusLabel, conflictMessage, minutesToHours, hoursToMinutes } from './format';
import type { TaskStatus } from '../../domain/task/Task';

const STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'done'];

interface Props {
  projectId: string;
  view: ProjectView;
  onChanged: () => Promise<void>;
}

export function WbsTable({ projectId, view, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newEstimate, setNewEstimate] = useState('8'); // 時間(h)
  const [newAssignee, setNewAssignee] = useState(view.members[0]?.id ?? '');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const titleOf = (taskId: string): string =>
    view.tasks.find((t) => t.id === taskId)?.title ?? taskId;

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function editTitle(task: ProjectViewTask, value: string): void {
    const v = value.trim();
    if (v && v !== task.title) void run(() => api.updateTask(projectId, task.id, { title: v }));
  }
  function editEstimate(task: ProjectViewTask, value: string): void {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours < 0) return;
    const min = hoursToMinutes(hours);
    if (min !== task.estimatedMinutes) {
      void run(() => api.updateTask(projectId, task.id, { estimatedMinutes: min }));
    }
  }
  function editAssignee(task: ProjectViewTask, value: string): void {
    void run(() => api.assignMember(projectId, task.id, value || null));
  }
  function editStatus(task: ProjectViewTask, value: string): void {
    void run(() => api.updateTask(projectId, task.id, { status: value as TaskStatus }));
  }
  function move(index: number, delta: number): void {
    const ids = view.tasks.map((t) => t.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to]!, ids[index]!];
    void run(() => api.reorderTasks(projectId, ids));
  }

  // ドラッグ&ドロップ並び替え（HTML5 ネイティブ）。ハンドルから開始し、行が drop 先。
  function startDrag(index: number, e: DragEvent<HTMLElement>): void {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index)); // Firefox は setData がないと開始しない
  }
  function endDrag(): void {
    setDragIndex(null);
    setOverIndex(null);
  }
  function onRowDragOver(index: number, e: DragEvent<HTMLTableRowElement>): void {
    if (dragIndex === null) return;
    e.preventDefault(); // drop を許可
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  }
  function onRowDrop(index: number, e: DragEvent<HTMLTableRowElement>): void {
    e.preventDefault();
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from === null || from === index) return;
    const ids = view.tasks.map((t) => t.id);
    const draggedId = ids[from]!;
    const targetId = ids[index]!;
    // 行の上半分に落とせば手前、下半分なら後ろに挿入（末尾への移動も可能）。
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    const without = ids.filter((_, i) => i !== from);
    const pos = without.indexOf(targetId) + (after ? 1 : 0);
    without.splice(pos, 0, draggedId);
    void run(() => api.reorderTasks(projectId, without));
  }
  function addTask(): void {
    const title = newTitle.trim();
    if (!title) return;
    void run(async () => {
      await api.createTask(projectId, {
        title,
        estimatedMinutes: hoursToMinutes(Number(newEstimate) || 0),
        assigneeId: newAssignee || null,
        sortOrder: view.tasks.length,
      });
      setNewTitle('');
      setNewEstimate('8');
    });
  }

  return (
    <div className="wbs">
      {busy && (
        <p className="wbs-sub">
          <span className="wbs-busy">再計算中…</span>
        </p>
      )}

      {error && <div className="wbs-error">エラー: {error}</div>}

      {view.conflicts.length > 0 && (
        <ul className="wbs-conflicts">
          {view.conflicts.map((c, i) => (
            <li key={i}>⚠ {conflictMessage(c, titleOf)}</li>
          ))}
        </ul>
      )}

      <table className="wbs-table">
        <thead>
          <tr>
            <th className="col-num">#</th>
            <th className="col-title">タスク</th>
            <th className="col-est">見積(h)</th>
            <th className="col-assignee">担当者</th>
            <th className="col-date">計画開始</th>
            <th className="col-date">計画終了</th>
            <th className="col-status">ステータス</th>
            <th className="col-move"></th>
          </tr>
        </thead>
        <tbody>
          {view.tasks.map((task, i) => (
            <tr
              key={task.id}
              onDragOver={busy ? undefined : (e) => onRowDragOver(i, e)}
              onDrop={busy ? undefined : (e) => onRowDrop(i, e)}
              className={
                dragIndex === i ? 'dragging' : overIndex === i && dragIndex !== null ? 'drag-over' : ''
              }
            >
              <td className="col-num">
                <span
                  className="drag-handle"
                  draggable={!busy}
                  onDragStart={(e) => startDrag(i, e)}
                  onDragEnd={endDrag}
                  title="ドラッグで並び替え"
                  aria-label="ドラッグで並び替え"
                >
                  ⠿
                </span>
                <span className="row-num">{i + 1}</span>
              </td>
              <td className="col-title">
                <input
                  key={`title:${task.id}:${task.title}`}
                  defaultValue={task.title}
                  disabled={busy}
                  onBlur={(e) => editTitle(task, e.target.value)}
                />
              </td>
              <td className="col-est">
                <input
                  key={`est:${task.id}:${task.estimatedMinutes}`}
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={minutesToHours(task.estimatedMinutes)}
                  disabled={busy}
                  onBlur={(e) => editEstimate(task, e.target.value)}
                  title={formatMinutes(task.estimatedMinutes)}
                />
                <span className="unit">h</span>
              </td>
              <td className="col-assignee">
                <select
                  value={task.assigneeId ?? ''}
                  disabled={busy}
                  onChange={(e) => editAssignee(task, e.target.value)}
                >
                  <option value="">未割当</option>
                  {view.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </td>
              {/* 計画日は計算値。編集不可であることを明示する。 */}
              <td className="col-date computed" title="自動計算">
                {task.plannedStartDate ?? '—'}
              </td>
              <td className="col-date computed" title="自動計算">
                {task.plannedEndDate ?? '—'}
              </td>
              <td className="col-status">
                <select
                  value={task.status}
                  disabled={busy}
                  onChange={(e) => editStatus(task, e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </td>
              <td className="col-move">
                <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="上へ">
                  ↑
                </button>
                <button
                  disabled={busy || i === view.tasks.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="下へ"
                >
                  ↓
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="wbs-add">
            <td className="col-num">＋</td>
            <td className="col-title">
              <input
                placeholder="新しいタスク"
                value={newTitle}
                disabled={busy}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
              />
            </td>
            <td className="col-est">
              <input
                type="number"
                min={0}
                step={0.5}
                value={newEstimate}
                disabled={busy}
                onChange={(e) => setNewEstimate(e.target.value)}
              />
              <span className="unit">h</span>
            </td>
            <td className="col-assignee">
              <select
                value={newAssignee}
                disabled={busy}
                onChange={(e) => setNewAssignee(e.target.value)}
              >
                <option value="">未割当</option>
                {view.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </td>
            <td className="col-date" />
            <td className="col-date" />
            <td className="col-status" />
            <td className="col-move">
              <button disabled={busy || !newTitle.trim()} onClick={addTask}>
                追加
              </button>
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="wbs-note">
        計画開始・計画終了は <span className="computed-legend">自動計算</span> された値です（手入力しません）。
      </p>
    </div>
  );
}
