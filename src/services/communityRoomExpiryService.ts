import Investment from "../models/investmentModel.js";

export const COMMUNITY_ROOM_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

const addGracePeriod = (date: Date) => new Date(date.getTime() + COMMUNITY_ROOM_GRACE_PERIOD_MS);

export function communityRoomAccessEndsAt(endsAt: Date, trackStage: string, now = new Date()) {
  const tenureExpiry = addGracePeriod(endsAt);
  // A new investment should never outlive an already-harvesting track's
  // community grace period.
  return trackStage === "harvesting" ? new Date(Math.min(tenureExpiry.getTime(), addGracePeriod(now).getTime())) : tenureExpiry;
}

export async function scheduleTrackCommunityRoomExpiry(produceId: string, trackId: string, now = new Date()) {
  const harvestExpiry = addGracePeriod(now);
  // Do not postpone a tenure-based expiry that is already earlier. A stage
  // can be corrected later, but reaching harvesting is still a valid expiry
  // trigger for that investment.
  await Investment.updateMany(
    {
      produce: produceId,
      "track.id": trackId,
      orderStatus: "confirmed",
      status: "ongoing",
      communityRoomRemovedAt: { $exists: false },
      $or: [
        { communityRoomAccessEndsAt: { $exists: false } },
        { communityRoomAccessEndsAt: null },
        { communityRoomAccessEndsAt: { $gt: harvestExpiry } },
      ],
    },
    { $set: { communityRoomHarvestStartedAt: now, communityRoomAccessEndsAt: harvestExpiry } },
  );
}

/**
 * Daily job: migrate older investments to a per-track expiry, then mark each
 * expired investment as removed from its produce room. The caller refreshes
 * only the affected live Socket.IO rooms.
 */
export async function removeExpiredCommunityRoomAccess(now = new Date()) {
  const legacyInvestments = await Investment.find({
    orderStatus: "confirmed",
    status: "ongoing",
    communityRoomRemovedAt: { $exists: false },
    $or: [
      { communityRoomAccessEndsAt: { $exists: false } },
      { communityRoomAccessEndsAt: null },
    ],
  }).select("_id endsAt stage").lean();

  if (legacyInvestments.length) {
    await Investment.bulkWrite(legacyInvestments.map((investment) => ({
      updateOne: {
        filter: {
          _id: investment._id,
          $or: [
            { communityRoomAccessEndsAt: { $exists: false } },
            { communityRoomAccessEndsAt: null },
          ],
        },
        update: {
          $set: {
            communityRoomAccessEndsAt: communityRoomAccessEndsAt(investment.endsAt, investment.stage, now),
            ...(investment.stage === "harvesting" ? { communityRoomHarvestStartedAt: now } : {}),
          },
        },
      },
    })));
  }

  const expiring = await Investment.find({
    orderStatus: "confirmed",
    status: "ongoing",
    communityRoomRemovedAt: { $exists: false },
    communityRoomAccessEndsAt: { $lte: now },
  }).select("_id produce").lean();
  if (!expiring.length) return [];

  const ids = expiring.map((investment) => investment._id);
  await Investment.updateMany(
    { _id: { $in: ids }, communityRoomRemovedAt: { $exists: false } },
    { $set: { communityRoomRemovedAt: now } },
  );
  return [...new Set(expiring.map((investment) => String(investment.produce)))];
}
