import type { PaystackEventData } from "../interface/allInterfaces.js";

// Only use data from Paystack verification or a signature-validated webhook.
export const matchesPaystackPaymentAmount = (
  data: Pick<PaystackEventData, "amount" | "currency" | "requested_amount" | "fees">,
  expectedAmountKobo: number,
): boolean => {
  if (
    !Number.isSafeInteger(expectedAmountKobo) || expectedAmountKobo <= 0 ||
    !Number.isSafeInteger(data.amount) || data.amount <= 0 ||
    typeof data.currency !== "string" || data.currency.toUpperCase() !== "NGN"
  ) return false;

  if (data.requested_amount != null && data.requested_amount !== expectedAmountKobo) {
    return false;
  }

  // When the merchant bears fees, the gross charge already matches the order.
  if (data.amount === expectedAmountKobo) return true;

  // When the customer bears fees, require the entire excess to be accounted for.
  return typeof data.fees === "number" && Number.isSafeInteger(data.fees) &&
    data.fees > 0 && data.amount - data.fees === expectedAmountKobo;
};
