---
name: Developer admin access
description: Security rationale for the developer-only Study Desk role assignment controls.
---

Only accounts whose verified Replit email is on the configured developer email list may assign Study Desk moderator roles. Do not infer developer authority from a Study Desk username or from Replit sign-in alone.

**Why:** Replit Auth verifies a Replit identity but does not prove that the identity owns or collaborates on this project. The moderator assignment screen changes account privileges.

**How to apply:** Keep developer identities in the `STUDY_DESK_DEVELOPER_REPLIT_EMAILS` secret. The developer must explicitly select each Study Desk account to promote; never auto-promote based on a username.
