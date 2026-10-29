import "./_group.css";

export function Refined() {
  return (
    <main className="account-stage refined-stage">
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
      <div className="refined-scrim" />
      <section className="refined-dialog" role="dialog" aria-modal="true" aria-labelledby="refined-title">
        <div className="refined-panel">
          <header className="refined-topbar">
            <div className="account-brand">
              <span className="brand-mark" aria-hidden="true" />
              <span>STUDY DESK <span className="brand-divider">/</span> ACCOUNT</span>
            </div>
            <button className="refined-close" type="button" aria-label="Close account dialog">×</button>
          </header>
          <div className="refined-intro">
            <h2 id="refined-title">Welcome back</h2>
            <p>Sign in to keep your notes, bookmarks, and preferences in sync across devices.</p>
          </div>
          <form className="refined-form">
            <div className="refined-field">
              <label htmlFor="refined-username">Username</label>
              <input id="refined-username" autoComplete="username" placeholder="Your username" />
            </div>
            <div className="refined-field">
              <label htmlFor="refined-password">Password</label>
              <input id="refined-password" type="password" autoComplete="current-password" placeholder="Your password" />
            </div>
            <button className="refined-submit" type="button">
              <span>Sign in</span>
              <span className="submit-arrow" aria-hidden="true">→</span>
            </button>
            <div className="refined-footer">
              <span>New to Study Desk?</span>
              <button type="button">Create an account</button>
            </div>
            <button className="recovery-link" type="button">Use a recovery code</button>
          </form>
          <div className="account-note">
            <span aria-hidden="true">↗</span>
            Your account is optional. You can continue using Study Desk without signing in.
          </div>
        </div>
      </section>
    </main>
  );
}
