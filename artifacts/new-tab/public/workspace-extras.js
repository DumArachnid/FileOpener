/* New Tab workspace extras: bookmarks, recents, viewer tabs, command palette, notes, focus timer,
   find/highlight, word counts, editor undo/redo, keyboard shortcuts. Hooks into the core via window.NT. */
(function () {
  'use strict';
  var NT = window.NT;
  var ic = NT.ic, toast = NT.toast, confirmDialog = NT.confirmDialog, safeUrl = NT.safeUrl;
  var V = NT.V;
  var el = function (id) { return document.getElementById(id); };
  var previewArea = el('previewArea'), urlInput = el('urlInput'), editorTextarea = el('editorTextarea');
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var hostOf = function (u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');

  // =====================================================
  // (1) Bookmarks
  // =====================================================
  var BM_KEY = 'disguise_bookmarks';
  var bookmarks = (NT.getJSON(BM_KEY, []) || []).filter(function (b) { return b && typeof b.url === 'string' && safeUrl(b.url); });
  function saveBookmarks() { NT.setJSON(BM_KEY, bookmarks); renderBookmarks(); updateStar(); if (NT.afterEmpty && el('emptyState')) NT.afterEmpty(); }
  function isBookmarked(u) { return !!u && bookmarks.some(function (b) { return b.url === u; }); }
  function addBookmark(raw, name) {
    var u = safeUrl(raw);
    if (!u) { toast('Enter a valid http or https address', 'error'); return false; }
    if (isBookmarked(u)) { toast('Already bookmarked'); return false; }
    bookmarks.unshift({ id: uid(), title: (name || '').trim().slice(0, 60) || hostOf(u), url: u });
    saveBookmarks(); toast('Bookmarked ' + hostOf(u));
    return true;
  }
  function removeBookmark(id) { bookmarks = bookmarks.filter(function (b) { return b.id !== id; }); saveBookmarks(); toast('Bookmark removed'); }
  function renderBookmarks() {
    var box = el('bookmarkList');
    el('bmCount').textContent = bookmarks.length;
    box.innerHTML = '';
    if (!bookmarks.length) { box.innerHTML = '<div class="list-empty">No bookmarks yet. Add an address above or tap the star next to the address bar.</div>'; return; }
    bookmarks.forEach(function (b) {
      var row = document.createElement('div');
      row.className = 'item';
      row.setAttribute('data-testid', 'bookmark-' + b.id);
      row.innerHTML = '<span class="avatar"></span><button class="open" type="button"><b></b><span></span></button>' +
        '<button class="icon-btn ren" type="button" title="Rename" aria-label="Rename bookmark">' + ic('pencil') + '</button>' +
        '<button class="icon-btn del" type="button" title="Delete" aria-label="Delete bookmark">' + ic('trash') + '</button>';
      row.querySelector('.avatar').textContent = (b.title[0] || '#');
      row.querySelector('b').textContent = b.title;
      row.querySelector('.open span').textContent = hostOf(b.url);
      row.querySelector('.open').addEventListener('click', function () { NT.openUrl(b.url); });
      row.querySelector('.del').addEventListener('click', function () { removeBookmark(b.id); });
      row.querySelector('.ren').addEventListener('click', function () { startRename(row, b); });
      box.appendChild(row);
    });
  }
  function startRename(row, b) {
    var open = row.querySelector('.open');
    var inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'rename'; inp.value = b.title; inp.maxLength = 60;
    inp.setAttribute('aria-label', 'Bookmark name');
    open.replaceWith(inp); inp.focus(); inp.select();
    var done = false;
    function commit(save) {
      if (done) return; done = true;
      if (save && inp.value.trim()) { b.title = inp.value.trim(); NT.setJSON(BM_KEY, bookmarks); toast('Bookmark renamed'); }
      renderBookmarks(); if (NT.afterEmpty && el('emptyState')) NT.afterEmpty();
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(false); } });
    inp.addEventListener('blur', function () { commit(true); });
  }
  el('bmForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = el('bmUrl').value.trim() || urlInput.value.trim();
    if (addBookmark(raw, el('bmName').value)) { el('bmName').value = ''; el('bmUrl').value = ''; }
  });
  function updateStar() {
    var u = safeUrl(urlInput.value);
    var b = el('bmCurrentBtn');
    var on = isBookmarked(u);
    b.classList.toggle('on', on);
    b.title = on ? 'Remove bookmark (Alt+B)' : 'Bookmark this address (Alt+B)';
  }
  function toggleCurrentBookmark() {
    var u = safeUrl(urlInput.value);
    if (!u) { toast('Load or type a web address first', 'error'); urlInput.focus(); return; }
    var b = el('bmCurrentBtn');
    if (isBookmarked(u)) { var f = bookmarks.find(function (x) { return x.url === u; }); removeBookmark(f.id); }
    else addBookmark(u);
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  el('bmCurrentBtn').addEventListener('click', toggleCurrentBookmark);
  urlInput.addEventListener('input', updateStar);

  // =====================================================
  // (2) Recent URLs
  // =====================================================
  var RC_KEY = 'disguise_recents';
  var recents = (NT.getJSON(RC_KEY, []) || []).filter(function (r) { return r && typeof r.url === 'string' && safeUrl(r.url); }).slice(0, 15);
  function addRecent(u) {
    recents = recents.filter(function (r) { return r.url !== u; });
    recents.unshift({ url: u, t: Date.now() });
    recents = recents.slice(0, 15);
    NT.setJSON(RC_KEY, recents); renderRecents();
  }
  function renderRecents() {
    var box = el('recentList');
    el('recentCount').textContent = recents.length;
    el('recentClearBtn').classList.toggle('hidden', !recents.length);
    box.innerHTML = '';
    if (!recents.length) { box.innerHTML = '<div class="list-empty">Pages you load will appear here.</div>'; return; }
    recents.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'item';
      row.setAttribute('data-testid', 'recent-' + r.t);
      row.innerHTML = '<span class="avatar"></span><button class="open" type="button"><b></b><span></span></button><button class="icon-btn del" type="button" title="Remove" aria-label="Remove from recent">' + ic('x') + '</button>';
      row.querySelector('.avatar').textContent = hostOf(r.url)[0] || '#';
      row.querySelector('b').textContent = hostOf(r.url);
      row.querySelector('.open span').textContent = r.url.replace(/^https?:\/\/(www\.)?/, '');
      row.querySelector('.open').addEventListener('click', function () { NT.openUrl(r.url); });
      row.querySelector('.del').addEventListener('click', function () {
        recents = recents.filter(function (x) { return x.url !== r.url; });
        NT.setJSON(RC_KEY, recents); renderRecents(); if (el('emptyState') && NT.afterEmpty) NT.afterEmpty();
      });
      box.appendChild(row);
    });
  }
  el('recentClearBtn').addEventListener('click', async function () {
    if (!(await confirmDialog('Clear recent pages?', 'This removes the list of recently loaded addresses. Bookmarks are kept.', 'Clear', true))) return;
    recents = []; NT.setJSON(RC_KEY, recents); renderRecents(); if (el('emptyState') && NT.afterEmpty) NT.afterEmpty();
  });

  // Empty-state chips
  NT.afterEmpty = function () {
    var bm = previewArea.querySelector('.js-empty-bm'), rc = previewArea.querySelector('.js-empty-rc');
    if (!bm) return;
    function fill(box, wrap, items, label) {
      var c = wrap.querySelector('.chips'); c.innerHTML = '';
      wrap.classList.toggle('hidden', !items.length);
      items.slice(0, 6).forEach(function (it) {
        var b = document.createElement('button');
        b.className = 'chip'; b.type = 'button'; b.textContent = label(it);
        b.addEventListener('click', function () { NT.openUrl(it.url); });
        c.appendChild(b);
      });
    }
    fill(null, bm, bookmarks, function (b) { return b.title; });
    fill(null, rc, recents, function (r) { return hostOf(r.url); });
  };

  // URL suggestions dropdown
  var suggest = el('urlSuggest'), sugIdx = -1;
  function showSuggest() {
    var q = urlInput.value.trim().toLowerCase();
    var pool = bookmarks.map(function (b) { return { url: b.url, label: b.title, ico: 'star' }; })
      .concat(recents.map(function (r) { return { url: r.url, label: r.url.replace(/^https?:\/\//, ''), ico: 'history' }; }));
    var seen = {};
    var items = pool.filter(function (p) {
      if (seen[p.url]) return false; seen[p.url] = 1;
      return !q || p.url.toLowerCase().indexOf(q) > -1 || p.label.toLowerCase().indexOf(q) > -1;
    }).slice(0, 7);
    if (!items.length || (items.length === 1 && items[0].url === safeUrl(urlInput.value))) { suggest.classList.add('hidden'); return; }
    suggest.innerHTML = ''; sugIdx = -1;
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.innerHTML = ic(it.ico) + '<span></span>'; b.querySelector('span').textContent = it.label;
      b.addEventListener('mousedown', function (e) { e.preventDefault(); suggest.classList.add('hidden'); NT.openUrl(it.url); });
      suggest.appendChild(b);
    });
    suggest.classList.remove('hidden');
  }
  urlInput.addEventListener('focus', showSuggest);
  urlInput.addEventListener('input', showSuggest);
  urlInput.addEventListener('blur', function () { setTimeout(function () { suggest.classList.add('hidden'); }, 100); });
  urlInput.addEventListener('keydown', function (e) {
    var btns = suggest.querySelectorAll('button');
    if (suggest.classList.contains('hidden') || !btns.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
      btns.forEach(function (b, i) { b.classList.toggle('act', i === sugIdx); });
      urlInput.value = btns[sugIdx].querySelector('span').textContent;
    } else if (e.key === 'Enter' || e.key === 'Escape') suggest.classList.add('hidden');
  });

  // =====================================================
  // (3) Viewer tabs (content retained per tab)
  // =====================================================
  var tabs = [], activeId = null, MAX_TABS = 12;
  var tabStrip = el('tabStrip');
  function activeTab() { return tabs.find(function (t) { return t.id === activeId; }); }
  function snapshot(t) {
    if (!t) return;
    findClear();
    var isTextView = !!previewArea.querySelector('#textView');
    t.snap = {
      file: V.file, blobURL: V.blobURL, saved: V.saved, isText: V.isText, isHTML: V.isHTML,
      empty: !NT.hasContent() && !!el('emptyState'),
      view: isTextView ? 'text' : (el('emptyState') ? 'empty' : 'html'),
      html: (isTextView || el('emptyState')) ? '' : previewArea.innerHTML,
      left: NT.statusLeft.textContent, right: NT.statusRight.textContent, url: urlInput.value
    };
  }
  function restore(t) {
    NT.closeEditor();
    var s = t.snap;
    if (!s) {
      V.file = null; V.blobURL = null; V.saved = null; V.isText = false; V.isHTML = false;
      NT.showEmpty(); NT.setStatus('No source', ''); urlInput.value = ''; NT.updateActions(false);
    } else {
      V.file = s.file; V.blobURL = s.blobURL; V.saved = s.saved; V.isText = s.isText; V.isHTML = s.isHTML;
      if (s.view === 'text') NT.renderTextView(NT.savedText());
      else if (s.view === 'empty') NT.showEmpty();
      else previewArea.innerHTML = s.html;
      NT.setStatus(s.left, s.right); urlInput.value = s.url;
      NT.updateActions(NT.hasContent());
    }
    updateStar();
  }
  function renderTabs() {
    tabStrip.innerHTML = '';
    tabs.forEach(function (t, i) {
      var d = document.createElement('div');
      d.className = 'tab' + (t.id === activeId ? ' active' : '');
      d.setAttribute('role', 'tab'); d.tabIndex = 0;
      d.setAttribute('aria-selected', t.id === activeId ? 'true' : 'false');
      d.setAttribute('data-testid', 'tab-' + t.id);
      d.title = t.title + ' (Alt+' + (i + 1) + ')';
      d.innerHTML = '<span class="t"></span><button class="x" type="button" aria-label="Close tab" title="Close tab">' + ic('x') + '</button>';
      d.querySelector('.t').textContent = t.title;
      d.addEventListener('click', function (e) { if (e.target.closest('.x')) closeTab(t.id); else activateTab(t.id); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTab(t.id); } });
      d.addEventListener('auxclick', function (e) { if (e.button === 1) closeTab(t.id); });
      tabStrip.appendChild(d);
    });
    var a = tabStrip.querySelector('.tab.active'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function activateTab(id) {
    if (id === activeId) return;
    snapshot(activeTab());
    activeId = id; restore(activeTab()); renderTabs();
  }
  function newTab(silent) {
    if (tabs.length >= MAX_TABS) { toast('Tab limit reached (' + MAX_TABS + ')', 'error'); return; }
    var t = { id: uid(), title: 'New tab', snap: null };
    if (activeId) snapshot(activeTab());
    tabs.push(t); activeId = t.id;
    if (!silent) restore(t);
    renderTabs();
    if (!silent) urlInput.focus();
  }
  function closeTab(id) {
    var i = tabs.findIndex(function (t) { return t.id === id; });
    if (i < 0) return;
    var t = tabs[i];
    var blob = id === activeId ? V.blobURL : (t.snap && t.snap.blobURL);
    try { if (blob && !/^https?:/i.test(blob)) URL.revokeObjectURL(blob); } catch (e) {}
    if (id === activeId) V.blobURL = null;
    tabs.splice(i, 1);
    if (!tabs.length) { activeId = null; newTab(true); restore(activeTab()); renderTabs(); return; }
    if (id === activeId) { activeId = tabs[Math.max(0, i - 1)].id; restore(activeTab()); }
    renderTabs();
  }
  function cycleTab(d) {
    if (tabs.length < 2) return;
    var i = tabs.findIndex(function (t) { return t.id === activeId; });
    activateTab(tabs[(i + d + tabs.length) % tabs.length].id);
  }
  NT.onContentChanged = function (title) { var t = activeTab(); if (t) { t.title = (title || 'New tab').slice(0, 40); renderTabs(); } };
  NT.onUrlLoaded = function (u) { addRecent(u); NT.onContentChanged(hostOf(u)); updateStar(); };
  el('newTabBtn').addEventListener('click', function () { newTab(); });

  // =====================================================
  // (7) Find + highlight   (8) live counts
  // =====================================================
  var findBar = el('findBar'), findInput = el('findInput'), findCountEl = el('findCount');
  var marks = [], taHits = [], findIdx = -1;
  function findOpen() { return !findBar.classList.contains('hidden'); }
  function textViewEl() { return previewArea.querySelector('#textView'); }
  function findClear() {
    var pre = textViewEl();
    if (marks.length && pre) pre.textContent = NT.savedText();
    marks = []; taHits = []; findIdx = -1;
  }
  function setCount() {
    var n = NT.editorOpen() ? taHits.length : marks.length;
    var q = findInput.value;
    findCountEl.textContent = !q ? '0 matches' : (n ? (findIdx + 1) + ' of ' + n : 'No matches');
  }
  function runFind(keep) {
    var q = findInput.value;
    var prev = findIdx;
    findClear();
    if (!q) { setCount(); return; }
    var lq = q.toLowerCase(), text, lower, pos, i;
    if (NT.editorOpen()) {
      text = editorTextarea.value; lower = text.toLowerCase(); pos = 0;
      while ((i = lower.indexOf(lq, pos)) > -1 && taHits.length < 5000) { taHits.push(i); pos = i + lq.length; }
      findIdx = taHits.length ? Math.min(keep ? prev : 0, taHits.length - 1) : -1;
      setCount();
      return;
    }
    var pre = textViewEl();
    if (!pre) { findCountEl.textContent = 'Open a text file to search'; return; }
    text = NT.savedText(); lower = text.toLowerCase(); pos = 0;
    var frag = document.createDocumentFragment(), last = 0;
    while ((i = lower.indexOf(lq, pos)) > -1 && marks.length < 5000) {
      if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
      var m = document.createElement('mark'); m.className = 'hit'; m.textContent = text.slice(i, i + q.length);
      frag.appendChild(m); marks.push(m); last = i + q.length; pos = last;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    pre.textContent = ''; pre.appendChild(frag);
    findIdx = marks.length ? Math.min(keep ? prev : 0, marks.length - 1) : -1;
    focusHit();
  }
  function focusHit() {
    marks.forEach(function (m, i) { m.classList.toggle('cur', i === findIdx); });
    if (findIdx > -1 && marks[findIdx]) marks[findIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
    setCount();
  }
  function findStep(d) {
    var n = NT.editorOpen() ? taHits.length : marks.length;
    if (!n) return;
    findIdx = (findIdx + d + n) % n;
    if (NT.editorOpen()) {
      var s = taHits[findIdx];
      var ta = editorTextarea;
      // keep find box focused; select the match so it is visible
      ta.setSelectionRange(s, s + findInput.value.length);
      var line = ta.value.slice(0, s).split('\n').length;
      ta.scrollTop = Math.max(0, (line - 4) * parseFloat(getComputedStyle(ta).lineHeight || 20));
      setCount();
    } else focusHit();
  }
  function openFind() {
    findBar.classList.remove('hidden');
    findInput.focus(); findInput.select();
    runFind(false);
  }
  function closeFind() { findBar.classList.add('hidden'); findClear(); setCount(); }
  NT.onTextRendered = function () { marks = []; if (findOpen() && findInput.value) runFind(true); NT.updateCounts(); };
  findInput.addEventListener('input', function () { runFind(false); });
  findInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
  });
  el('findNext').addEventListener('click', function () { findStep(1); });
  el('findPrev').addEventListener('click', function () { findStep(-1); });
  el('findClose').addEventListener('click', closeFind);
  el('findBtn').addEventListener('click', function () { findOpen() ? closeFind() : openFind(); });

  function countsFor(text) {
    var t = text.trim();
    return { words: t ? t.split(/\s+/).length : 0, chars: text.length, lines: text ? text.split('\n').length : 0 };
  }
  function fmt(c) { return c.words.toLocaleString() + (c.words === 1 ? ' word' : ' words') + ' \u00b7 ' + c.chars.toLocaleString() + (c.chars === 1 ? ' char' : ' chars'); }
  NT.updateCounts = function () {
    var out = '';
    if (NT.editorOpen()) out = fmt(countsFor(editorTextarea.value));
    else if (textViewEl()) out = fmt(countsFor(NT.savedText()));
    el('statusCounts').textContent = out;
    el('editorCounts').textContent = countsFor(editorTextarea.value).words.toLocaleString() + ' words \u00b7 ' + editorTextarea.value.length.toLocaleString() + ' characters \u00b7 ' + countsFor(editorTextarea.value).lines + ' lines';
  };

  // =====================================================
  // (9) Editor undo / redo
  // =====================================================
  var hist = [], hIdx = 0, hTimer = null, applying = false;
  var undoBtn = el('undoBtn'), redoBtn = el('redoBtn');
  function hState() { return { v: editorTextarea.value, s: editorTextarea.selectionStart }; }
  function hButtons() { undoBtn.disabled = hIdx <= 0 && !hTimer; redoBtn.disabled = hIdx >= hist.length - 1; }
  function hPush() {
    clearTimeout(hTimer); hTimer = null;
    var cur = hState();
    if (hist[hIdx] && hist[hIdx].v === cur.v) { hButtons(); return; }
    hist = hist.slice(0, hIdx + 1); hist.push(cur);
    if (hist.length > 300) hist.shift();
    hIdx = hist.length - 1; hButtons();
  }
  function hApply() {
    var st = hist[hIdx]; applying = true;
    editorTextarea.value = st.v; editorTextarea.setSelectionRange(st.s, st.s);
    applying = false; hButtons(); NT.updateCounts(); if (findOpen()) runFind(true);
    editorTextarea.focus();
  }
  function undo() { if (hTimer) hPush(); if (hIdx > 0) { hIdx--; hApply(); } }
  function redo() { if (hTimer) hPush(); if (hIdx < hist.length - 1) { hIdx++; hApply(); } }
  NT.onEditorOpen = function () { hist = [hState()]; hIdx = 0; clearTimeout(hTimer); hTimer = null; hButtons(); NT.updateCounts(); if (findOpen()) runFind(false); };
  editorTextarea.addEventListener('input', function () {
    if (applying) return;
    NT.updateCounts();
    hButtons();
    clearTimeout(hTimer); hTimer = setTimeout(hPush, 400); hButtons();
    if (findOpen() && findInput.value) runFind(true);
  });
  editorTextarea.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    var k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  // =====================================================
  // (5) Autosaved notes
  // =====================================================
  var notes = el('notesArea'), notesState = el('notesState'), notesT = null;
  notes.value = localStorage.getItem('disguise_notes') || '';
  function notesCount() { var c = countsFor(notes.value); el('notesCounts').textContent = c.words + (c.words === 1 ? ' word' : ' words') + ' \u00b7 ' + c.chars + ' chars'; }
  notesCount();
  notes.addEventListener('input', function () {
    notesState.textContent = 'Saving...'; notesCount();
    clearTimeout(notesT);
    notesT = setTimeout(function () { if (NT.setItem('disguise_notes', notes.value)) notesState.textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 350);
  });
  window.addEventListener('beforeunload', function () { if (notesT) localStorage.setItem('disguise_notes', notes.value); });
  el('notesCopyBtn').addEventListener('click', function () {
    if (!notes.value) { toast('Nothing to copy', 'error'); return; }
    navigator.clipboard.writeText(notes.value).then(function () { toast('Notes copied'); }, function () { toast('Clipboard is blocked by the browser', 'error'); });
  });
  el('notesClearBtn').addEventListener('click', async function () {
    if (!notes.value) return;
    if (!(await confirmDialog('Clear your notes?', 'The notes pad will be emptied. This cannot be undone.', 'Clear notes', true))) return;
    notes.value = ''; localStorage.removeItem('disguise_notes'); notesState.textContent = 'Cleared'; notesCount();
  });
  function focusNotes() { NT.openGroup('grp-notes'); setTimeout(function () { notes.focus(); }, 80); }

  // =====================================================
  // (6) Focus timer
  // =====================================================
  var CIRC = 276.46;
  var tMin = Math.min(180, Math.max(1, parseInt(localStorage.getItem('disguise_timer_minutes') || '25', 10) || 25));
  var tTotal = tMin * 60000, tLeft = tTotal, tEnd = 0, tRun = false, tInt = null;
  var timerBox = el('timerBox'), tDisp = el('timerDisplay'), tRing = el('timerRing'), tLabel = el('timerLabel');
  var tStart = el('timerStartBtn'), tMinInput = el('timerMinutes'), tPill = el('timerPill');
  tMinInput.value = tMin;
  function mmss(ms) { var s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function drawTimer() {
    tDisp.textContent = mmss(tLeft);
    tRing.style.strokeDashoffset = String(CIRC * (1 - tLeft / tTotal));
    el('timerPillText').textContent = mmss(tLeft);
    tPill.classList.toggle('hidden', !(tRun || (tLeft < tTotal && tLeft > 0)));
    tStart.innerHTML = ic(tRun ? 'pause' : 'play') + '<span>' + (tRun ? 'Pause' : (tLeft < tTotal && tLeft > 0 ? 'Resume' : 'Start')) + '</span>';
    tLabel.textContent = tRun ? 'Focusing' : (tLeft <= 0 ? 'Done' : (tLeft < tTotal ? 'Paused' : 'Ready'));
    timerBox.classList.toggle('running', tRun);
  }
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; var c = new AC();
      [660, 880, 1100].forEach(function (f, i) {
        var o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f; o.type = 'sine'; o.connect(g); g.connect(c.destination);
        var t0 = c.currentTime + i * 0.22;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.start(t0); o.stop(t0 + 0.22);
      });
      setTimeout(function () { c.close(); }, 1500);
    } catch (e) {}
  }
  function timerTick() {
    tLeft = Math.max(0, tEnd - Date.now());
    if (tLeft <= 0) {
      tRun = false; clearInterval(tInt); tInt = null; tLeft = 0; drawTimer();
      timerBox.classList.remove('done'); void timerBox.offsetWidth; timerBox.classList.add('done');
      tPill.classList.remove('hidden'); el('timerPillText').textContent = 'Done';
      beep(); toast('Focus session complete. Nice work.');
      NT.setStatus(NT.statusLeft.textContent, 'Focus session complete');
      return;
    }
    drawTimer();
  }
  function timerToggle() {
    if (tRun) { tRun = false; clearInterval(tInt); tInt = null; tLeft = Math.max(0, tEnd - Date.now()); drawTimer(); return; }
    if (tLeft <= 0) tLeft = tTotal;
    timerBox.classList.remove('done');
    tRun = true; tEnd = Date.now() + tLeft; clearInterval(tInt); tInt = setInterval(timerTick, 250); timerTick();
  }
  function timerReset() {
    tRun = false; clearInterval(tInt); tInt = null; tLeft = tTotal; timerBox.classList.remove('done'); drawTimer();
  }
  tMinInput.addEventListener('change', function () {
    var v = parseInt(tMinInput.value, 10);
    if (isNaN(v) || v < 1 || v > 180) { toast('Pick between 1 and 180 minutes', 'error'); tMinInput.value = tMin; return; }
    tMin = v; localStorage.setItem('disguise_timer_minutes', String(v)); tTotal = v * 60000;
    if (!tRun) { tLeft = tTotal; drawTimer(); } else toast('New length applies after reset');
  });
  tStart.addEventListener('click', timerToggle);
  el('timerResetBtn').addEventListener('click', timerReset);
  tPill.addEventListener('click', function () { if (tLeft <= 0) timerReset(); else timerToggle(); });
  drawTimer();

  // =====================================================
  // (10) Shortcuts + (4) Command palette
  // =====================================================
  var MOD = isMac ? 'Cmd' : 'Ctrl';
  var SHORTCUTS = [
    { keys: [MOD, 'K'], desc: 'Open command palette' },
    { keys: ['Alt', 'T'], desc: 'New viewer tab' },
    { keys: ['Alt', 'W'], desc: 'Close current tab' },
    { keys: ['Alt', '[ / ]'], desc: 'Previous / next tab' },
    { keys: ['Alt', '1-9'], desc: 'Jump to tab number' },
    { keys: ['Alt', 'O'], desc: 'Open a local file' },
    { keys: ['Alt', 'L'], desc: 'Focus the address bar' },
    { keys: ['Alt', 'B'], desc: 'Bookmark / unbookmark address' },
    { keys: ['Alt', 'S'], desc: 'Find in text (Enter / Shift+Enter to step)' },
    { keys: ['Alt', 'X'], desc: 'Edit text' },
    { keys: [MOD, 'Z'], desc: 'Undo in editor (add Shift to redo)' },
    { keys: [MOD, 'S'], desc: 'Save changes in editor' },
    { keys: ['Alt', 'N'], desc: 'Jump to notes' },
    { keys: ['Alt', 'P'], desc: 'Start / pause focus timer' },
    { keys: ['Alt', 'Z'], desc: 'Toggle focus mode' },
    { keys: ['Alt', 'M'], desc: 'Show / hide sidebar' },
    { keys: ['?'], desc: 'Show this help (outside text fields)' },
    { keys: ['Esc'], desc: 'Close dialogs, find bar and editor' },
    { keys: ['Esc', 'x4'], desc: 'Panic redirect' }
  ];
  var helpModal = el('helpModal');
  function buildHelp() {
    var box = el('helpList'); box.innerHTML = '';
    SHORTCUTS.forEach(function (s) {
      var r = document.createElement('div'); r.className = 'help-row';
      r.innerHTML = '<span></span><span class="keys"></span>';
      r.firstChild.textContent = s.desc;
      s.keys.forEach(function (k) { var kb = document.createElement('kbd'); kb.textContent = k; r.lastChild.appendChild(kb); });
      box.appendChild(r);
    });
  }
  buildHelp();
  function openHelp() { closePalette(); helpModal.classList.remove('hidden'); el('helpClose').focus(); }
  function closeHelp() { helpModal.classList.add('hidden'); }
  el('helpBtn').addEventListener('click', openHelp);
  el('helpOpenBtn').addEventListener('click', openHelp);
  el('helpClose').addEventListener('click', closeHelp);
  helpModal.addEventListener('mousedown', function (e) { if (e.target === helpModal) closeHelp(); });

  function C(label, icon, run, kb, kw) { return { label: label, icon: icon, run: run, kb: kb || [], kw: kw || '' }; }
  function commands() {
    var list = [
      C('Open a local file', 'file', NT.pickFile, ['Alt', 'O'], 'upload browse'),
      C('Focus address bar', 'globe', function () { urlInput.focus(); urlInput.select(); }, ['Alt', 'L'], 'url web load'),
      C('New viewer tab', 'plus', function () { newTab(); }, ['Alt', 'T']),
      C('Close current tab', 'x', function () { closeTab(activeId); }, ['Alt', 'W']),
      C('Next tab', 'chevronDown', function () { cycleTab(1); }, ['Alt', ']']),
      C('Previous tab', 'chevronUp', function () { cycleTab(-1); }, ['Alt', '[']),
      C('Bookmark current address', 'star', toggleCurrentBookmark, ['Alt', 'B'], 'favorite'),
      C('Find in text', 'search', openFind, ['Alt', 'S'], 'search highlight'),
      C('Edit text', 'edit', function () { if (V.saved || V.isText) NT.openEditor(); else toast('Open a text file first', 'error'); }, ['Alt', 'X']),
      C('Render as HTML', 'code', NT.renderHere, [], 'preview'),
      C('Copy text', 'copy', NT.copyText),
      C('Download file', 'download', NT.download),
      C('Open in about:blank', 'window', NT.openBlank, [], 'cloak'),
      C('Refresh viewer', 'refresh', NT.refresh),
      C('Toggle fullscreen', 'maximize', NT.toggleFullscreen),
      C('Toggle focus mode', 'eye', NT.toggleFocus, ['Alt', 'Z']),
      C('Show or hide toolbar', 'sliders', NT.toggleToolbar),
      C('Increase font size', 'type', function () { NT.fontStep(2); }, [], 'bigger larger'),
      C('Decrease font size', 'type', function () { NT.fontStep(-2); }, [], 'smaller'),
      C('Toggle sidebar', 'panel', NT.toggleSidebar, ['Alt', 'M']),
      C('Jump to notes', 'note', focusNotes, ['Alt', 'N'], 'write'),
      C(tRun ? 'Pause focus timer' : 'Start focus timer', 'timer', timerToggle, ['Alt', 'P'], 'pomodoro'),
      C('Reset focus timer', 'refresh', timerReset),
      C('Open bookmarks panel', 'bookmark', function () { NT.openGroup('grp-bookmarks'); }),
      C('Open recent pages panel', 'history', function () { NT.openGroup('grp-recents'); }),
      C('Change colors', 'palette', function () { NT.openGroup('grp-appearance'); }, [], 'appearance accent background'),
      C('Open panic settings', 'alert', function () { NT.openGroup('grp-panic'); }),
      C('Claim daily reward', 'gem', NT.claimDaily, [], 'points streak'),
      C('Export configuration', 'download', NT.exportConfig, [], 'backup'),
      C('Keyboard shortcuts', 'keyboard', openHelp, ['?']),
      C('Reset all settings', 'trash', NT.resetAll, [], 'delete clear')
    ];
    bookmarks.forEach(function (b) { var c = C('Open: ' + b.title, 'star', function () { NT.openUrl(b.url); }, [], 'bookmark ' + b.url); c.sub = hostOf(b.url); list.push(c); });
    recents.slice(0, 5).forEach(function (r) { var c = C('Open: ' + hostOf(r.url), 'history', function () { NT.openUrl(r.url); }, [], 'recent ' + r.url); c.sub = 'recent'; list.push(c); });
    return list;
  }
  var pal = el('palette'), palInput = el('paletteInput'), palList = el('paletteList'), palItems = [], palIdx = 0;
  function palOpen() { return !pal.classList.contains('hidden'); }
  function renderPalette() {
    var q = palInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    palItems = commands().filter(function (c) { var hay = (c.label + ' ' + c.kw).toLowerCase(); return q.every(function (w) { return hay.indexOf(w) > -1; }); });
    palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
    palList.innerHTML = '';
    if (!palItems.length) { palList.innerHTML = '<div class="pal-empty">No matching commands</div>'; return; }
    palItems.forEach(function (c, i) {
      var d = document.createElement('div');
      d.className = 'pal-item' + (i === palIdx ? ' act' : ''); d.setAttribute('role', 'option');
      d.setAttribute('data-testid', 'command-' + i);
      d.innerHTML = ic(c.icon) + '<span></span><span class="kb"></span>';
      d.children[1].textContent = c.label;
      if (c.sub) { var s = document.createElement('span'); s.className = 'sub'; s.textContent = c.sub; d.children[1].appendChild(s); }
      c.kb.forEach(function (k) { var kb = document.createElement('kbd'); kb.textContent = k; d.lastChild.appendChild(kb); });
      d.addEventListener('mousemove', function () { if (palIdx !== i) { palIdx = i; markAct(); } });
      d.addEventListener('click', function () { runPal(i); });
      palList.appendChild(d);
    });
  }
  function markAct() {
    var n = palList.children;
    for (var i = 0; i < n.length; i++) n[i].classList.toggle('act', i === palIdx);
    if (n[palIdx] && n[palIdx].scrollIntoView) n[palIdx].scrollIntoView({ block: 'nearest' });
  }
  function runPal(i) { var c = palItems[i]; if (!c) return; closePalette(); setTimeout(function () { c.run && c.run(); }, 30); }
  function openPalette() { closeHelp(); pal.classList.remove('hidden'); palInput.value = ''; palIdx = 0; renderPalette(); palInput.focus(); }
  function closePalette() { pal.classList.add('hidden'); }
  NT.openPalette = openPalette;
  palInput.addEventListener('input', function () { palIdx = 0; renderPalette(); });
  palInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = (palIdx + 1) % Math.max(1, palItems.length); markAct(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = (palIdx - 1 + palItems.length) % Math.max(1, palItems.length); markAct(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPal(palIdx); }
  });
  pal.addEventListener('mousedown', function (e) { if (e.target === pal) closePalette(); });
  el('paletteBtn').addEventListener('click', openPalette);

  document.addEventListener('keydown', function (e) {
    if (NT.confirmOpen) return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); palOpen() ? closePalette() : openPalette(); return; }
    if (e.key === 'Escape') {
      if (palOpen()) { e.preventDefault(); e.stopPropagation(); closePalette(); return; }
      if (!helpModal.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); closeHelp(); return; }
      if (findOpen()) { e.preventDefault(); e.stopPropagation(); closeFind(); return; }
      if (!suggest.classList.contains('hidden')) { suggest.classList.add('hidden'); e.stopPropagation(); return; }
      return;
    }
    if (palOpen()) return;
    if (e.key === '?' && !mod && !e.altKey && !NT.isTyping()) { e.preventDefault(); openHelp(); return; }
    if (!e.altKey || mod) return;
    var handled = true, c = e.code;
    if (c === 'KeyT') newTab();
    else if (c === 'KeyW') closeTab(activeId);
    else if (c === 'BracketRight') cycleTab(1);
    else if (c === 'BracketLeft') cycleTab(-1);
    else if (/^Digit[1-9]$/.test(c)) { var t = tabs[parseInt(c.slice(5), 10) - 1]; if (t) activateTab(t.id); }
    else if (c === 'KeyO') NT.pickFile();
    else if (c === 'KeyL') { urlInput.focus(); urlInput.select(); }
    else if (c === 'KeyB') toggleCurrentBookmark();
    else if (c === 'KeyS') openFind();
    else if (c === 'KeyX') { if (V.saved || V.isText) NT.openEditor(); else toast('Open a text file first', 'error'); }
    else if (c === 'KeyN') focusNotes();
    else if (c === 'KeyP') timerToggle();
    else if (c === 'KeyZ') NT.toggleFocus();
    else if (c === 'KeyM') NT.toggleSidebar();
    else if (c === 'Slash') openHelp();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ---------- boot ----------
  renderBookmarks(); renderRecents(); updateStar();
  newTab(true);
  window.NT_boot();
  renderTabs();
})();
