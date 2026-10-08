import { withdrawalPeriod } from "./withdrawalPeriod.js";

export class TicketFilterError extends Error {}

export function ticketFilters(query: Record<string, unknown>, admin: boolean, now = new Date()) {
  const period = query.period ?? "this-month";
  const status = query.status ?? (admin ? "open" : "all");
  if (typeof period !== "string" || !["today", "this-week", "this-month", "custom"].includes(period)) {
    throw new TicketFilterError("Invalid ticket period");
  }
  if (typeof status !== "string" || !["all", "open", "resolved", "closed"].includes(status)) {
    throw new TicketFilterError("Invalid ticket status");
  }
  let dates;
  try {
    // Reuse the application's Africa/Lagos calendar boundaries and date validation.
    dates = withdrawalPeriod(period,
      typeof query.startDate === "string" ? query.startDate : undefined,
      typeof query.endDate === "string" ? query.endDate : undefined, now);
  } catch (error) {
    throw new TicketFilterError(error instanceof Error ? error.message : "Invalid ticket dates");
  }
  return {
    table: { ...dates, ...(status === "all" ? {} : { status }) },
    stats: withdrawalPeriod("this-month", undefined, undefined, now),
  };
}
