import "./_group.css";

const actions = [
  { label: "Ban account", className: "current-danger" },
  { label: "Promote to admin", className: "current-primary" },
  { label: "Unlock everything", className: "" },
  { label: "Give points/shards", className: "" },
  { label: "Ban / admin history", className: "" },
  { label: "View shared tabs", className: "" },
];

export function Current() {
  return (
    <main className="manage-preview current-preview">
      <article className="current-dialog">
        <header className="current-titlebar">
          <h2>Study Desk admin panel</h2>
          <button className="current-close" aria-label="Close admin panel">×</button>
        </header>
        <p className="current-privacy">
          Admin actions are recorded. Tab details appear only when an account has opted in; only page titles and site names are shared.
        </p>

        <section className="current-manage">
          <h3>Manage an account</h3>
          <form className="current-search">
            <label htmlFor="current-user">Find an account by exact username</label>
            <div className="current-search-row">
              <input id="current-user" defaultValue="maria_lee" readOnly />
              <button className="current-button" type="button">Search</button>
            </div>
            <label htmlFor="current-reason">Ban reason (optional)</label>
            <input id="current-reason" placeholder="Briefly explain the reason" readOnly />
          </form>

          <div className="current-list">
            <div className="current-result">
              <div className="current-user-copy">
                <strong>maria_lee</strong>
                <span>Account is active</span>
              </div>
              <div className="current-actions">
                {actions.map((action) => (
                  <button className={`current-button ${action.className}`} key={action.label} type="button">
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className="current-subsection">
            <h4>Account history</h4>
            <p>Recent account actions for maria_lee (up to 100).</p>
            <div className="current-result history-row">
              <div className="current-user-copy">
                <strong>Reward granted</strong>
                <span>By dum · 250 points · Study milestone</span>
              </div>
            </div>
          </section>

          <section className="current-subsection">
            <h4>Shared tabs</h4>
            <p>Opted in: showing titles and site names only. Page contents, files, and full URLs are not available.</p>
            <div className="current-list">
              <div className="current-result">
                <div className="current-user-copy">
                  <strong>Cell structure review</strong>
                  <span>classroom.google.com</span>
                </div>
              </div>
              <div className="current-result">
                <div className="current-user-copy">
                  <strong>World history notes</strong>
                  <span>docs.google.com</span>
                </div>
              </div>
            </div>
          </section>
        </section>
      </article>
    </main>
  );
}
