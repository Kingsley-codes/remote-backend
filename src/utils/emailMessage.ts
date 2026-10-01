import { randomUUID } from "node:crypto";

export type EmailAttachment = { fileName: string; mimeType: string; content: Buffer };
export type EmailInput = { to: string; subject: string; html: string; text: string; attachments?: EmailAttachment[] };
const header = (value: string) => value.replace(/[\r\n]/g, " ");
const base64 = (value: Buffer | string) => Buffer.from(value).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";

export function buildEmailMessage(input: EmailInput, senderEmail: string, senderName: string) {
  const alternative = `alternative-${randomUUID()}`;
  const mixed = `mixed-${randomUUID()}`;
  const body = [
    `Content-Type: multipart/alternative; boundary="${alternative}"`, "",
    `--${alternative}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64(input.text),
    `--${alternative}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64(input.html),
    `--${alternative}--`,
  ];
  const headers = [`From: ${header(senderName)} <${header(senderEmail)}>`, `To: ${header(input.to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(header(input.subject)).toString("base64")}?=`, "MIME-Version: 1.0"];
  if (!input.attachments?.length) return [...headers, ...body].join("\r\n");
  const attachments = input.attachments.flatMap((attachment) => {
    const name = attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return [`--${mixed}`, `Content-Type: ${header(attachment.mimeType)}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`, "Content-Transfer-Encoding: base64", "", base64(attachment.content)];
  });
  return [...headers, `Content-Type: multipart/mixed; boundary="${mixed}"`, "", `--${mixed}`, ...body,
    ...attachments, `--${mixed}--`, ""].join("\r\n");
}
