import { useState } from 'react';
import type { ProjectView } from '../wbs/api';
import * as api from '../wbs/api';
import { minutesToHours, hoursToMinutes } from '../wbs/format';

const TIMEZONES = ['Asia/Tokyo', 'UTC'];

interface Props {
  projectId: string;
  view: ProjectView;
  onChanged: () => Promise<void>;
}

// プロジェクト設定画面。開始日・名前・タイムゾーン・メンバーの稼働を編集する。
// スケジューリング入力（開始日・稼働時間）を変えると即再計算され、WBS/ガントが追従する。
export function ProjectSettings({ projectId, view, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCap, setNewCap] = useState('8');
  // メンバーごとの「休日を追加」入力（memberId -> YYYY-MM-DD）。
  const [newHoliday, setNewHoliday] = useState<Record<string, string>>({});

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

  const project = view.project;

  function editName(value: string): void {
    const v = value.trim();
    if (v && v !== project.name) void run(() => api.updateProject(projectId, { name: v }));
  }
  function editStartDate(value: string): void {
    if (value && value !== project.startDate) {
      void run(() => api.updateProject(projectId, { startDate: value }));
    }
  }
  function editTimezone(value: string): void {
    if (value !== project.timezone) void run(() => api.updateProject(projectId, { timezone: value }));
  }
  function editWorkday(value: string): void {
    const h = Number(value);
    if (!Number.isFinite(h) || h <= 0) return;
    const m = hoursToMinutes(h);
    if (m !== project.defaultWorkdayMinutes) {
      void run(() => api.updateProject(projectId, { defaultWorkdayMinutes: m }));
    }
  }
  function editMemberName(memberId: string, current: string, value: string): void {
    const v = value.trim();
    if (v && v !== current) void run(() => api.updateMember(projectId, memberId, { name: v }));
  }
  function editMemberCap(memberId: string, current: number, value: string): void {
    const h = Number(value);
    if (!Number.isFinite(h) || h <= 0) return;
    const m = hoursToMinutes(h);
    if (m !== current) void run(() => api.updateMember(projectId, memberId, { dailyCapacityMinutes: m }));
  }
  function addMember(): void {
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      await api.addMember(projectId, { name, dailyCapacityMinutes: hoursToMinutes(Number(newCap) || 0) });
      setNewName('');
      setNewCap('8');
    });
  }
  function addHoliday(memberId: string): void {
    const date = (newHoliday[memberId] ?? '').trim();
    if (!date) return;
    void run(async () => {
      await api.addMemberHoliday(projectId, memberId, { date });
      setNewHoliday((prev) => ({ ...prev, [memberId]: '' }));
    });
  }
  function removeHoliday(memberId: string, holidayId: string): void {
    void run(() => api.removeMemberHoliday(projectId, memberId, holidayId));
  }

  return (
    <div className="settings">
      {error && <div className="wbs-error">エラー: {error}</div>}
      {busy && (
        <p className="wbs-sub">
          <span className="wbs-busy">再計算中…</span>
        </p>
      )}

      <section className="settings-section">
        <h2>プロジェクト</h2>
        <div className="settings-grid">
          <label>
            プロジェクト名
            <input
              key={`name:${project.name}`}
              defaultValue={project.name}
              disabled={busy}
              onBlur={(e) => editName(e.target.value)}
            />
          </label>
          <label>
            開始日
            <input
              type="date"
              value={project.startDate}
              disabled={busy}
              onChange={(e) => editStartDate(e.target.value)}
            />
          </label>
          <label>
            タイムゾーン
            <select value={project.timezone} disabled={busy} onChange={(e) => editTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label>
            1日の標準稼働(h)
            <input
              type="number"
              min={0}
              step={0.5}
              key={`wd:${project.defaultWorkdayMinutes}`}
              defaultValue={minutesToHours(project.defaultWorkdayMinutes)}
              disabled={busy}
              onBlur={(e) => editWorkday(e.target.value)}
            />
          </label>
        </div>
        <p className="wbs-note">
          開始日を変えると後続タスクの計画日がすべて自動で再計算されます。
        </p>
      </section>

      <section className="settings-section">
        <h2>メンバー</h2>
        <table className="settings-members">
          <thead>
            <tr>
              <th>名前</th>
              <th>1日の稼働(h)</th>
            </tr>
          </thead>
          <tbody>
            {view.members.map((m) => (
              <tr key={m.id}>
                <td>
                  <input
                    key={`mn:${m.id}:${m.name}`}
                    defaultValue={m.name}
                    disabled={busy}
                    onBlur={(e) => editMemberName(m.id, m.name, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    key={`mc:${m.id}:${m.dailyCapacityMinutes}`}
                    defaultValue={minutesToHours(m.dailyCapacityMinutes)}
                    disabled={busy}
                    onBlur={(e) => editMemberCap(m.id, m.dailyCapacityMinutes, e.target.value)}
                  />
                  <span className="unit">h</span>
                </td>
              </tr>
            ))}
            <tr className="settings-add">
              <td>
                <input
                  placeholder="新しいメンバー"
                  value={newName}
                  disabled={busy}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    // IME 変換確定の Enter は無視する。
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
                    addMember();
                  }}
                />
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={newCap}
                  disabled={busy}
                  onChange={(e) => setNewCap(e.target.value)}
                />
                <span className="unit">h</span>
                <button disabled={busy || !newName.trim()} onClick={addMember}>
                  追加
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="settings-section">
        <h2>メンバーの個人休日</h2>
        <p className="wbs-note">
          有給・私用などメンバー個人の休みを登録します。登録した日はそのメンバーだけ稼働 0
          となり、担当タスクの計画日が自動でその日を避けて再計算され、ガントにも反映されます。
        </p>
        <div className="member-holidays">
          {view.members.map((m) => {
            const holidays = view.memberHolidays
              .filter((h) => h.memberId === m.id)
              .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            return (
              <div key={m.id} className="member-holiday-row">
                <div className="member-holiday-name">{m.name}</div>
                <div className="member-holiday-chips">
                  {holidays.length === 0 && <span className="wbs-sub">休日なし</span>}
                  {holidays.map((h) => (
                    <span key={h.id} className="holiday-chip">
                      {h.date}
                      <button
                        type="button"
                        className="holiday-chip-remove"
                        disabled={busy}
                        title="削除"
                        onClick={() => removeHoliday(m.id, h.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="member-holiday-add">
                  <input
                    type="date"
                    value={newHoliday[m.id] ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      setNewHoliday((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busy || !(newHoliday[m.id] ?? '').trim()}
                    onClick={() => addHoliday(m.id)}
                  >
                    追加
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
