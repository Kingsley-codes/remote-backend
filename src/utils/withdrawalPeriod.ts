// Calendar periods use Africa/Lagos (UTC+1), including on UTC production hosts.
const DAY = 86_400_000;
const OFFSET = 3_600_000;
export function withdrawalPeriod(period = "all", startDate?: string, endDate?: string, now = new Date()) {
  const local = new Date(now.getTime() + OFFSET);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET;
  const week = today - ((local.getUTCDay() + 6) % 7) * DAY;
  const month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET;
  let start: number;
  let end: number;
  switch (period) {
    case "all": return {};
    case "today": start = today; end = today + DAY; break;
    case "yesterday": start = today - DAY; end = today; break;
    case "this-week": start = week; end = week + 7 * DAY; break;
    case "last-week": start = week - 7 * DAY; end = week; break;
    case "this-month": start = month; end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - OFFSET; break;
    case "last-month": start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - OFFSET; end = month; break;
    case "custom": {
      const parse = (value?: string) => {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose valid start and end dates");
        const date = new Date(`${value}T00:00:00.000Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose valid start and end dates");
        return date.getTime() - OFFSET;
      };
      start = parse(startDate); end = parse(endDate) + DAY;
      if (start >= end) throw new Error("Start date must not be after end date");
      break;
    }
    default: throw new Error("Invalid withdrawal period");
  }
  return { createdAt: { $gte: new Date(start), $lt: new Date(end) } };
}
