---
name: UTC cohort test clocks
description: Testing time-bucketed metrics when the application and database clocks may differ.
---

For date-bucketed metrics tests, derive the bucket date from the API's returned database-generated date range instead of comparing against the test process's current date.

**Why:** The database and application host can disagree about the current date, even while timestamp-based event inserts correctly land in the database's current bucket.

**How to apply:** When asserting a daily cohort delta, select a returned bucket as the test's reference date and verify the corresponding count changes there.
