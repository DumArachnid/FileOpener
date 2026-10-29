import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };

export function createReadRateLimit(options: {
  limit: number;
  windowMs: number;
  message: string;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(req.ip || "unknown");
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(options.limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.limit - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (buckets.size > 5000) {
      for (const [address, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(address);
      }
    }

    if (bucket.count > options.limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: options.message });
      return;
    }

    next();
  };
}
