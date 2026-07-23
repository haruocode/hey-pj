import { Fragment } from 'react';
import type { ProjectView } from '../wbs/api';
import { formatMinutes } from '../wbs/format';
import { eachDate, isWeekend } from '../../domain/shared/calendar-date';

// 担当者ごとにバー色を割り当てて、並行作業を見分けやすくする。
const PALETTE = ['#0969da', '#1a7f37', '#9a6700', '#8250df', '#cf222e', '#bf3989'];

interface Props {
  view: ProjectView;
}

// ガントビュー（docs/design.md §31）。
// WBS と同じ計算済みスケジュール（dailyAllocations / 計画日）を別可視化するだけで、
// 独立したスケジュールは一切持たない。
export function GanttChart({ view }: Props) {
  const colorOf = (assigneeId: string | null): string => {
    if (assigneeId === null) return '#8c959f';
    const idx = view.members.findIndex((m) => m.id === assigneeId);
    return PALETTE[idx >= 0 ? idx % PALETTE.length : 0]!;
  };

  // メンバー個人休日の索引（`memberId:date`）。担当者が休みの暦日をセルに表示する。
  const memberOff = new Set(view.memberHolidays.map((h) => `${h.memberId}:${h.date}`));
  const nameOf = (memberId: string): string =>
    view.members.find((m) => m.id === memberId)?.name ?? memberId;
  const holidayLabelOf = (memberId: string, date: string): string | null => {
    const h = view.memberHolidays.find((x) => x.memberId === memberId && x.date === date);
    if (!h) return null;
    return `${nameOf(memberId)} 休日${h.name ? `（${h.name}）` : ''}｜${date}`;
  };

  const scheduled = view.tasks.filter((t) => t.plannedStartDate && t.plannedEndDate);
  if (scheduled.length === 0) {
    return (
      <div className="gantt">
        <p className="wbs-note">スケジュールされたタスクがありません。</p>
      </div>
    );
  }

  const start = view.project.startDate;
  const end = view.projectEndDate ?? start;
  const days = eachDate(start, end);

  // 日ヘッダーの上に「月」行を出す。連続する同一年月をまとめ、その日数分の列にまたがらせる。
  const months: { ym: string; label: string; span: number }[] = [];
  for (const d of days) {
    const ym = d.slice(0, 7); // YYYY-MM
    const last = months[months.length - 1];
    if (last && last.ym === ym) {
      last.span += 1;
    } else {
      months.push({ ym, label: `${Number(d.slice(0, 4))}年${Number(d.slice(5, 7))}月`, span: 1 });
    }
  }

  return (
    <div className="gantt">
      <div className="gantt-scroll">
        <div
          className="gantt-grid"
          style={{ gridTemplateColumns: `200px repeat(${days.length}, 26px)` }}
        >
          <div className="gantt-mcorner" />
          {months.map((mo) => (
            <div key={mo.ym} className="gantt-monthhead" style={{ gridColumn: `span ${mo.span}` }}>
              <span className="gantt-monthlabel">{mo.label}</span>
            </div>
          ))}

          <div className="gantt-corner">タスク</div>
          {days.map((d) => (
            <div key={d} className={`gantt-dayhead${isWeekend(d) ? ' weekend' : ''}`} title={d}>
              {d.slice(8)}
            </div>
          ))}

          {view.tasks.map((task) => {
            const alloc = new Map(task.dailyAllocations.map((a) => [a.date, a.minutes]));
            return (
              <Fragment key={task.id}>
                <div className="gantt-label" title={task.title}>
                  {task.title}
                </div>
                {days.map((d) => {
                  const m = alloc.get(d);
                  if (m !== undefined) {
                    return (
                      <div
                        key={d}
                        className="gantt-cell work"
                        style={{ backgroundColor: colorOf(task.assigneeId) }}
                        title={`${task.title}｜${d}: ${formatMinutes(m)}`}
                      />
                    );
                  }
                  const off =
                    task.assigneeId !== null && memberOff.has(`${task.assigneeId}:${d}`);
                  if (off) {
                    return (
                      <div
                        key={d}
                        className="gantt-cell holiday"
                        title={holidayLabelOf(task.assigneeId!, d) ?? d}
                      />
                    );
                  }
                  return (
                    <div
                      key={d}
                      className={`gantt-cell${isWeekend(d) ? ' weekend' : ''}`}
                      title={d}
                    />
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      <p className="wbs-note">
        同じ計算済みスケジュールの別可視化です（WBS と同一データ）。色は担当者を表します。
        斜線のセルは担当者の個人休日で、その日は割り当てられません。
      </p>
    </div>
  );
}
