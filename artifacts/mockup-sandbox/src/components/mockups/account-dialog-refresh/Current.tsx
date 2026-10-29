import "./_group.css";

export function Current() {
  return (
    <main className="account-stage current-stage">
      <div className="workspace-sample" aria-hidden="true">
        <div className="workspace-side">
          <b>Study Desk</b>
          <span>Notes</span>
          <span>Focus timer</span>
          <span>Bookmarks</span>
          <span>Recent</span>
        </div>
        <div className="workspace-main">
          <div className="workspace-toolbar">New tab　　Open file　　Load web page</div>
          <h2>Your study desk is ready.</h2>
          <p>Bring course materials, notes, and reference pages together while you work.</p>
        </div>
      </div>
      <div className="current-scrim" />
      <section className="current-dialog" role="dialog" aria-modal="true" aria-labelledby="current-title">
        <div className="current-panel">
          <div className="current-title-row">
            <h2 id="current-title">Study Desk account</h2>
            <button className="current-close" type="button" aria-label="Close account dialog">×</button>
          </div>
          <p>Sign in to sync preferences, notes, and bookmarks across your devices.</p>
          <p className="current-small">Sign in to create extensions and sync your workspace.</p>
          <form className="current-form">
            <label htmlFor="current-username">Username</label>
            <input id="current-username" autoComplete="username" />
            <label htmlFor="current-password">Password</label>
            <input id="current-password" type="password" autoComplete="current-password" />
            <div className="current-actions">
              <button className="current-submit" type="button">Sign in</button>
            </div>
            <div className="current-links">
              <button type="button">Create an account</button>
              <button type="button">Use a recovery code</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
