---
name: Random-link daily limits
description: Quota identity rules for Study Desk's curated random bookmark links.
---

Use a server-persisted 24-hour quota per account for signed-in users and a private browser token for guests. Avoid using an IP address as the daily quota identity.

**Why:** School networks can place many students behind one public IP, so an IP-based daily cap could block unrelated classmates.

**How to apply:** Changes to random-link quotas, visitor cookies, or the request UI should preserve account-based cross-device limits and the anonymous browser fallback.
