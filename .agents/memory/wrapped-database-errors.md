---
name: Wrapped database errors
description: Handling PostgreSQL constraint errors wrapped by Drizzle query errors.
---

When route behavior depends on a PostgreSQL SQLSTATE, check both the outer error and its nested `cause` chain. Drizzle can wrap a driver error in a query error that does not expose the original `code` at the top level.

**Why:** A duplicate account insert surfaced SQLSTATE `23505` only on the nested PostgreSQL error, causing signup to return `500` instead of the documented conflict response.

**How to apply:** Use cycle-safe cause traversal when identifying known database error codes; keep unexpected database errors on the existing generic error path.
