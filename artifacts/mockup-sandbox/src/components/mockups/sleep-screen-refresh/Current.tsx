import "./_group.css";

export function Current() {
  return (
    <main className="sleep-mock-root">
      <dialog className="screen-sleep-overlay" open aria-label="Study Desk screen asleep">
        <p className="sr-only">The screen is asleep. Use a key or click to wake it.</p>
        <section className="screen-sleep-panel">
          <h2>Study Desk is asleep</h2>
          <p>Enter your screen-sleep password to return to your workspace.</p>
          <form>
            <label htmlFor="sleep-password">Password</label>
            <input id="sleep-password" type="password" autoComplete="off" />
            <button type="button">Unlock workspace</button>
          </form>
          <p className="screen-sleep-error" aria-live="polite">&nbsp;</p>
        </section>
      </dialog>
    </main>
  );
}
