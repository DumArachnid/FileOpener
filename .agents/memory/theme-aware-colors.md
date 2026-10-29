---
name: Theme-aware interface colors
description: UI colors should follow the workspace's user-controlled theme rather than fixed decorative accents.
---

Use the workspace's customizable background, panel, text, and accent tokens for new interface surfaces and controls. Derive borders, soft fills, focus rings, notices, toasts, and non-danger status accents from those tokens. Keep danger semantics tied to the shared danger token.

**Why:** The user explicitly asked that fixed theme colors stop clashing with custom accents and backgrounds.

**How to apply:** Before adding UI styling, locate the workspace theme variables and use them throughout the component, including hover, status, and notification states.
