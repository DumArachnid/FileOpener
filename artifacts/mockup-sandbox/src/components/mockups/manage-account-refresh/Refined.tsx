import "./_group.css";
import "./refined.css";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Coins,
  FileClock,
  Fingerprint,
  Globe2,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  UnlockKeyhole,
  UserRound,
  UserRoundCog,
} from "lucide-react";

type Account = {
  username: string;
  role: "user" | "moderator" | "dev";
  banned: boolean;
  optedIn: boolean;
  unlocked: boolean;
};

const seedAccount: Account = {
  username: "maria_lee",
  role: "user",
  banned: false,
  optedIn: true,
  unlocked: false,
};
const currentActorUsername = "avery_chen";

const activity = [
  { title: "Reward granted", detail: "250 points · Study milestone", actor: "dum", date: "Oct 18, 2026", kind: "reward" },
  { title: "Account restored", detail: "Temporary restriction lifted", actor: "A. Chen", date: "Sep 06, 2026", kind: "restore" },
  { title: "Ban applied", detail: "Repeated community reports", actor: "A. Chen", date: "Sep 04, 2026", kind: "ban" },
];

export function Refined() {
  const [username, setUsername] = useState("maria_lee");
  const [account, setAccount] = useState<Account | null>(seedAccount);
  const [banReason, setBanReason] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [section, setSection] = useState<"history" | "tabs">("history");
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardType, setRewardType] = useState("Points");
  const [rewardAmount, setRewardAmount] = useState("120");
  const [rewardReason, setRewardReason] = useState("");
  const [notice, setNotice] = useState("");

  const searchAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const exact = username.trim();
    if (!exact || exact !== seedAccount.username) {
      setAccount(null);
      setQueryMessage(exact ? "No account found with that exact username." : "Enter an exact username to search.");
      return;
    }
    setAccount((current) => current ?? { ...seedAccount });
    setQueryMessage("Exact match found.");
  };

  const accountAction = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  const grantReward = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account || account.username === currentActorUsername || !rewardReason.trim() || Number(rewardAmount) < 1) return;
    setRewardOpen(false);
    setRewardReason("");
    accountAction(`${rewardAmount} ${rewardType.toLowerCase()} granted to ${account?.username}.`);
  };

  const canChangeAccess = (target: Account) => target.username !== currentActorUsername && target.role === "user";
  const canPromote = (target: Account) => canChangeAccess(target) && !target.banned;
  const canRewardOrUnlock = (target: Account) => target.username !== currentActorUsername;

  return (
    <main className="sd-manage">
      <div className="sd-shell">
        <header className="sd-topbar">
          <div className="sd-brand">
            <span className="sd-mark"><span /></span>
            <span>STUDY DESK</span>
            <span className="sd-divider">/</span>
            <span className="sd-admin-label">ADMIN WORKSPACE</span>
          </div>
          <div className="sd-authorized"><ShieldCheck size={15} strokeWidth={1.8} /> Authorized access</div>
        </header>

        <section className="sd-heading">
          <div>
            <div className="sd-eyebrow">ACCOUNT OVERSIGHT <span>·</span> 01 / 04</div>
            <h1>Manage an account</h1>
            <p>Look up a student to review account access, rewards, and activity.</p>
          </div>
          <div className="sd-audit-note"><LockKeyhole size={15} /><span>Every admin action is recorded</span></div>
        </section>

        <div className="sd-privacy">
          <div className="sd-privacy-icon"><Fingerprint size={17} /></div>
          <p><strong>Privacy stays with the learner.</strong> Shared tab details appear only after a student opts in. Only page titles and site names are shown—never page contents, files, or full URLs.</p>
          <CircleHelp size={16} className="sd-help" />
        </div>

        <div className="sd-layout">
          <section className="sd-primary">
            <form className="sd-lookup" onSubmit={searchAccount}>
              <label htmlFor="sd-username">Find by exact username</label>
              <div className="sd-lookup-row">
                <div className="sd-input-wrap"><Search size={17} /><input id="sd-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter username" autoComplete="off" /></div>
                <button className="sd-button sd-search" type="submit">Search <ArrowRight size={15} /></button>
              </div>
              <div className="sd-lookup-foot"><span>Exact match only</span><span>3–24 characters</span></div>
            </form>

            {queryMessage && <div className={`sd-query-message ${account ? "is-success" : "is-error"}`} role="status">{account ? <Check size={14} /> : <CircleHelp size={14} />}{queryMessage}</div>}

            {account ? (
              <>
                <section className="sd-profile">
                  <div className="sd-profile-head">
                    <div className="sd-avatar">ML</div>
                    <div className="sd-profile-name">
                      <div className="sd-name-line"><h2>{account.username}</h2><span className={`sd-status ${account.banned ? "is-banned" : ""}`}><i />{account.banned ? "Banned" : "Active"}</span></div>
                      <div className="sd-role"><UserRound size={13} /> {account.role === "user" ? "Regular user" : account.role === "moderator" ? "Admin" : "Developer"}</div>
                    </div>
                    <button className="sd-overflow" type="button" aria-label="More account details"><ChevronDown size={18} /></button>
                  </div>

                  <div className="sd-profile-rule" />
                  <label className="sd-field-label" htmlFor="sd-ban-reason">Ban reason <span>Optional</span></label>
                  <input className="sd-reason-input" id="sd-ban-reason" value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder="Add a brief explanation for the record" maxLength={500} />

                  <div className="sd-actions">
                    {canChangeAccess(account) && <button className={`sd-button ${account.banned ? "sd-neutral" : "sd-danger"}`} onClick={() => {
                      if (!canChangeAccess(account)) return;
                      setAccount({ ...account, banned: !account.banned });
                      accountAction(account.banned ? "Account restored." : "Account banned and signed out.");
                    }} type="button">
                      {account.banned ? <UnlockKeyhole size={15} /> : <Ban size={15} />}{account.banned ? "Restore account" : "Ban account"}
                    </button>}
                    {canPromote(account) && <button className="sd-button sd-promote" type="button" onClick={() => {
                      if (!canPromote(account)) return;
                      setAccount({ ...account, role: "moderator" });
                      accountAction("Admin access granted.");
                    }}><UserRoundCog size={15} /> Promote to admin</button>}
                    {canRewardOrUnlock(account) && <button className="sd-button sd-quiet" type="button" onClick={() => {
                      if (!canRewardOrUnlock(account)) return;
                      setAccount({ ...account, unlocked: true });
                      accountAction("All built-in features unlocked.");
                    }} disabled={account.unlocked}><Sparkles size={15} />{account.unlocked ? "Features unlocked" : "Unlock all features"}</button>}
                    {canRewardOrUnlock(account) && <button className="sd-button sd-quiet" type="button" onClick={() => {
                      if (!canRewardOrUnlock(account)) return;
                      setRewardOpen(!rewardOpen);
                    }}><Coins size={15} /> Grant points or shards</button>}
                  </div>

                  <div className="sd-safeguard"><LockKeyhole size={14} /><span>Ban and restore apply only to other regular accounts. Promotion is limited to eligible, active regular users. Rewards and feature unlocks are available for other accounts.</span></div>
                </section>
                {rewardOpen && <form className="sd-reward-form" onSubmit={grantReward}>
                  <div className="sd-reward-title"><div><span className="sd-eyebrow">ACCOUNT REWARD</span><h3>Grant to {account.username}</h3></div><button type="button" className="sd-close" onClick={() => setRewardOpen(false)} aria-label="Close reward form">×</button></div>
                  <div className="sd-reward-fields">
                    <label>Reward type<select value={rewardType} onChange={(event) => setRewardType(event.target.value)}><option>Points</option><option>Shards</option></select></label>
                    <label>Amount<input type="number" min="1" max="10000" value={rewardAmount} onChange={(event) => setRewardAmount(event.target.value)} required /></label>
                  </div>
                  <label className="sd-reward-reason">Reason<input value={rewardReason} onChange={(event) => setRewardReason(event.target.value)} placeholder="Why is this reward being given?" required maxLength={500} /></label>
                  <button className="sd-button sd-promote sd-grant" type="submit">Grant reward <ArrowRight size={15} /></button>
                </form>}
              </>
            ) : (
              <div className="sd-empty">
                <div className="sd-empty-icon"><UserRound size={22} /></div>
                <h2>Search for an account</h2>
                <p>Enter the username exactly as it appears. Account details and available actions will show here.</p>
              </div>
            )}
          </section>

          <aside className="sd-secondary">
            <div className="sd-side-top">
              <div><span className="sd-eyebrow">ACCOUNT DETAILS</span><h2>Review &amp; activity</h2></div>
              <span className="sd-count">02</span>
            </div>
            <div className="sd-tabs" role="tablist" aria-label="Account review sections">
              <button type="button" role="tab" aria-selected={section === "history"} className={section === "history" ? "selected" : ""} onClick={() => setSection("history")}><FileClock size={14} /> History <span>3</span></button>
              <button type="button" role="tab" aria-selected={section === "tabs"} className={section === "tabs" ? "selected" : ""} onClick={() => setSection("tabs")}><Globe2 size={14} /> Shared tabs</button>
            </div>
            {section === "history" ? (
              <div className="sd-history">
                <div className="sd-section-caption"><span>RECENT ACCOUNT ACTIONS</span><span>Up to 100</span></div>
                {account ? activity.map((item, index) => <div className="sd-event" key={item.title}>
                  <div className={`sd-event-mark ${item.kind}`}><span /></div>
                  <div className="sd-event-copy"><strong>{item.title}</strong><p>{item.detail}</p><div className="sd-event-meta"><span>By {item.actor}</span><i />{item.date}</div></div>
                  {index === 0 && <Clock3 className="sd-event-clock" size={14} />}
                </div>) : <div className="sd-side-empty">Search for an account to see its ban and admin-action history.</div>}
              </div>
            ) : (
              <div className="sd-shared">
                {!account ? <div className="sd-side-empty">Search for an account to check whether they have opted in to sharing tab titles.</div> :
                  account.optedIn ? <>
                    <div className="sd-consent"><ShieldCheck size={15} /><div><strong>Sharing is on</strong><span>This learner has opted in</span></div><span className="sd-on">OPTED IN</span></div>
                    <p className="sd-tab-disclaimer">Titles and hostnames only. Page contents, local files, URL paths, query strings, and fragments are never shared.</p>
                    <div className="sd-tab-item"><div className="sd-favicon">G</div><div><strong>Cell structure review</strong><span>classroom.google.com</span></div><span className="sd-tab-time">Now</span></div>
                    <div className="sd-tab-item"><div className="sd-favicon doc">D</div><div><strong>World history notes</strong><span>docs.google.com</span></div><span className="sd-tab-time">12m</span></div>
                  </> : <div className="sd-opt-out"><div className="sd-opt-icon"><LockKeyhole size={19} /></div><strong>Tab sharing is off</strong><p>This learner has not opted in. No tab details are available to review.</p></div>}
              </div>
            )}
            <div className="sd-side-footer"><LockKeyhole size={13} /><span>{section === "history" ? "Admin actions are retained for accountability." : "Consent is controlled by the learner."}</span></div>
          </aside>
        </div>
        <footer className="sd-footer"><span>Study Desk <b>·</b> Admin tools</span><span><LockKeyhole size={12} /> Private workspace</span></footer>
      </div>
      {notice && <div className="sd-toast" role="status"><Check size={16} />{notice}</div>}
    </main>
  );
}
