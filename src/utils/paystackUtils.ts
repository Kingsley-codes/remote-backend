import axios from "axios";
import { logError, logInfo } from "./logger.js";
import {
  PaystackInitializeResponse,
  PaystackInitializeTransactionPayload,
} from "../interface/allInterfaces.js";

if (!process.env.PAYSTACK_SECRET_KEY) {
  throw new Error("PAYSTACK_SECRET_KEY is not set");
}

const paystack = axios.create({
  baseURL: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
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
    logError("paystack.initialize_failed", error, {
      status: error.response?.status,
    });

    // Return consistent error format
    return {
      status: false,
      message: "Payment provider request failed",
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

// Only log diagnostic fields; recipient details and request credentials stay private.
const transferResponseMetadata = (body: any) => ({
  providerStatus: typeof body?.status === "boolean" ? body.status : undefined,
  providerMessage: typeof body?.message === "string" ? body.message : undefined,
  transferStatus: typeof body?.data?.status === "string" ? body.data.status : undefined,
  transferCode: typeof body?.data?.transfer_code === "string" ? body.data.transfer_code : undefined,
  providerReference: typeof body?.data?.reference === "string" ? body.data.reference : undefined,
  failureReason: typeof body?.data?.failure_reason === "string" ? body.data.failure_reason : undefined,
});

export const initiateTransfer = async (data: {
  amount: number;
  recipient: string;
  reference: string;
}) => {
  try {
    const res = await paystack.post("/transfer", {
      source: "balance",
      amount: data.amount * 100,
      recipient: data.recipient,
      reference: data.reference,
      reason: "Withdrawal",
    });
    logInfo("paystack.transfer_response", {
      reference: data.reference,
      httpStatus: res.status,
      ...transferResponseMetadata(res.data),
    });
    return res.data.data;
  } catch (error) {
    const response = axios.isAxiosError(error) ? error.response : undefined;
    logError("paystack.transfer_failed", error, {
      reference: data.reference,
      httpStatus: response?.status,
      ...transferResponseMetadata(response?.data),
    });
    throw error;
  }
};

export const verifyTransfer = async (reference: string) => {
  try {
    const res = await paystack.get(`/transfer/verify/${reference}`);
    logInfo("paystack.transfer_verification_response", {
      reference,
      httpStatus: res.status,
      ...transferResponseMetadata(res.data),
    });
    return res.data;
  } catch (error) {
    const response = axios.isAxiosError(error) ? error.response : undefined;
    logError("paystack.transfer_verification_failed", error, {
      reference,
      httpStatus: response?.status,
      ...transferResponseMetadata(response?.data),
    });
    throw error;
  }
};
