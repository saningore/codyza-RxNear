const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
type Day = (typeof DAYS)[number];

const WEEKDAY: Record<string, Day> = {
  Sun: "Su", Mon: "Mo", Tue: "Tu", Wed: "We", Thu: "Th", Fri: "Fr", Sat: "Sa",
};

const SINGLE_ZONE: Record<string, string> = {
  CT: "America/New_York", DE: "America/New_York", GA: "America/New_York", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", NH: "America/New_York", NJ: "America/New_York",
  NY: "America/New_York", NC: "America/New_York", OH: "America/New_York", PA: "America/New_York",
  RI: "America/New_York", SC: "America/New_York", VT: "America/New_York", VA: "America/New_York",
  WV: "America/New_York", DC: "America/New_York",
  AL: "America/Chicago", AR: "America/Chicago", IL: "America/Chicago", IA: "America/Chicago",
  LA: "America/Chicago", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago",
  OK: "America/Chicago", WI: "America/Chicago",
  CO: "America/Denver", MT: "America/Denver", NM: "America/Denver", UT: "America/Denver", WY: "America/Denver",
  CA: "America/Los_Angeles", WA: "America/Los_Angeles",
  HI: "Pacific/Honolulu",
  PR: "America/Puerto_Rico", GU: "Pacific/Guam", VI: "America/St_Thomas",
  AS: "Pacific/Pago_Pago", MP: "Pacific/Guam",
};

export function timeZoneForState(state: string | null | undefined): string | null {
  if (!state) return null;
  return SINGLE_ZONE[state.toUpperCase()] ?? null;
}

type Range = { days: Day[]; start: number; end: number };

function expandDays(token: string): Day[] | null {
  const range = token.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/);
  if (range) {
    const start = DAYS.indexOf(range[1] as Day);
    const end = DAYS.indexOf(range[2] as Day);
    if (start < 0 || end < start) return null;
    return DAYS.slice(start, end + 1);
  }
  if ((DAYS as readonly string[]).includes(token)) return [token as Day];
  return null;
}

function minutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 24 * 60;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function parseOpeningHours(value: string): Range[] | null {
  const text = value.trim();
  if (!text) return null;
  if (text === "24/7") {
    return [{ days: [...DAYS], start: 0, end: 24 * 60 }];
  }
  const ranges: Range[] = [];
  for (const part of text.split(";").map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/);
    if (!match) return null;
    const expanded = match[1].split(",").map(expandDays);
    if (expanded.some((item) => !item)) return null;
    const dayList = expanded.flatMap((item) => item ?? []);
    for (const span of match[2].split(",")) {
      const [from, to] = span.split("-");
      const start = minutes(from);
      const end = minutes(to);
      if (start === null || end === null || start === end) return null;
      ranges.push({ days: dayList, start, end });
    }
  }
  return ranges.length ? ranges : null;
}

function contains(range: Range, day: Day, minute: number): boolean {
  if (!range.days.includes(day)) return false;
  if (range.start < range.end) return minute >= range.start && minute < range.end;
  return minute >= range.start || minute < range.end;
}

export function localParts(now: Date, timeZone: string): { day: Day; minute: number } | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const day = WEEKDAY[weekday];
  if (!day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { day, minute: (hour === 24 ? 0 : hour) * 60 + minute };
}

export function openNowAt(hours: string, state: string | null, now: Date): boolean | null {
  const zone = timeZoneForState(state);
  if (!zone) return null;
  const ranges = parseOpeningHours(hours);
  if (!ranges) return null;
  const local = localParts(now, zone);
  if (!local) return null;
  return ranges.some((range) => contains(range, local.day, local.minute));
}

export const OPEN_NOTE = "Calculated from an OpenStreetMap hours tag in the state time zone. Call to confirm.";
export const SPLIT_ZONE_NOTE = "Open and closed are not calculated because this state has more than one time zone.";
