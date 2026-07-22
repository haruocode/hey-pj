import type { IsoDate, Minutes } from '../shared/units';
import { minutes } from '../shared/units';
import type { Member } from '../member/Member';
import type { CalendarBlock } from './CalendarBlock';
import type { DayOfWeek, RecurringMeeting } from './RecurringMeeting';
import { dayOfWeek, isWeekend, eachDate } from '../shared/calendar-date';
import { instantToProjectDate, durationMinutes, timeToMinutes } from '../shared/timezone';

export interface ResourceCalendarInput {
  timezone: string;
  members: readonly Member[];
  holidays: readonly IsoDate[]; // 祝日 + 会社休日
  recurringMeetings: readonly RecurringMeeting[];
  calendarBlocks: readonly CalendarBlock[];
}

const FULL_DAY = Number.MAX_SAFE_INTEGER;

// あるメンバーの、ある暦日における「実効可用分」を算出する（docs/design.md §4.2）。
// 実効可用分 = メンバーの日次キャパシティ − 定例会議 − 休暇/ブロック（週末・祝日は 0）。
// 「1 稼働日 = 常に 8 時間」を前提にしない。
export class ResourceCalendar {
  private readonly membersById: Map<string, Member>;
  private readonly holidays: Set<string>;
  private readonly meetings: readonly RecurringMeeting[];
  /** memberId -> (date -> 控除分). メンバー固有の休暇等。 */
  private readonly memberDeductions: Map<string, Map<string, number>>;
  /** 全員に適用される休業日（type='holiday' または memberId=null のブロック）。 */
  private readonly orgClosedDates: Set<string>;

  constructor(input: ResourceCalendarInput) {
    this.membersById = new Map(input.members.map((m) => [m.id, m]));
    this.holidays = new Set(input.holidays);
    this.meetings = input.recurringMeetings;
    this.memberDeductions = new Map();
    this.orgClosedDates = new Set();
    this.indexBlocks(input.calendarBlocks, input.timezone);
  }

  private indexBlocks(blocks: readonly CalendarBlock[], timezone: string): void {
    for (const block of blocks) {
      const startDate = instantToProjectDate(block.startAt, timezone);
      const endDate = instantToProjectDate(block.endAt, timezone);
      const dates = eachDate(startDate, endDate);

      // 全社的な休業（祝日ブロック、または対象者を限定しないブロック）は全員 0 とする。
      if (block.type === 'holiday' || block.memberId === null) {
        for (const d of dates) this.orgClosedDates.add(d);
        continue;
      }

      const memberId = block.memberId;
      const perDate = this.getOrCreateMemberMap(memberId);
      if (startDate === endDate) {
        // 単日ブロック: 実際の所要分を控除（終日休暇→大きな値、半日休暇→240 など）。
        this.addDeduction(perDate, startDate, durationMinutes(block.startAt, block.endAt));
      } else {
        // 複数日にまたがるブロックは、各日を終日控除として扱う（MVP の近似）。
        for (const d of dates) this.addDeduction(perDate, d, FULL_DAY);
      }
    }
  }

  private getOrCreateMemberMap(memberId: string): Map<string, number> {
    let perDate = this.memberDeductions.get(memberId);
    if (!perDate) {
      perDate = new Map();
      this.memberDeductions.set(memberId, perDate);
    }
    return perDate;
  }

  private addDeduction(perDate: Map<string, number>, date: string, amount: number): void {
    perDate.set(date, (perDate.get(date) ?? 0) + amount);
  }

  private meetingMinutesFor(memberId: string, date: IsoDate): number {
    const wd = dayOfWeek(date) as DayOfWeek;
    let total = 0;
    for (const meeting of this.meetings) {
      if (meeting.memberId !== null && meeting.memberId !== memberId) continue;
      const applies =
        meeting.frequency === 'daily' ||
        (meeting.frequency === 'weekly' && meeting.daysOfWeek.includes(wd));
      if (!applies) continue;
      total += timeToMinutes(meeting.endTime) - timeToMinutes(meeting.startTime);
    }
    return total;
  }

  /** メンバーの、その暦日における実効可用分（0 以上）。 */
  availableMinutes(memberId: string, date: IsoDate): Minutes {
    const member = this.membersById.get(memberId);
    if (!member) return minutes(0);
    if (isWeekend(date)) return minutes(0);
    if (this.holidays.has(date)) return minutes(0);
    if (this.orgClosedDates.has(date)) return minutes(0);

    const base = member.dailyCapacityMinutes as number;
    const deduction =
      this.meetingMinutesFor(memberId, date) +
      (this.memberDeductions.get(memberId)?.get(date) ?? 0);

    return minutes(Math.max(0, base - deduction));
  }

  isWorkingDay(memberId: string, date: IsoDate): boolean {
    return this.availableMinutes(memberId, date) > 0;
  }
}
