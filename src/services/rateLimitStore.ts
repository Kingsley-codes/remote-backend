import type { Options, Store } from "express-rate-limit";
import RateLimitEntry from "../models/rateLimitModel.js";

export class MongoRateLimitStore implements Store {
  localKeys = false;
  prefix: string;
  windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private key(key: string) {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string) {
    const now = new Date();
    const nextReset = new Date(now.getTime() + this.windowMs);
    const update = [
      {
        $set: {
          count: {
            $cond: [
              { $gt: ["$resetAt", now] },
              { $add: [{ $ifNull: ["$count", 0] }, 1] },
              1,
            ],
          },
          resetAt: {
            $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", nextReset],
          },
        },
      },
    ];

    let entry;
    try {
      entry = await RateLimitEntry.findOneAndUpdate(
        { _id: this.key(key) },
        update,
        { upsert: true, new: true },
      ).lean();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      entry = await RateLimitEntry.findOneAndUpdate(
        { _id: this.key(key) },
        update,
        { new: true },
      ).lean();
    }

    if (!entry) throw new Error("Rate limit counter could not be updated");

    return { totalHits: entry.count, resetTime: entry.resetAt };
  }

  async decrement(key: string) {
    await RateLimitEntry.updateOne(
      { _id: this.key(key), count: { $gt: 0 } },
      { $inc: { count: -1 } },
    );
  }

  async resetKey(key: string) {
    await RateLimitEntry.deleteOne({ _id: this.key(key) });
  }
}
