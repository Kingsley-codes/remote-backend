import { google } from "googleapis";
import { logError } from "../utils/logger.js";

import { buildEmailMessage, type EmailInput, type EmailAttachment } from "../utils/emailMessage.js";
type OtpEmailPurpose = "signup" | "password-reset" | "bank-account";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;",
  })[character] ?? character);

const formatNaira = (amount: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);

function gmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error("Gmail API credentials are not configured");
  }
  const client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: client });
}

export async function sendEmail(input: EmailInput) {
  const senderEmail = process.env.GMAIL_SENDER_EMAIL;
  if (!senderEmail) throw new Error("GMAIL_SENDER_EMAIL is not configured");
  const senderName = process.env.GMAIL_SENDER_NAME || "Remote Agric";
  const message = buildEmailMessage(input, senderEmail, senderName);
  await gmailClient().users.messages.send({
    userId: "me",
    requestBody: { raw: Buffer.from(message).toString("base64url") },
  }, { timeout: 60_000, retry: false });
}

export async function deliverEmail(input: EmailInput) {
  try {
    await sendEmail(input);
  } catch (error) {
    logError("email.delivery_failed", error, { subject: input.subject });
  }
}

const emailShell = (heading: string, body: string) =>
  `<main style="font-family:Arial,sans-serif;color:#1f2937;max-width:560px;margin:auto;padding:24px"><h1 style="color:#2d6a27">${heading}</h1>${body}<p style="color:#6b7280;font-size:13px">Remote Agric</p></main>`;

export async function sendOtpEmail(to: string, code: string, purpose: OtpEmailPurpose) {
  const details: Record<OtpEmailPurpose, { heading: string; action: string }> = {
    signup: { heading: "Verify your email", action: "finish creating your account" },
    "password-reset": { heading: "Reset your password", action: "reset your password" },
    "bank-account": { heading: "Confirm your withdrawal account", action: "link your withdrawal account" },
  };
  const detail = details[purpose];
  await sendEmail({
    to,
    subject: `${code} is your Remote Agric verification code`,
    text: `Your verification code is ${code}. Use it to ${detail.action}. It expires in 10 minutes.`,
    html: emailShell(detail.heading, `<p>Use this code to ${detail.action}:</p><p style="font-size:30px;font-weight:700;letter-spacing:7px">${code}</p><p>It expires in 10 minutes. Do not share it with anyone.</p>`),
  });
}

export const sendInvestmentPaymentEmail = (to: string, name: string, produceTitle: string, amount: number) =>
  deliverEmail({ to, subject: "Your farm investment is confirmed", text: `Hi ${name}, your ${formatNaira(amount)} investment in ${produceTitle} was successful.`, html: emailShell("Investment confirmed", `<p>Hi ${escapeHtml(name)},</p><p>Your investment of <strong>${formatNaira(amount)}</strong> in <strong>${escapeHtml(produceTitle)}</strong> is confirmed.</p>`) });

export const sendProduceStageEmail = (to: string, name: string, produceTitle: string, stage: string) =>
  deliverEmail({ to, subject: `${produceTitle} has moved to ${stage}`, text: `Hi ${name}, ${produceTitle} has moved to the ${stage} stage.`, html: emailShell("Farm stage updated", `<p>Hi ${escapeHtml(name)},</p><p><strong>${escapeHtml(produceTitle)}</strong> has moved to the <strong>${escapeHtml(stage)}</strong> stage.</p>`) });

export const sendAccountStatusEmail = (to: string, name: string, status: "active" | "suspended") =>
  deliverEmail({ to, subject: `Your Remote Agric account is ${status}`, text: `Hi ${name}, your account has been ${status}.`, html: emailShell(`Account ${status}`, `<p>Hi ${escapeHtml(name)},</p><p>Your Remote Agric account has been <strong>${status}</strong>.</p>`) });

export const sendWithdrawalCompletedEmail = (to: string, name: string, amount: number) =>
  deliverEmail({ to, subject: "Your withdrawal is complete", text: `Hi ${name}, your withdrawal of ${formatNaira(amount)} has been completed.`, html: emailShell("Withdrawal complete", `<p>Hi ${escapeHtml(name)},</p><p>Your withdrawal of <strong>${formatNaira(amount)}</strong> has been completed.</p>`) });

export const sendAdminWithdrawalEmail = (to: string, name: string, details: {
  amount: number; reference: string; reason: string; adminName: string;
  balanceBefore: number; balanceAfter: number; date: Date;
}) => {
  const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(value);
  const lines = [
    "Hi " + name + ",",
    "An admin (" + details.adminName + ") triggered a withdrawal from your Remote Agric wallet.",
    "Amount deducted: " + money(details.amount),
    "Reference: " + details.reference,
    "Date: " + details.date.toISOString(),
    "Reason: " + details.reason,
    "Previous balance: " + money(details.balanceBefore),
    "Remaining balance: " + money(details.balanceAfter),
    "Status: completed wallet deduction. No bank transfer was initiated by this action.",
  ];
  return sendEmail({ to, subject: "Admin-initiated wallet withdrawal", text: lines.join("\n"),
    html: emailShell("Admin-initiated wallet withdrawal", lines.map(line => "<p>" + escapeHtml(line) + "</p>").join("")),
  });
};

export async function sendManualWithdrawalEmail(to: string, name: string, details: { transactionID: string; amount: number; event: "requested" | "approved"; receipt?: EmailAttachment }) {
  const title = details.event === "requested" ? "Withdrawal request received" : "Your withdrawal is complete";
  const message = details.event === "requested"
    ? `Your withdrawal request for ${formatNaira(details.amount)} is being processed and will be completed within 24 hours.`
    : `Your withdrawal of ${formatNaira(details.amount)} has been completed. Your payment receipt is attached.`;
  await sendEmail({ to, subject: title, text: `Hi ${name}, ${message} Transaction ID: ${details.transactionID}`,
    html: emailShell(title, `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(message)}</p><p>Transaction ID: <strong>${escapeHtml(details.transactionID)}</strong></p>`),
    ...(details.receipt ? { attachments: [details.receipt] } : {}),
  });
}
