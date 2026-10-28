import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;

export const authRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const key = String(req.ip || "unknown");
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (buckets.size > 5000) {
    for (const [address, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(address);
    }
  }
  if (bucket.count > MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many account attempts. Try again in a few minutes." });
    return;
  }
  next();
};
