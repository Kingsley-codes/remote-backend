import { normalizeStage, type FarmCategory } from "./productionStages.js";

export interface TrackInput {
  name?: string;
  startMonth: number;
  endMonth: number;
  stage?: string;
}

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const trackMonthCount = (startMonth: number, endMonth: number) =>
  ((endMonth - startMonth + 12) % 12) + 1;

export function parseTracks(value: unknown): TrackInput[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); }
    catch { throw new Error("Tracks must be a valid JSON array"); }
  }
  if (!Array.isArray(value) || value.length === 0) throw new Error("At least one track is required");
  return value.map((item) => ({
    name: typeof item?.name === "string" ? item.name.trim() : undefined,
    startMonth: Number(item?.startMonth),
    endMonth: Number(item?.endMonth),
    stage: typeof item?.stage === "string" ? item.stage : undefined,
  }));
}

export function validateTracks(input: TrackInput[], duration: number, category: FarmCategory) {
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 12) {
    throw new Error("Duration must be a whole number between 1 and 12 months");
  }
  const seen = new Set<string>();
  return input.map((track) => {
    if (!Number.isSafeInteger(track.startMonth) || track.startMonth < 1 || track.startMonth > 12 || !Number.isSafeInteger(track.endMonth) || track.endMonth < 1 || track.endMonth > 12) {
      throw new Error("Track months must be whole numbers between 1 and 12");
    }
    if (trackMonthCount(track.startMonth, track.endMonth) !== duration) {
      throw new Error(`Every track must span exactly ${duration} month${duration === 1 ? "" : "s"}`);
    }
    const key = `${track.startMonth}-${track.endMonth}`;
    if (seen.has(key)) throw new Error("Duplicate tracks are not allowed");
    seen.add(key);
    return {
      name: track.name || `${monthNames[track.startMonth - 1]}-${monthNames[track.endMonth - 1]}`,
      startMonth: track.startMonth,
      endMonth: track.endMonth,
      stage: normalizeStage(track.stage || "preparation", category),
    };
  });
}

export function getTrackSchedule(startMonth: number, duration: number, now = new Date()) {
  const currentMonth = now.getUTCMonth() + 1;
  const startYear = startMonth < currentMonth ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const endDate = new Date(Date.UTC(startYear, startMonth - 1 + duration, 1));
  endDate.setUTCDate(0);
  endDate.setUTCHours(23, 59, 59, 999);
  return { isClosedForCurrentYear: startMonth < currentMonth, startDate, endDate };
}
