import { useEffect, useRef, useState, type FormEvent } from "react";
import "./_group.css";

export function Refined() {
  const [promptOpen, setPromptOpen] = useState(false);
  const [prototypeMessage, setPrototypeMessage] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (promptOpen) passwordRef.current?.focus();
  }, [promptOpen]);

  useEffect(() => {
    function wakeFromKeyboard(event: KeyboardEvent) {
      if (promptOpen || event.key === "Tab" || event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") return;
      setPromptOpen(true);
    }
    document.addEventListener("keydown", wakeFromKeyboard);
    return () => document.removeEventListener("keydown", wakeFromKeyboard);
  }, [promptOpen]);

  function revealPrompt() {
    setPrototypeMessage("");
    setPromptOpen(true);
  }

  function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPrototypeMessage("Password checking is not connected in this visual prototype.");
  }

  return (
    <main className="sleep-mock-root refined-sleep">
      <div className="sleep-refined-frame" onClick={() => !promptOpen && revealPrompt()}>
        <div className="sleep-refined-topline" aria-hidden="true">
          <span className="sleep-wordmark"><span className="sleep-wordmark-mark" />Study Desk</span>
          <span className="sleep-status"><span className="sleep-status-dot" />Screen asleep</span>
        </div>

        {!promptOpen ? (
          <section className="sleep-rest-state" aria-labelledby="sleep-rest-title">
            <div className="sleep-orbit" aria-hidden="true">
              <span className="sleep-orbit-core" />
              <span className="sleep-orbit-ring" />
            </div>
            <p className="sleep-eyebrow">A quiet moment</p>
            <h1 id="sleep-rest-title">Your desk is resting.</h1>
            <p className="sleep-wake-hint" role="status" aria-live="polite">
              Press any key or click anywhere to wake the screen.
            </p>
            <button className="sleep-wake-button" type="button" onClick={(event) => { event.stopPropagation(); revealPrompt(); }}>
              Wake screen <span aria-hidden="true">↗</span>
            </button>
          </section>
        ) : (
          <section
            className="sleep-unlock-card"
            aria-labelledby="sleep-unlock-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sleep-card-heading">
              <span className="sleep-lock-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" />
                  <rect x="5" y="10" width="14" height="11" rx="2.5" />
                  <circle cx="12" cy="15.5" r="1" />
                  <path d="M12 16.5v1.2" />
                </svg>
              </span>
              <span className="sleep-card-kicker">Local privacy lock</span>
            </div>
            <h1 id="sleep-unlock-title">Study Desk is asleep.</h1>
            <p className="sleep-unlock-description">
              Your workspace is hidden. Enter your screen-sleep password to return.
            </p>
            <form className="sleep-unlock-form" onSubmit={handleUnlock}>
              <label htmlFor="refined-sleep-password">Screen-sleep password</label>
              <input
                ref={passwordRef}
                id="refined-sleep-password"
                name="screen-sleep-password"
                type="password"
                autoComplete="off"
                required
                aria-describedby="sleep-local-note sleep-prototype-message"
                placeholder="Enter password"
              />
              <button type="submit">Unlock workspace <span aria-hidden="true">→</span></button>
            </form>
            <p className="sleep-local-note" id="sleep-local-note">
              This password stays in this browser. It is a local privacy lock, not account security.
            </p>
            <p className="sleep-prototype-message" id="sleep-prototype-message" role="status" aria-live="polite">
              {prototypeMessage || " "}
            </p>
            <button className="sleep-back-button" type="button" onClick={() => { setPromptOpen(false); setPrototypeMessage(""); }}>
              Back to sleep screen
            </button>
          </section>
        )}

        <div className="sleep-refined-footer" aria-hidden="true">
          <span>Workspace concealed</span>
          <span className="sleep-footer-rule" />
          <span>Only this screen is visible</span>
        </div>
      </div>

      <style>{`
        .refined-sleep {
          --sleep-surface: var(--panel);
          --sleep-ink: var(--text);
          --sleep-accent: var(--accent);
          --sleep-muted: var(--muted);
          --sleep-border: var(--border);
          --sleep-input: var(--input-bg);
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          overflow: hidden;
          background: #000;
          color: #e9e7e1;
          font-family: var(--main-font);
        }
        .sleep-refined-frame {
          display: grid;
          grid-template-rows: auto 1fr auto;
          min-height: 100vh;
          min-height: 100dvh;
          padding: clamp(22px, 4vw, 54px) clamp(22px, 5vw, 72px) 28px;
          background: #000;
        }
        .sleep-refined-topline, .sleep-refined-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          color: #797a76;
          font-size: 11px;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .sleep-wordmark { display: inline-flex; align-items: center; gap: 10px; color: #b6b5ae; font-size: 12px; font-weight: 600; letter-spacing: .08em; }
        .sleep-wordmark-mark { width: 9px; height: 9px; border: 1px solid #c3bda9; border-radius: 3px; transform: rotate(45deg); }
        .sleep-status { display: inline-flex; align-items: center; gap: 9px; }
        .sleep-status-dot { width: 5px; height: 5px; border-radius: 50%; background: #8a9d87; box-shadow: 0 0 0 4px rgb(138 157 135 / 12%); }
        .sleep-rest-state { align-self: center; justify-self: center; display: flex; width: min(500px, 100%); flex-direction: column; align-items: center; padding: 24px 18px 54px; text-align: center; animation: sleep-arrive .5s ease both; }
        .sleep-orbit { position: relative; display: grid; width: 66px; height: 66px; place-items: center; margin-bottom: 36px; }
        .sleep-orbit-ring { position: absolute; inset: 0; border: 1px solid #343630; border-radius: 50%; }
        .sleep-orbit-core { width: 9px; height: 9px; border-radius: 50%; background: #aaa58f; box-shadow: 0 0 0 10px rgb(170 165 143 / 8%); }
        .sleep-eyebrow { margin: 0 0 15px; color: #8d8e86; font-size: 11px; letter-spacing: .17em; text-transform: uppercase; }
        .sleep-rest-state h1 { margin: 0; color: #e8e6df; font-size: clamp(28px, 4vw, 39px); font-weight: 500; letter-spacing: -.045em; line-height: 1.12; }
        .sleep-wake-hint { margin: 17px 0 25px; color: #92928b; font-size: 14px; line-height: 1.6; }
        .sleep-wake-button, .sleep-unlock-form button {
          display: inline-flex; min-height: 46px; align-items: center; justify-content: center; gap: 16px;
          border: 1px solid #383a35; border-radius: 8px; background: transparent; color: #d9d6ca;
          font: 600 13px var(--main-font); letter-spacing: .01em; cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .18s ease;
        }
        .sleep-wake-button { padding: 0 18px; }
        .sleep-wake-button span { color: #99947e; font-size: 16px; }
        .sleep-wake-button:hover { border-color: #777563; background: #12130f; }
        .sleep-wake-button:active, .sleep-unlock-form button:active { transform: translateY(1px); }
        .sleep-unlock-card {
          align-self: center; justify-self: center; width: min(424px, 100%); padding: clamp(24px, 5vw, 38px);
          border: 1px solid var(--sleep-border); border-radius: 14px; background: var(--sleep-surface); color: var(--sleep-ink);
          box-shadow: 0 28px 90px rgb(0 0 0 / 54%); animation: sleep-arrive .32s ease both;
        }
        .sleep-card-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 23px; }
        .sleep-lock-icon { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid color-mix(in srgb, var(--sleep-accent) 25%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--sleep-accent) 8%, transparent); color: var(--sleep-accent); }
        .sleep-lock-icon svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
        .sleep-card-kicker { color: var(--sleep-muted); font-size: 10px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
        .sleep-unlock-card h1 { margin: 0 0 9px; color: var(--sleep-ink); font-size: clamp(23px, 4vw, 28px); font-weight: 600; letter-spacing: -.04em; line-height: 1.15; }
        .sleep-unlock-description { margin: 0 0 25px; color: var(--sleep-muted); font-size: 13px; line-height: 1.55; }
        .sleep-unlock-form { display: flex; flex-direction: column; }
        .sleep-unlock-form label { margin-bottom: 8px; color: var(--sleep-ink); font-size: 12px; font-weight: 600; }
        .sleep-unlock-form input { width: 100%; min-height: 46px; padding: 0 13px; border: 1px solid var(--sleep-border); border-radius: 7px; outline: none; background: var(--sleep-input); color: var(--sleep-ink); font: 14px var(--main-font); }
        .sleep-unlock-form input::placeholder { color: var(--sleep-muted); opacity: .72; }
        .sleep-unlock-form input:focus-visible { border-color: var(--sleep-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sleep-accent) 18%, transparent); }
        .sleep-unlock-form button { width: 100%; margin-top: 11px; padding: 0 15px; border-color: var(--sleep-accent); background: var(--sleep-accent); color: var(--sleep-surface); }
        .sleep-unlock-form button:hover { filter: brightness(.92); }
        .sleep-unlock-form button span { margin-left: auto; font-size: 16px; }
        .sleep-local-note { margin: 19px 0 0; padding-top: 15px; border-top: 1px solid var(--sleep-border); color: var(--sleep-muted); font-size: 11px; line-height: 1.55; }
        .sleep-prototype-message { min-height: 1.4em; margin: 8px 0 0; color: var(--sleep-accent); font-size: 11px; line-height: 1.4; }
        .sleep-back-button { margin-top: 4px; padding: 5px 0; border: 0; background: transparent; color: var(--sleep-muted); font: 500 11px var(--main-font); cursor: pointer; }
        .sleep-back-button:hover { color: var(--sleep-ink); }
        .sleep-refined-footer { justify-content: center; gap: 14px; color: #60615c; font-size: 9px; letter-spacing: .13em; }
        .sleep-footer-rule { width: 24px; height: 1px; background: #343530; }
        .refined-sleep button:focus-visible { outline: 2px solid #c7bea0; outline-offset: 3px; }
        @keyframes sleep-arrive { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 520px) {
          .sleep-refined-frame { padding: 20px 20px 22px; }
          .sleep-refined-topline { font-size: 9px; letter-spacing: .08em; }
          .sleep-wordmark { font-size: 10px; }
          .sleep-rest-state { padding-bottom: 35px; }
          .sleep-orbit { margin-bottom: 28px; }
          .sleep-refined-footer { font-size: 8px; gap: 9px; }
          .sleep-unlock-card { border-radius: 12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sleep-rest-state, .sleep-unlock-card { animation: none; }
          .sleep-wake-button, .sleep-unlock-form button { transition: none; }
        }
      `}</style>
    </main>
  );
}
