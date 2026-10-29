---
name: Workflow stale child processes
description: Handling a managed workflow that reports a port conflict while its previous server still responds.
---

If a managed web or API workflow reports `EADDRINUSE` while its prior URL still responds, the workflow status may be stale while a child server process still holds the port. Stop the exact affected managed workflow before restarting; do not blindly retry or terminate unrelated processes.

**Why:** A previous server process remained alive while the next workflow start failed on the same port.

**How to apply:** Check workflow logs and health first, stop only the affected managed workflow, restart it once, and verify the new logs.
