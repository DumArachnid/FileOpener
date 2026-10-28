---
name: Admin access and tab privacy
description: Study Desk role boundaries and the consent limits for moderator tab visibility.
---

Developer controls that assign or remove Study Desk admin roles require a verified Replit email on the configured developer email list. Admins may promote active regular accounts through the admin panel, but cannot self-promote or remove another admin. Never infer developer authority from a Study Desk username or from Replit sign-in alone.

**Why:** Replit Auth verifies a Replit identity but does not prove that the identity owns or collaborates on this project. Developer role controls remain restricted even though the user explicitly requested moderator promotions in the admin panel.

**How to apply:** Keep developer identities in the `STUDY_DESK_DEVELOPER_REPLIT_EMAILS` secret. Require an explicit account selection for developer role changes; never auto-promote based on a username.

Moderators may manage regular accounts and community extensions, but cannot ban themselves or another moderator and cannot review their own extension submissions. Removing a public extension should preserve the creator's saved code and include a reason.

**Why:** Administrative actions need separation of duties, and takedowns should not erase user work.

**How to apply:** Keep these restrictions on every new moderation endpoint; use a reversible unpublish/takedown rather than deleting the extension.

Admins may view a user's tab summaries only after that user opts in. Show only web-page titles and hostnames; never share page contents, local files, URL paths, queries, or fragments. Turning sharing off must remove the saved tab snapshot.

**Why:** The user explicitly chose user-approved tab sharing, and browsing activity is sensitive.

**How to apply:** Default to off, keep the opt-in visible in account settings, and enforce the same privacy filter in the server response rather than relying only on the interface.

Developer-rank accounts may check an aggregate count of recently active signed-in accounts; do not expose their identities or browsing details through presence features.

**Why:** The user asked for a count of how many users are online, not a list of who they are.

**How to apply:** Record authenticated heartbeats with a short expiry window, and keep developer presence responses aggregate-only.

Keep the native admin dialog outside the Extension Store overlay.

**Why:** The store overlay is hidden when closed; nesting a native dialog inside it prevents reliable modal rendering and can disrupt the client.

**How to apply:** Place workspace dialogs as siblings of hidden overlays, not as their descendants.
