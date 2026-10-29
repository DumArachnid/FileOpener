import { useState } from "react";
import {
  ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp,
  Code2, CodeXml, Compass, Copy, FileCode2, Flag, LockKeyhole, Plus,
  ShieldCheck, Sparkles, Timer, X,
} from "lucide-react";
import "./refined.css";

type StoreItem = {
  id: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  icon: "book" | "timer" | "code";
  source: string;
};

const communityItems: StoreItem[] = [
  {
    id: "lecture-outline",
    name: "Lecture Outline",
    description: "Turn a rough set of class notes into a tidy outline you can revisit before an exam.",
    publisher: "maya.chen",
    version: "v1.2.0",
    icon: "book",
    source: `// Lecture Outline · v1.2.0\n// Formats notes you choose to paste into the tool.\nexport function outline(text) {\n  return text.split(/\\n+/).filter(Boolean)\n    .map((line) => ({ heading: line.trim() }));\n}`,
  },
  {
    id: "tab-tidy",
    name: "Tab Tidy",
    description: "A small, manual checklist for grouping the reference pages you want to return to.",
    publisher: "eli.rivera",
    version: "v0.8.4",
    icon: "code",
    source: `// Tab Tidy · v0.8.4\n// Keeps a checklist in the extension's own state.\nexport const createChecklist = () => ({\n  title: "Reading list",\n  links: [],\n});`,
  },
];

const demos: StoreItem[] = [
  {
    id: "study-sprint",
    name: "Study Sprint",
    description: "A focused work-and-break timer with pause, resume, and reset actions for study sessions.",
    publisher: "Study Desk",
    version: "Built-in tool",
    icon: "timer",
    source: `// Study Sprint\n// A simple timer for focused work and short breaks.\nconst sprint = {\n  workMinutes: 25,\n  breakMinutes: 5,\n  state: "ready",\n  pause() { this.state = "paused"; },\n  resume() { this.state = "running"; },\n  reset() { this.state = "ready"; },\n};`,
  },
  {
    id: "reading-highlights",
    name: "Reading Highlights",
    description: "Save, review, and undo manually entered reading highlights. Up to 40 are saved in this browser.",
    publisher: "Study Desk",
    version: "Built-in tool",
    icon: "book",
    source: `// Reading Highlights\n// Saves highlights you manually enter, in this browser.\nconst MAX_HIGHLIGHTS = 40;\nfunction saveHighlight(highlights, text) {\n  if (highlights.length >= MAX_HIGHLIGHTS) return highlights;\n  return [...highlights, { text, savedAt: Date.now() }];\n}`,
  },
];

function ItemIcon({ kind }: { kind: StoreItem["icon"] }) {
  const Icon = kind === "timer" ? Timer : kind === "book" ? BookOpen : Code2;
  return <span className={`refined-icon refined-icon-${kind}`} aria-hidden="true"><Icon size={19} strokeWidth={1.8} /></span>;
}

