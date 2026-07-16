import webpush from "web-push";
import PushSubscription from "../models/pushSubscriptionModel.js";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (publicKey && privateKey) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@remoteagric.com", publicKey, privateKey);
}

export async function sendPush(
  target: { ownerType: "user" | "admin"; owner?: string },
  payload: { title: string; body: string; url: string; tag: string },
) {
  if (!publicKey || !privateKey) return;
  const query = target.owner ? { ownerType: target.ownerType, owner: target.owner } : { ownerType: target.ownerType };
  const subscriptions = await PushSubscription.find(query);
  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys!.p256dh!,
            auth: subscription.keys!.auth!,
          },
        },
        JSON.stringify(payload),
      );
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await subscription.deleteOne();
      else throw error;
    }
  }));
}
