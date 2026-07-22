import { useRef, useState, type PointerEvent } from 'react';
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

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
  // ポインタベースのドラッグ&ドロップ並び替え。ドラッグ中は行を実際に並べ替えて
  // プレビュー表示し（着地点が見える）、離した位置で確定→再計算する。
  // ハンドルからのみ開始するので、セルの編集操作とは干渉しない。
  const displayTasks: ProjectViewTask[] =
    order === null
      ? view.tasks
      : order
          .map((id) => view.tasks.find((t) => t.id === id))
          .filter((t): t is ProjectViewTask => t !== undefined);

  function previewOrder(draggedId: string, pointerY: number): string[] {
    const current = order ?? view.tasks.map((t) => t.id);
    const others = current.filter((id) => id !== draggedId);
    let insertAt = others.length;
    for (let i = 0; i < others.length; i++) {
      const el = rowRefs.current.get(others[i]!);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        insertAt = i;
        break;
      }
    }
    const next = [...others];
    next.splice(insertAt, 0, draggedId);
    return next;
  }

  function handleDragStart(taskId: string, e: PointerEvent<HTMLElement>): void {
    if (busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(taskId);
    setOrder(view.tasks.map((t) => t.id));
  }
  function handleDragMove(e: PointerEvent<HTMLElement>): void {
    if (dragId === null) return;
    setOrder(previewOrder(dragId, e.clientY));
  }
  function handleDragEnd(e: PointerEvent<HTMLElement>): void {
    if (dragId === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const finalOrder = order;
    setDragId(null);
    const baseline = view.tasks.map((t) => t.id).join();
    if (finalOrder && finalOrder.join() !== baseline) {
      void commitOrder(finalOrder);
    } else {
      setOrder(null);
    }
  }
  async function commitOrder(ids: string[]): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.reorderTasks(projectId, ids);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setOrder(null); // 並び替え後の view に切り替える（順序は一致するので跳ねない）
    }
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
          </tr>
        </thead>
        <tbody>
          {displayTasks.map((task, i) => (
            <tr
              key={task.id}
              ref={(el) => {
                if (el) rowRefs.current.set(task.id, el);
                else rowRefs.current.delete(task.id);
              }}
              className={dragId === task.id ? 'dragging' : ''}
            >
              <td className="col-num">
                <span
                  className="drag-handle"
                  onPointerDown={(e) => handleDragStart(task.id, e)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
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
            <td className="col-status">
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