export function Refined() {
  const [signedIn, setSignedIn] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<StoreItem | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [reported, setReported] = useState<string[]>([]);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [developerSignedIn, setDeveloperSignedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [searched, setSearched] = useState(false);
  const [drafts, setDrafts] = useState<{ name: string; status: string }[]>([
    { name: "Exam week planner", status: "Private draft · edited today" },
  ]);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSource, setFormSource] = useState("");
  const [notice, setNotice] = useState("");

  const openAccount = () => setAccountOpen(true);
  const saveDraft = (submit = false) => {
    if (!formName.trim() || !formDescription.trim() || !formSource.trim()) return;
    setDrafts((items) => [{ name: formName.trim(), status: submit ? "Waiting for moderator approval" : "Private draft · edited just now" }, ...items]);
    setNotice(submit ? "Submitted for moderator approval. Your listing stays private until approved." : "Private draft saved.");
    setCreateOpen(false);
    setFormName("");
    setFormDescription("");
    setFormSource("");
  };
  const showDetails = (item: StoreItem) => setActive(item);
  const install = (item: StoreItem) => {
    setInstalled((items) => items.includes(item.id) ? items : [...items, item.id]);
    setActive(null);
    setNotice(`${item.name} is saved in your workspace and remains disabled until you enable it.`);
  };
  const closeModal = () => {
    setActive(null);
    setAccountOpen(false);
    setCreateOpen(false);
  };

  return (
    <main className="refined-store">
      <div className="refined-shell">
        <header className="refined-topbar">
          <a className="refined-brand" href="#top" aria-label="Study Desk Extension Store home">
            <span className="refined-mark" aria-hidden="true"><span /></span>
            <span className="brand-study">Study Desk</span><span className="brand-divider" /><span className="brand-sub">Extension Store</span>
          </a>
          <div className="refined-top-actions">
            <span className="account-label"><span className={`account-dot ${signedIn ? "is-on" : ""}`} />{signedIn ? "Signed in as" : "Not signed in"}{signedIn && <strong> sam.taylor</strong>}</span>
            <button className="refined-button button-quiet" onClick={openAccount} type="button">{signedIn ? "Account settings" : "Sign in"}</button>
            <button className="refined-button button-back" type="button" onClick={() => setNotice("Return to your Study Desk workspace to keep studying.")}><ArrowLeft size={15} /> Back to Study Desk</button>
          </div>
        </header>

        {notice && <div className="refined-notice" role="status"><Check size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button></div>}

        <section className="refined-hero" id="top">
          <div className="hero-copy">
            <span className="refined-kicker"><span className="kicker-line" /> A SMALLER, SAFER WAY TO MAKE STUDY DESK YOURS</span>
            <h1>Your study space,<br /><em>with room to grow.</em></h1>
            <p className="hero-description">Thoughtful tools made by students, for the way students actually work. Explore the source, choose what to install, and keep every extension off until you turn it on.</p>
            <a className="hero-anchor" href="#community">Explore community tools <ChevronRight size={16} /></a>
          </div>
          <div className="hero-art" aria-label="Illustration of a study desk with a book and organized cards">
            <div className="art-sun" />
            <div className="art-window"><div className="window-bar" /><div className="window-note"><span /><span /><span /></div><div className="window-card"><BookOpen size={23} /><div><b>Reading notes</b><small>3 highlights saved</small></div></div></div>
            <div className="art-book"><div className="book-spine" /><span>FIELD<br />NOTES</span><i>01</i></div>
            <div className="art-pencil" />
            <div className="art-caption"><Sparkles size={14} /> A desk that works your way</div>
          </div>
          <div className="trust-strip"><span className="trust-symbol"><ShieldCheck size={18} /></span><p><strong>Built with care. Kept in your control.</strong><br />Extensions run in an isolated sandbox. They cannot read page contents, files, tabs, or access the network. Review source code before installing.</p><span className="trust-mark">STUDY DESK<br />SAFETY NOTE 01</span></div>
        </section>

        <section className="store-section community-section" id="community" aria-labelledby="community-title">
          <div className="section-heading">
            <div><div className="section-overline"><Compass size={14} /> FROM THE COMMUNITY</div><h2 id="community-title">Made by students</h2><p>Published tools are reviewed by moderators before they appear here.</p></div>
            <button className="refined-button button-primary" type="button" onClick={() => signedIn ? setCreateOpen(true) : openAccount()}><Plus size={17} /> Create extension</button>
          </div>
          <div className="store-status"><span className="status-live" /> Online store <span className="status-sep">/</span> Browse approved community extensions</div>
          {signedIn && <div className="drafts-block"><div className="drafts-title"><div><FileCode2 size={16} /><strong>Your extensions</strong></div><span>{drafts.length} {drafts.length === 1 ? "item" : "items"}</span></div>
            {drafts.map((draft, i) => <div className="draft-row" key={`${draft.name}-${i}`}><div className="draft-symbol"><FileCode2 size={17} /></div><div className="draft-copy"><strong>{draft.name}</strong><small>{draft.status}</small></div><button className="text-action" type="button" onClick={() => { setFormName(draft.name); setCreateOpen(true); }}>Edit <ArrowUpRight size={14} /></button>{draft.status.startsWith("Private") && <button className="text-action draft-submit" type="button" onClick={() => setDrafts((items) => items.map((item) => item.name === draft.name ? { ...item, status: "Waiting for moderator approval" } : item))}>Submit for approval</button>}<button className="delete-action" type="button" aria-label={`Delete ${draft.name}`} onClick={() => setDrafts((items) => items.filter((_, index) => index !== i))}>Delete</button></div>)}
          </div>}
          {!signedIn && <div className="signin-nudge"><LockKeyhole size={16} /><span>Sign in to create a private draft or manage your submissions.</span><button type="button" onClick={openAccount}>Sign in <ArrowUpRight size={14} /></button></div>}
          <div className="listing-grid">
            {communityItems.map((item, index) => <article className="listing-card" key={item.id}>
              <div className="listing-top"><ItemIcon kind={item.icon} /><span className="published-pill"><span /> PUBLISHED</span><span className="listing-index">0{index + 1}</span></div>
              <h3>{item.name}</h3><p className="listing-description">{item.description}</p>
              <div className="listing-meta"><span>By <strong>{item.publisher}</strong></span><span>{item.version}</span></div>
              <div className="listing-actions"><button className="refined-button button-outline" onClick={() => showDetails(item)} type="button"><CodeXml size={16} /> Review source</button>
                {!reported.includes(item.id) && <button className="report-button" onClick={() => { if (!signedIn) openAccount(); else { setReporting(reporting === item.id ? null : item.id); setReportMessage(""); } }} type="button"><Flag size={14} /> Report listing</button>}
                {reported.includes(item.id) && <span className="reported-tag"><Check size={14} /> Report sent</span>}
              </div>
              {reporting === item.id && <form className="report-form" onSubmit={(event) => { event.preventDefault(); if (reportText.trim().length < 3) return; setReported((items) => [...items, item.id]); setReporting(null); setReportText(""); setReportMessage("Report sent to the review team."); }}>
                <label htmlFor={`report-${item.id}`}>Why should this listing be reviewed?</label><textarea id={`report-${item.id}`} minLength={3} maxLength={500} required value={reportText} onChange={(event) => setReportText(event.target.value)} placeholder="Share a specific concern…" /><button className="refined-button button-primary report-send" type="submit">Send report</button>{reportMessage && <span role="status">{reportMessage}</span>}
              </form>}
            </article>)}
          </div>
        </section>

        <section className="store-section ready-section" aria-labelledby="ready-title">
          <div className="section-heading">
            <div><div className="section-overline"><Sparkles size={14} /> READY WHEN YOU ARE</div><h2 id="ready-title">Study Desk essentials</h2><p>Working tools, ready to add. Installation saves the source; enabling stays your choice.</p></div>
            <span className="local-label"><span /> INCLUDED WITH STUDY DESK</span>
          </div>
          <div className="ready-list">{demos.map((item, index) => <article className="ready-item" key={item.id}>
            <div className={`ready-number ready-number-${index + 1}`}>0{index + 1}</div><ItemIcon kind={item.icon} />
            <div className="ready-copy"><div className="ready-title-row"><h3>{item.name}</h3><span className="ready-built">READY TO INSTALL</span></div><p>{item.description}</p><div className="ready-details"><span>By Study Desk</span><span>{index === 0 ? "Focus & breaks" : "Reading & research"}</span></div></div>
            <button className="refined-button button-outline ready-review" onClick={() => showDetails(item)} type="button">{installed.includes(item.id) ? <><Check size={16} /> Installed</> : <>Review details <ArrowUpRight size={15} /></>}</button>
          </article>)}</div>
        </section>

        <section className="later-section" aria-labelledby="later-title"><div className="later-icon"><BookOpen size={20} /></div><div className="later-copy"><div className="section-overline">ON THE READING LIST</div><h2 id="later-title">A little more, later.</h2><p>We're taking time to get the next tools right.</p></div><article className="later-card"><div className="later-card-top"><span className="later-tag">COMING LATER</span><span className="later-number">03</span></div><h3>Citation Helper</h3><p>Format citation drafts while studying. This item is not installable yet.</p><button className="refined-button button-disabled" disabled type="button">Not available yet</button></article></section>

        <section className="developer-section" aria-labelledby="developer-title">
          <button className="developer-toggle" onClick={() => setDeveloperOpen(!developerOpen)} type="button" aria-expanded={developerOpen}><span className="dev-icon"><Code2 size={18} /></span><span><strong id="developer-title">Developer controls</strong><small>Restricted tools for authorized Study Desk developers</small></span><span className={`dev-chevron ${developerOpen ? "expanded" : ""}`}><ChevronRight size={17} /></span></button>
          {developerOpen && <div className="developer-body"><p>Authorized developers can assign or remove Study Desk admin and developer ranks.</p>{!developerSignedIn ? <button className="refined-button button-outline" type="button" onClick={() => setDeveloperSignedIn(true)}><LockKeyhole size={15} /> Developer sign in</button> : <><div className="dev-authorized"><Check size={15} /> Developer access active <button type="button" onClick={() => { setDeveloperSignedIn(false); setSearched(false); }}>Sign out developer</button></div><form className="developer-search" onSubmit={(event) => { event.preventDefault(); setSearched(true); }}><label htmlFor="username-search">Find a Study Desk account by exact username</label><div><input id="username-search" minLength={3} maxLength={24} autoComplete="off" value={username} onChange={(event) => { setUsername(event.target.value); setSearched(false); }} placeholder="Enter username" required /><button className="refined-button button-primary" type="submit">Search</button></div></form>{searched && <div className="search-result" role="status">No matching account for <strong>{username}</strong>.</div>}</>}</div>}
        </section>

        <footer className="refined-footer"><a href="#top" className="footer-brand"><span className="footer-mark" /> Study Desk <span>/</span> Extension Store</a><span>Good tools, shared with care.</span><button type="button" onClick={() => setNotice("Extensions run in an isolated sandbox and remain off until enabled.")}><CircleHelp size={15} /> How extensions work</button></footer>
      </div>

      {(active || createOpen || accountOpen) && <div className="refined-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <section className="refined-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-head"><div><div className="section-overline">{active ? "SOURCE REVIEW" : createOpen ? "YOUR PRIVATE WORKSPACE" : "STUDY DESK ACCOUNT"}</div><h2 id="modal-title">{active ? active.name : createOpen ? "Create an extension" : signedIn ? "Account settings" : "Welcome back"}</h2></div><button className="modal-close" type="button" aria-label="Close dialog" onClick={closeModal}><X size={19} /></button></div>
          {active && <div className="modal-content"><p>{active.description}</p><div className="source-caption"><ShieldCheck size={16} /> Published by {active.publisher}. Review the source before installing.</div><div className="source-label"><span><CodeXml size={15} /> SOURCE CODE</span><button type="button" onClick={() => { void navigator.clipboard?.writeText(active.source); setNotice("Source copied to clipboard."); }}><Copy size={14} /> Copy</button></div><pre className="source-view"><code>{active.source}</code></pre><p className="source-help">Installation saves the source. This extension remains disabled until you enable it from the Extensions menu.</p><button className="refined-button button-primary modal-install" type="button" disabled={installed.includes(active.id)} onClick={() => install(active)}>{installed.includes(active.id) ? <><Check size={16} /> Already installed</> : <><Plus size={16} /> Install disabled</>}</button></div>}
          {createOpen && <form className="modal-content extension-form" onSubmit={(event) => { event.preventDefault(); saveDraft(false); }}><p>Your draft stays private while you work. Submissions become public only after moderator approval. Never include personal information or secrets.</p><label htmlFor="extension-name">Extension name</label><input id="extension-name" maxLength={60} value={formName} onChange={(event) => setFormName(event.target.value)} required placeholder="A clear, memorable name" /><label htmlFor="extension-description">Description</label><textarea id="extension-description" rows={3} maxLength={500} value={formDescription} onChange={(event) => setFormDescription(event.target.value)} required placeholder="What does it help a student do?" /><label htmlFor="extension-source">JavaScript source</label><textarea id="extension-source" className="form-code" rows={7} maxLength={200000} spellCheck={false} value={formSource} onChange={(event) => setFormSource(event.target.value)} required placeholder="// Add the extension's JavaScript source" /><div className="form-actions"><button className="refined-button button-outline" type="submit">Save private draft</button><button className="refined-button button-primary" type="button" onClick={() => saveDraft(true)}>Submit for approval <ArrowUpRight size={15} /></button></div></form>}
          {accountOpen && <div className="modal-content account-modal"><span className="account-illustration"><LockKeyhole size={24} /></span><p>{signedIn ? "You're signed in to Study Desk. Your drafts and submissions are private to your account." : "Sign in from your Study Desk workspace to create extensions, report listings, and manage your drafts."}</p>{signedIn ? <button className="refined-button button-outline" onClick={() => { setSignedIn(false); setAccountOpen(false); }} type="button">Sign out</button> : <button className="refined-button button-primary" onClick={() => { setSignedIn(true); setAccountOpen(false); }} type="button">Continue as sam.taylor <ArrowUpRight size={15} /></button>}<small>Prototype account state · no account data is sent</small></div>}
        </section>
      </div>}
    </main>
  );
}
