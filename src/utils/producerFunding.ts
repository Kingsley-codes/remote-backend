export function positiveNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeProducerFundingStatus(value: unknown): string {
  const status = String(value ?? "pending").trim().toLowerCase();
  return ({ "0": "pending", "1": "partially funded", "2": "fully funded" } as Record<string, string>)[status] ?? status;
}

export function producerFundingUpdate(status: unknown, amount: unknown, total: unknown) {
  const fundingStatus = normalizeProducerFundingStatus(status);
  if (!["pending", "partially funded", "fully funded", "rejected"].includes(fundingStatus)) {
    throw new Error("Invalid funding status");
  }
  const fundingTotal = positiveNumber(total);
  if (fundingTotal === null) throw new Error("Total funding amount must be a positive number");
  if (fundingStatus === "partially funded") {
    const amountFunded = positiveNumber(amount);
    if (amountFunded === null || amountFunded >= fundingTotal) {
      throw new Error("Amount funded must be greater than zero and less than the total funding amount");
    }
    return { fundingStatus, amountFunded };
  }
  return { fundingStatus, amountFunded: fundingStatus === "fully funded" ? fundingTotal : 0 };
}
