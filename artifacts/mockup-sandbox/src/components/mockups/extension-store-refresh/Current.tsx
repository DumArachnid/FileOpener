import "./_group.css";

export function Current() {
  return (
    <main className="store-current">
      <div className="current-shell">
        <header className="current-topbar">
          <div className="current-brand">
            <span className="current-mark" aria-hidden="true" />
            <span>Study Desk · Extension Store</span>
          </div>
          <span style={{ color: "#777", fontSize: 13 }}>Not signed in</span>
          <button className="current-button" type="button">Sign in</button>
          <button className="current-button" type="button">← Back to Study Desk</button>
        </header>

        <section className="current-hero">
          <span className="current-eyebrow">EXTENSION STORE</span>
          <h1>Extensions for your study desk</h1>
          <p className="current-hero-copy">
            Browse approved community extensions and working Study Desk tools.
            Review the source and permissions before installing. Installed
            extensions stay off until you enable them in your workspace.
          </p>
          <div className="current-note">
            Extensions run in an isolated sandbox. They cannot read page
            contents, files, tabs, or access the network. Only install code you
            trust.
          </div>
        </section>

        <section className="current-section">
          <div className="current-section-head">
            <div>
              <h2>Online community store</h2>
              <p>
                Browse published extensions or create a private draft.
                Submissions become public only after moderator approval.
              </p>
            </div>
            <button className="current-button" type="button">＋ Create extension</button>
          </div>
          <p style={{ color: "#777", fontSize: 13 }}>No public community extensions yet.</p>
        </section>

        <section className="current-section">
          <div className="current-section-head">
            <div>
              <h2>Ready-to-install tools</h2>
              <p>
                These are working tools, not concept previews. Installing saves
                the source but leaves each tool disabled until you enable it.
              </p>
            </div>
          </div>
          <div className="current-grid">
            <article className="current-card">
              <strong>Study Sprint</strong>
              <p>
                A focused work-and-break timer with pause, resume, and reset
                actions for study sessions.
              </p>
              <button className="current-button" type="button">Review details</button>
            </article>
            <article className="current-card">
              <strong>Reading Highlights</strong>
              <p>
                Save, review, and undo manually entered reading highlights.
                Up to 40 are saved in this browser.
              </p>
              <button className="current-button" type="button">Review details</button>
            </article>
          </div>
        </section>

        <section className="current-section">
          <div className="current-section-head">
            <div>
              <h2>Coming later</h2>
              <p>More extensions will be added as the store develops.</p>
            </div>
          </div>
          <article className="current-card">
            <strong>Citation Helper <small>UNAVAILABLE</small></strong>
            <p>
              Format citation drafts while studying. This item is not
              installable yet.
            </p>
            <button className="current-button" disabled type="button">Coming soon</button>
          </article>
        </section>
      </div>
    </main>
  );
}
