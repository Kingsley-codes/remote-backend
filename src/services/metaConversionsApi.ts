import crypto from "node:crypto";

const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v26.0";

const META_PIXEL_ID = process.env.META_PIXEL_ID;
const META_ACCESS_TOKEN = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;

type MetaUserData = {
  em?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
};

type MetaCustomData = {
  value?: number;
  currency?: string;
  content_name?: string;
  content_type?: string;
  content_ids?: string[];
  num_items?: number;
};

type SendMetaPurchaseParams = {
  eventId: string;
  eventTime?: Date;
  eventSourceUrl?: string;
  userData: MetaUserData;
  customData: MetaCustomData;
  testEventCode?: string;
};

const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const hashEmail = (email: string) => sha256(normalizeEmail(email));

export const hashExternalId = (id: string) => sha256(id.trim());

export const sendMetaPurchase = async ({
  eventId,
  eventTime = new Date(),
  eventSourceUrl,
  userData,
  customData,
  testEventCode,
}: SendMetaPurchaseParams) => {
  if (!META_PIXEL_ID) {
    throw new Error("META_PIXEL_ID is not configured");
  }

  if (!META_ACCESS_TOKEN) {
    throw new Error("META_CONVERSIONS_API_ACCESS_TOKEN is not configured");
  }

  const event: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: Math.floor(eventTime.getTime() / 1000),
    event_id: eventId,
    action_source: "website",
    user_data: userData,
    custom_data: customData,
  };

  if (eventSourceUrl) {
    event.event_source_url = eventSourceUrl;
  }

  const body: Record<string, unknown> = {
    data: [event],
  };

  if (testEventCode) {
    body.test_event_code = testEventCode;
  }

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(
      META_ACCESS_TOKEN,
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(
      `Meta Conversions API failed: ${JSON.stringify(responseBody)}`,
    );
  }

  return responseBody;
};
