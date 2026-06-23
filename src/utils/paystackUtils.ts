import axios from "axios";
import {
  PaystackInitializeResponse,
  PaystackInitializeTransactionPayload,
} from "../interface/allInterfaces.js";

if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error("PAYSTACK_SECRET_KEY is not set");
}

const paystack = axios.create({
  ...(process.env.PAYSTACK_BASE_URL && {
    baseURL: process.env.PAYSTACK_BASE_URL,
  }),
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

export const initializePaystackTransaction = async (
  transactionData: PaystackInitializeTransactionPayload,
) => {
  try {
    const response = await paystack.post<{
      status: boolean;
      message: string;
      data: PaystackInitializeResponse;
    }>("/transaction/initialize", transactionData);

    // Return consistent format
    return {
      status: response.data.status,
      message: response.data.message,
      data: response.data.data,
    };
  } catch (error: any) {
    console.error(
      "Paystack initialize transaction error:",
      error.response?.data || error.message,
    );

    // Return consistent error format
    return {
      status: false,
      message: error.response?.data?.message || error.message,
      error: error.response?.data,
    };
  }
};

export const verifyTransaction = async (reference: string) => {
  const response = await paystack.get(`/transaction/verify/${reference}`);
  return response.data;
};

export const createRecipient = async (data: {
  name: string;
  account_number: string;
  bank_code: string;
}) => {
  const res = await paystack.post("/transferrecipient", {
    type: "nuban",
    name: data.name,
    account_number: data.account_number,
    bank_code: data.bank_code,
    currency: "NGN",
  });

  return res.data.data;
};

// export const initiateTransfer = async (data: {
//   amount: number;
//   recipient: string;
//   reference: string;
// }) => {
//   const res = await paystack.post("/transfer", {
//     source: "balance",
//     amount: data.amount * 100,
//     recipient: data.recipient,
//     reference: data.reference,
//     reason: "Withdrawal",
//   });

//   return res.data.data;
// };

export const realInitiateTransfer = async (data: {
  amount: number;
  recipient: string;
  reference: string;
}) => {
  const res = await paystack.post("/transfer", {
    source: "balance",
    amount: data.amount * 100,
    recipient: data.recipient,
    reference: data.reference,
    reason: "Withdrawal",
  });

  return res.data.data;
};

// utils/transfer.ts
const mockInitiateTransfer = async (data: {
  amount: number;
  recipient: string;
  reference: string;
}) => {
  console.log("[MOCK] Transfer initiated:", {
    amount: data.amount,
    recipient: data.recipient,
    reference: data.reference,
  });

  // Simulate network delay
  await new Promise((res) => setTimeout(res, 500));

  // Simulate occasional failure to test your rollback logic
  if (Math.random() < 0.3) throw new Error("Mock transfer failure");

  return { reference: data.reference };
};

export const initiateTransfer =
  process.env.NODE_ENV === "development" || process.env.MOCK_PAYSTACK === "true"
    ? mockInitiateTransfer
    : realInitiateTransfer;
