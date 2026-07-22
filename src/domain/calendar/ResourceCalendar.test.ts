import { describe, it, expect } from 'vitest';
import { ResourceCalendar } from './ResourceCalendar';
import type { Member } from '../member/Member';
import type { CalendarBlock } from './CalendarBlock';
import type { RecurringMeeting } from './RecurringMeeting';
import { minutes, isoDate } from '../shared/units';
import type { IsoDate, IsoDateTime } from '../shared/units';

const ito: Member = {
  id: 'm-ito',
  workspaceId: 'w1',
  name: '伊藤',
  dailyCapacityMinutes: minutes(480),
};

function build(overrides: {
  holidays?: IsoDate[];
  meetings?: RecurringMeeting[];
  blocks?: CalendarBlock[];
}): ResourceCalendar {
  return new ResourceCalendar({
    timezone: 'Asia/Tokyo',
    members: [ito],
    holidays: overrides.holidays ?? [],
    recurringMeetings: overrides.meetings ?? [],
    calendarBlocks: overrides.blocks ?? [],
  });
}

const MON = isoDate('2026-08-03');
const TUE = isoDate('2026-08-04');
const WED = isoDate('2026-08-05');
const SAT = isoDate('2026-08-08');

describe('ResourceCalendar.availableMinutes', () => {
  it('通常の稼働日はキャパシティ全量', () => {
    const cal = build({});
    expect(cal.availableMinutes('m-ito', MON)).toBe(480);
  });

  it('未知のメンバーは 0', () => {
    const cal = build({});
    expect(cal.availableMinutes('unknown', MON)).toBe(0);
  });

  it('週末は 0', () => {
    const cal = build({});
    expect(cal.availableMinutes('m-ito', SAT)).toBe(0);
  });

  it('祝日は 0', () => {
    const cal = build({ holidays: [MON] });
    expect(cal.availableMinutes('m-ito', MON)).toBe(0);
  });

  it('毎日の定例会議(30分)を控除する', () => {
    const daily: RecurringMeeting = {
      id: 'mtg-daily',
      projectId: 'p1',
      memberId: null,
      title: 'デイリースタンドアップ',
      frequency: 'daily',
      daysOfWeek: [],
      startTime: '11:00',
      endTime: '11:30',
    };
    const cal = build({ meetings: [daily] });
    expect(cal.availableMinutes('m-ito', MON)).toBe(450);
  });

  it('週次会議は該当曜日のみ控除する', () => {
    const weekly: RecurringMeeting = {
      id: 'mtg-weekly',
      projectId: 'p1',
      memberId: null,
      title: '顧客定例',
      frequency: 'weekly',
      daysOfWeek: [2], // 火曜
      startTime: '14:00',
      endTime: '15:00',
    };
    const cal = build({ meetings: [weekly] });
    expect(cal.availableMinutes('m-ito', TUE)).toBe(420); // 火曜は 60 控除
    expect(cal.availableMinutes('m-ito', MON)).toBe(480); // 月曜は控除なし
  });

  it('終日休暇は 0', () => {
    const leave: CalendarBlock = {
      id: 'lv-full',
      memberId: 'm-ito',
      projectId: 'p1',
      type: 'leave',
      startAt: '2026-08-05T00:00:00Z' as IsoDateTime, // 09:00 JST
      endAt: '2026-08-05T09:00:00Z' as IsoDateTime, // 18:00 JST (540分)
      title: '終日休暇',
    };
    const cal = build({ blocks: [leave] });
    expect(cal.availableMinutes('m-ito', WED)).toBe(0);
  });

  it('半日休暇(240分)を控除する', () => {
    const halfDay: CalendarBlock = {
      id: 'lv-half',
      memberId: 'm-ito',
      projectId: 'p1',
      type: 'leave',
      startAt: '2026-08-05T00:00:00Z' as IsoDateTime, // 09:00 JST
      endAt: '2026-08-05T04:00:00Z' as IsoDateTime, // 13:00 JST (240分)
      title: '午前休',
    };
    const cal = build({ blocks: [halfDay] });
    expect(cal.availableMinutes('m-ito', WED)).toBe(240);
  });
});
