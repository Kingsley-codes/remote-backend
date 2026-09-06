export function buildWalletFilter(query: Record<string, unknown>, now = new Date()) {
  const filter: Record<string, unknown> = {};
  const { period, type, status, startDate, endDate } = query;
  if (type) {
    if (typeof type !== "string" || !["investment-payment", "withdrawal", "referral-reward", "harvest-return"].includes(type)) throw new Error("Invalid transaction type");
    filter.transactionType = type;
  }
  if (status) {
    if (typeof status !== "string" || !["pending", "completed", "refunded", "cancelled", "failed"].includes(status)) throw new Error("Invalid transaction status");
    filter.status = status;
  }
  if (!period || period === "all") return filter;
  const start = new Date(now);
  if (period === "today") start.setUTCHours(0, 0, 0, 0);
  else if (period === "week") start.setUTCDate(start.getUTCDate() - 7);
  else if (period === "month") start.setUTCDate(start.getUTCDate() - 30);
  else if (period === "year") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else if (period === "custom") {
    const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!validDate(startDate) || !validDate(endDate) || String(startDate) > String(endDate)) throw new Error("Provide a valid start and end date");
    const end = new Date(String(endDate));
    end.setUTCDate(end.getUTCDate() + 1);
    filter.createdAt = { $gte: new Date(String(startDate)), $lt: end };
    return filter;
  } else throw new Error("Invalid period");
  filter.createdAt = { $gte: start, $lte: now };
  return filter;
}
