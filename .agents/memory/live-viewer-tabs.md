---
name: Live viewer tabs
description: Browser behavior that matters when preserving iframe-backed tabs.
---

Keep retained iframe documents connected and give inactive frames a nonzero, stable viewport rather than using display:none.

**Why:** A real Chromium browser check showed that display:none preserved iframe node identity, JavaScript state, and unsaved input values, but reset scroll positions to zero. Checking only for network reloads or retained form values misses this failure.

**How to apply:** When changing tab visibility or layout, verify iframe scroll as well as inputs, document identity, and network requests. Avoid moving iframe nodes between containers, which can recreate their browsing contexts.
