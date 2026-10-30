# SEO Strategy

## In scope
- Public Study Desk entry page (`/`), standalone workspace (`/workspace.html`), and community extension store (`/extension-store.html`).
- Source-detectable WCAG 2.2 A/AA barriers in unauthenticated public features.

## Out of scope
- Authenticated account, moderation, developer/admin flows; personal uploaded/viewed content; API JSON endpoints; mockup sandbox and unattached historical HTML snapshots.

## Target audience
- Students, primarily using ChromeOS, seeking an educational workspace and legitimate multitasking tools. The product does not override school, browser, or network restrictions.

## Primary topics
- Study Desk, educational workspace, study tools, ChromeOS multitasking, Study Desk extensions.

## Rendering and crawler assumptions
- Vite/React entry page mounts a client-rendered iframe to a standalone inline HTML workspace. Extension store is a standalone HTML page with JavaScript-loaded community listings.
- Assume public product information should be findable and shareable unless explicit user intent establishes otherwise. Existing robots/noindex directives alone do not establish user intent.
- Private files, account data and API endpoints should remain excluded from indexing.

## Dismissed categories
- None recorded.
