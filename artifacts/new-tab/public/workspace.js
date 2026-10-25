/* New Tab workspace core: viewer, privacy, tools, rewards, config.
   Evolved in place from the original single-file script. All storage keys keep the disguise_ prefix. */
(function () {
  'use strict';
  var NT = window.NT;
  var ic = NT.ic, toast = NT.toast, confirmDialog = NT.confirmDialog, safeUrl = NT.safeUrl, escapeHTML = NT.escapeHTML;

  // ==========================================
  // CONFIGURATION SETTINGS
  // ==========================================
  const CONFIG = {
    DAILY_REWARD_AMOUNT: 150,
    BONUS_REWARD_AMOUNT: 50,
    BONUS_INTERVAL_MINUTES: 10,
    SHARD_INTERVAL_MS: 1 * 60 * 1000,
    MAX_AWAY_TIME_MS: 3 * 60 * 60 * 1000,
    SHARDS_PER_SECOND: 1
  };
  const DEFAULT_COLORS = { accent: '#d4451f', bg: '#f2ebdd', panel: '#fbf7ee', text: '#25211b' };
  const COLOR_LABELS = { accent: 'Accent', bg: 'Background', panel: 'Panel', text: 'Text' };
  const DEFAULT_FONT = "'Bricolage Grotesque', system-ui, -apple-system, sans-serif";

  const el = id => document.getElementById(id);
  // The workspace runs in a same-origin iframe; tab title / favicon / history belong to the top window.
  const TOP = (function () { try { void window.top.document.title; return window.top; } catch (e) { return window; } })();

  const app = el('app');
  const previewArea = el('previewArea'), fileInput = el('fileInput');
  const urlInput = el('urlInput'), loadUrlBtn = el('loadUrlBtn');
  const iframeWarning = el('iframeWarning');
  const fileActions = el('fileActions');
  const saveFileBtn = el('saveFileBtn'), downloadBtn = el('downloadBtn');
  const openBlankBtn = el('openBlankBtn'), openHereBtn = el('openHereBtn');
  const editBtn = el('editBtn'), copyBtn = el('copyBtn');
  const clearFileBtn = el('clearFileBtn'), toggleButtonsBtn = el('toggleButtonsBtn');
  const refreshBtn = el('refreshBtn'), fullscreenBtn = el('fullscreenBtn'), focusModeBtn = el('focusModeBtn');
  const editorPanel = el('editorPanel'), editorTextarea = el('editorTextarea');
  const saveEditBtn = el('saveEditBtn'), cancelEditBtn = el('cancelEditBtn');
  const titleInput = el('titleInput'), applyTitleBtn = el('applyTitleBtn');
  const imageInput = el('imageInput'), base64FaviconInput = el('base64FaviconInput');
  const applyBase64Btn = el('applyBase64Btn'), imagePreview = el('imagePreview'), clearFaviconBtn = el('clearFaviconBtn');
  const gameB64Input = el('gameB64Input'), loadGameBtn = el('loadGameBtn'), clearGameBtn = el('clearGameBtn');
  const gameWrapper = el('gameWrapper'), gameFrame = el('gameFrame');
  const panicLink = el('panicLink'), panicBtn = el('panicBtn'), panicHotkey = el('panicHotkey');
  const idleTimer = el('idleTimer'), presetSelect = el('presetSelect');
  const opacitySlider = el('opacitySlider'), opacityVal = el('opacityVal');
  const fontIncBtn = el('fontIncBtn'), fontDecBtn = el('fontDecBtn');
  const cloakPathInput = el('cloakPathInput'), cloakUrlBtn = el('cloakUrlBtn'), resetUrlBtn = el('resetUrlBtn');
  const exportBtn = el('exportBtn'), importConfig = el('importConfig'), resetAllBtn = el('resetAllBtn');
  const statusLeft = el('statusLeft'), statusRight = el('statusRight'), clockDisplay = el('clockDisplay');
  const pointsDisplay = el('pointsDisplay'), shardsDisplay = el('shardsDisplay'), shardTimerDisplay = el('shardTimerDisplay'), streakDisplay = el('streakDisplay'), claimRewardBtn = el('claimRewardBtn');
  const claimTimedBtn = el('claimTimedBtn'), shopContainer = el('shopContainer');
  const b64ToolInput = el('b64ToolInput'), b64ToolOutput = el('b64ToolOutput');
  const b64EncodeBtn = el('b64EncodeBtn'), b64DecodeBtn = el('b64DecodeBtn');
  const calcDisplay = el('calcDisplay');
  const fontSelect = el('fontSelect'), customFontInput = el('customFontInput'), addFontBtn = el('addFontBtn');
  const blankTitleInput = el('blankTitleInput'), applyBlankTitleBtn = el('applyBlankTitleBtn');
  const fontSystemLock = el('fontSystemLock'), fontSystemBody = el('fontSystemBody'), unlockFontsBtn = el('unlockFontsBtn');
  const calcLock = el('calcLock'), calcBody = el('calcBody'), unlockCalcBtn = el('unlockCalcBtn');
  const disguiseLock = el('disguiseLock'), disguiseBody = el('disguiseBody'), unlockDisguiseBtn = el('unlockDisguiseBtn');

  NT.hydrateIcons(document);
  NT.hydrateIcons(el('emptyTpl').content);

  // State (viewer state lives on NT.V so tabs can snapshot it)
  const V = (NT.V = { file: null, blobURL: null, saved: null, isText: false, isHTML: false });
  let currentGameBlobURL = null;
  let fontSize = 14;
  let idleTimeoutId = null, cursorTimeoutId = null;
  let optionsHidden = localStorage.getItem('disguise_options_hidden') === 'true';
  let customFonts = NT.getJSON('disguise_custom_fonts', []);
  if (!Array.isArray(customFonts)) customFonts = [];
  let calcExpr = '0', calcResetOnNext = false;

  const num = (k, d) => { const n = parseInt(localStorage.getItem(k) || '', 10); return isNaN(n) ? d : n; };
  let points = num('disguise_points', 0);
  let shards = num('disguise_shards', 0);
  let lastShardTime = num('disguise_last_shard_time', Date.now());
  let streak = num('disguise_streak', 0);
  let lastClaim = localStorage.getItem('disguise_last_claim');
  let lastTimedClaim = num('disguise_last_timed_claim', 0);
  let unlockedItems = NT.getJSON('disguise_unlocked', []);
  if (!Array.isArray(unlockedItems)) unlockedItems = [];

  // Shop: tools you can unlock (themes were removed; colors are free)
  const FEATURES = [
    { id: 'feature_calc', name: 'Calculator', cost: 50, currency: 'pts' },
    { id: 'feature_fonts', name: 'Font system', cost: 200, currency: 'pts' },
    { id: 'feature_disguise', name: 'Tab disguiser', cost: 175, currency: 'pts' },
    { id: 'feature_download', name: 'File downloads', cost: 30, currency: 'pts' },
    { id: 'feature_about_blank', name: 'about:blank launcher', cost: 10, currency: 'shards' }
  ];

  function flash(btn, msg) {
    if (btn._flashing) return;
    const old = btn.innerHTML;
    btn._flashing = true;
    btn.textContent = msg;
    setTimeout(() => { btn.innerHTML = old; btn._flashing = false; }, 1200);
  }
  function bytesToSize(b) {
    if (!b) return '';
    const s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + s[i];
  }
  function setStatus(l, r) { statusLeft.textContent = l || 'No source'; statusRight.textContent = r || 'Not saved'; }
  function b64EncodeUnicode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64DecodeUnicode(str) { try { return decodeURIComponent(escape(atob(str))); } catch (e) { return ''; } }
  function revokeCurrent() {
    try { if (V.blobURL && !/^https?:/i.test(V.blobURL)) { URL.revokeObjectURL(V.blobURL); } } catch (e) {}
    V.blobURL = null;
  }
  function saveConfigKey(key, val) { return NT.setItem(key, val); }
  function savedText() { return V.saved ? b64DecodeUnicode(V.saved) : ''; }
  function hasContent() { return !!(V.file || V.blobURL || V.saved); }

  function sandboxFor(url) {
    // Never grant allow-same-origin for our own origin, so loaded content can't touch our storage.
    let cross = true;
    try { cross = new URL(url, location.href).origin !== location.origin; } catch (e) {}
    return 'allow-scripts allow-forms allow-popups allow-pointer-lock' + (cross ? ' allow-same-origin' : '');
  }
  function makeFrame(src, sandbox, title) {
    previewArea.innerHTML = '';
    const f = document.createElement('iframe');
    if (sandbox != null) f.setAttribute('sandbox', sandbox);
    f.setAttribute('title', title || 'Viewer');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.src = src;
    previewArea.appendChild(f);
    return f;
  }
  function renderTextView(text) {
    previewArea.innerHTML = '';
    const pre = document.createElement('pre');
    pre.id = 'textView';
    pre.textContent = text;
    previewArea.appendChild(pre);
    if (NT.onTextRendered) NT.onTextRendered();
  }
  function showEmpty() {
    previewArea.innerHTML = '';
    previewArea.appendChild(el('emptyTpl').content.cloneNode(true));
    const q = s => previewArea.querySelector(s);
    q('[data-act=open-file]').onclick = () => fileInput.click();
    q('[data-act=focus-url]').onclick = () => urlInput.focus();
    q('[data-act=palette]').onclick = () => NT.openPalette && NT.openPalette();
    if (NT.afterEmpty) NT.afterEmpty();
  }
  function updateActions(has) {
    if (optionsHidden) fileActions.classList.add('hidden');
    else fileActions.classList.toggle('hidden', !has);
    saveFileBtn.classList.toggle('hidden', !V.saved);
    editBtn.classList.toggle('hidden', !(V.isText || V.saved));
    openHereBtn.classList.toggle('hidden', !(V.isText || V.saved || V.blobURL));
    fontIncBtn.classList.toggle('hidden', !(V.isText || V.saved));
    fontDecBtn.classList.toggle('hidden', !(V.isText || V.saved));
    if (NT.updateCounts) NT.updateCounts();
  }
  NT.showEmpty = showEmpty; NT.updateActions = updateActions; NT.hasContent = hasContent;
  NT.setStatus = setStatus; NT.statusLeft = statusLeft; NT.statusRight = statusRight;
  NT.renderTextView = renderTextView; NT.savedText = savedText; NT.revokeCurrent = revokeCurrent;
  NT.editorOpen = () => !editorPanel.classList.contains('hidden');
  NT.closeEditor = () => editorPanel.classList.add('hidden');

  // ---------- Fonts ----------
  function applyFont(fontVal) { document.documentElement.style.setProperty('--main-font', fontVal); saveConfigKey('disguise_main_font', fontVal); }
  function loadGoogleFont(fontName) {
    const safe = fontName.replace(/[^A-Za-z0-9 ]/g, '');
    if (!safe) return;
    const linkId = 'font-' + safe.replace(/\s+/g, '-').toLowerCase();
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + safe.replace(/\s+/g, '+') + '&display=swap';
      document.head.appendChild(link);
    }
  }
  function addFontOption(fontName) {
    const fontVal = "'" + fontName + "', sans-serif";
    const opt = document.createElement('option');
    opt.value = fontVal; opt.textContent = fontName;
    fontSelect.appendChild(opt);
    return fontVal;
  }
  fontSelect.addEventListener('change', e => applyFont(e.target.value));
  addFontBtn.addEventListener('click', () => {
    const fontName = customFontInput.value.trim().replace(/[^A-Za-z0-9 ]/g, '');
    if (!fontName) { toast('Use letters, numbers and spaces only', 'error'); return; }
    if (!customFonts.includes(fontName)) {
      customFonts.push(fontName);
      NT.setJSON('disguise_custom_fonts', customFonts);
      loadGoogleFont(fontName);
      const fontVal = addFontOption(fontName);
      fontSelect.value = fontVal;
      applyFont(fontVal);
      flash(addFontBtn, 'Added');
    } else flash(addFontBtn, 'Exists');
    customFontInput.value = '';
  });

  // ---------- Custom colors (replaces named themes) ----------
  const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  function normHex(v) {
    const m = HEX_RE.exec(String(v || '').trim());
    if (!m) return null;
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return '#' + h;
  }
  function lum(hex) {
    const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  let colors = Object.assign({}, DEFAULT_COLORS);
  function applyColors() {
    const r = document.documentElement.style;
    r.setProperty('--accent', colors.accent);
    r.setProperty('--bg', colors.bg);
    r.setProperty('--panel', colors.panel);
    r.setProperty('--text', colors.text);
    r.setProperty('--on-accent', contrast(colors.accent, '#ffffff') >= contrast(colors.accent, '#1a1612') ? '#ffffff' : '#1a1612');
    r.colorScheme = lum(colors.bg) < 0.3 ? 'dark' : 'light';
    const ratio = contrast(colors.text, colors.bg);
    const hint = el('colorHint');
    hint.className = 'small' + (ratio < 4.5 ? ' bad' : '');
    hint.textContent = 'Text contrast ' + ratio.toFixed(1) + ':1' + (ratio < 4.5 ? ' (hard to read, try more contrast)' : '');
  }
  function syncColorInputs() {
    Object.keys(DEFAULT_COLORS).forEach(k => { el('color_' + k).value = colors[k]; el('hex_' + k).value = colors[k]; el('hex_' + k).classList.remove('invalid'); });
  }
  function sanitizeColors(obj) {
    const out = Object.assign({}, DEFAULT_COLORS);
    if (obj && typeof obj === 'object') Object.keys(DEFAULT_COLORS).forEach(k => { const h = normHex(obj[k]); if (h) out[k] = h; });
    return out;
  }
  NT.sanitizeColorsJSON = function (raw) { try { return JSON.stringify(sanitizeColors(JSON.parse(raw))); } catch (e) { return null; } };
  Object.keys(DEFAULT_COLORS).forEach(k => {
    const picker = el('color_' + k), hex = el('hex_' + k);
    picker.addEventListener('input', () => { colors[k] = picker.value; hex.value = picker.value; hex.classList.remove('invalid'); applyColors(); NT.setJSON('disguise_colors', colors); });
    hex.addEventListener('input', () => {
      const h = normHex(hex.value);
      if (!h) { hex.classList.add('invalid'); const hint = el('colorHint'); hint.className = 'small bad'; hint.textContent = COLOR_LABELS[k] + ': enter a hex like #d4451f'; return; }
      hex.classList.remove('invalid'); colors[k] = h; picker.value = h; applyColors(); NT.setJSON('disguise_colors', colors);
    });
    hex.addEventListener('blur', () => { hex.value = colors[k]; hex.classList.remove('invalid'); applyColors(); });
  });
  el('resetColorsBtn').addEventListener('click', () => {
    colors = Object.assign({}, DEFAULT_COLORS); syncColorInputs(); applyColors();
    localStorage.removeItem('disguise_colors'); toast('Default colors restored');
  });
  NT.getColors = () => Object.assign({}, colors);

  // ---------- Gating / unlocks ----------
  const isFeatureUnlocked = id => unlockedItems.includes(id);
  function refreshPaywallUI() {
    calcLock.classList.toggle('hidden', isFeatureUnlocked('feature_calc'));
    calcBody.classList.toggle('hidden', !isFeatureUnlocked('feature_calc'));
    disguiseLock.classList.toggle('hidden', isFeatureUnlocked('feature_disguise'));
    disguiseBody.classList.toggle('hidden', !isFeatureUnlocked('feature_disguise'));
    fontSystemLock.classList.toggle('hidden', isFeatureUnlocked('feature_fonts'));
    fontSystemBody.classList.toggle('hidden', !isFeatureUnlocked('feature_fonts'));
  }
  function unlockFeature(id) {
    const f = FEATURES.find(x => x.id === id);
    if (!f || isFeatureUnlocked(id)) return true;
    const bal = f.currency === 'pts' ? points : shards;
    if (bal < f.cost) { toast('You need ' + f.cost + ' ' + (f.currency === 'pts' ? 'points' : 'shards') + ' to unlock ' + f.name, 'error'); return false; }
    if (f.currency === 'pts') { points -= f.cost; localStorage.setItem('disguise_points', points); }
    else { shards -= f.cost; localStorage.setItem('disguise_shards', shards); }
    unlockedItems.push(id);
    NT.setJSON('disguise_unlocked', unlockedItems);
    updateRewardsUI(); refreshPaywallUI();
    toast(f.name + ' unlocked');
    return true;
  }
  unlockCalcBtn.addEventListener('click', () => unlockFeature('feature_calc'));
  unlockDisguiseBtn.addEventListener('click', () => unlockFeature('feature_disguise'));
  unlockFontsBtn.addEventListener('click', () => unlockFeature('feature_fonts'));
  async function requireFeature(id, prompt) {
    if (isFeatureUnlocked(id)) return true;
    const f = FEATURES.find(x => x.id === id);
    const bal = f.currency === 'pts' ? points : shards;
    if (bal < f.cost) { toast('You need ' + f.cost + ' ' + (f.currency === 'pts' ? 'points' : 'shards') + ' for this. Try the free unlock in Settings.', 'error'); return false; }
    if (!(await confirmDialog('Unlock ' + f.name + '?', prompt, 'Unlock'))) return false;
    return unlockFeature(id);
  }

  // ---------- Offline / passive shards ----------
  function processOfflineShards() {
    const now = Date.now();
    const last = parseInt(localStorage.getItem('disguise_last_active_time') || now.toString(), 10);
    const timeAway = now - last;
    if (timeAway > 2000) {
      const earned = Math.floor(Math.min(timeAway, CONFIG.MAX_AWAY_TIME_MS) / 1000) * CONFIG.SHARDS_PER_SECOND;
      if (earned > 0) {
        shards += earned;
        localStorage.setItem('disguise_shards', shards);
        toast('+' + earned + ' offline shards' + (timeAway > CONFIG.MAX_AWAY_TIME_MS ? ' (3 hour max)' : ''));
        renderShop();
        shardsDisplay.textContent = shards;
      }
    }
    updateLastActiveTime();
  }
  function updateLastActiveTime() { localStorage.setItem('disguise_last_active_time', Date.now()); }
  setInterval(updateLastActiveTime, 10000);

  // ---------- Mini game (sandboxed: no allow-same-origin) ----------
  function renderGame(b64Str) {
    const htmlStr = b64DecodeUnicode(b64Str.trim());
    if (!htmlStr) { toast('That is not a valid Base64 HTML string', 'error'); return false; }
    if (currentGameBlobURL) URL.revokeObjectURL(currentGameBlobURL);
    currentGameBlobURL = URL.createObjectURL(new Blob([htmlStr], { type: 'text/html' }));
    gameFrame.src = currentGameBlobURL;
    gameWrapper.style.display = 'block';
    return true;
  }
  loadGameBtn.addEventListener('click', () => {
    const val = gameB64Input.value.trim();
    if (!val) return;
    if (renderGame(val)) { saveConfigKey('disguise_minigame_b64', val); flash(loadGameBtn, 'Saved & loaded'); }
  });
  clearGameBtn.addEventListener('click', () => {
    localStorage.removeItem('disguise_minigame_b64');
    gameB64Input.value = '';
    gameFrame.src = 'about:blank';
    gameWrapper.style.display = 'none';
    if (currentGameBlobURL) URL.revokeObjectURL(currentGameBlobURL);
    currentGameBlobURL = null;
  });

  // ---------- Focus mode ----------
  function setFocus(on) {
    const isFocused = app.classList.toggle('focus-mode', on);
    focusModeBtn.innerHTML = ic(isFocused ? 'x' : 'eye') + '<span>' + (isFocused ? 'Exit focus' : 'Focus') + '</span>';
    focusModeBtn.classList.toggle('primary', isFocused);
  }
  focusModeBtn.addEventListener('click', () => setFocus());
  NT.toggleFocus = () => setFocus();

  // ---------- Settings load ----------
  function loadSettings() {
    const s = localStorage;
    customFonts.forEach(font => { loadGoogleFont(font); addFontOption(font); });
    if (s.getItem('disguise_main_font')) {
      applyFont(s.getItem('disguise_main_font'));
      fontSelect.value = s.getItem('disguise_main_font');
    }
    colors = sanitizeColors(NT.getJSON('disguise_colors', null));
    syncColorInputs(); applyColors();

    if (s.getItem('disguise_blank_title')) blankTitleInput.value = s.getItem('disguise_blank_title');
    if (s.getItem('disguise_title')) { TOP.document.title = s.getItem('disguise_title'); titleInput.value = s.getItem('disguise_title'); }
    if (s.getItem('disguise_favicon')) {
      const fav = s.getItem('disguise_favicon');
      setFavicon(fav); showImagePreview(fav); base64FaviconInput.value = fav;
    }
    if (s.getItem('disguise_paniclink')) panicLink.value = s.getItem('disguise_paniclink');
    if (s.getItem('disguise_hotkey')) panicHotkey.value = s.getItem('disguise_hotkey');
    if (s.getItem('disguise_idle')) idleTimer.value = s.getItem('disguise_idle');
    if (s.getItem('disguise_minigame_b64')) { const g = s.getItem('disguise_minigame_b64'); gameB64Input.value = g; renderGame(g); }

    refreshPaywallUI();
    if (s.getItem('disguise_opacity')) { opacitySlider.value = s.getItem('disguise_opacity'); applyOpacity(true); }
    if (s.getItem('disguise_font')) { fontSize = parseInt(s.getItem('disguise_font'), 10) || 14; applyFontSize(true); }

    showEmpty();
    if (s.getItem('disguise_savedfile')) { V.saved = s.getItem('disguise_savedfile'); renderSavedFile(V.saved); }
    else updateActions(false);

    if (optionsHidden) toggleButtonsBtn.textContent = 'Show toolbar';
    setupIdlePanic();
    updateRewardsUI();
    processOfflineShards();
  }
  function renderSavedFile(encoded) {
    if (!encoded) return;
    V.isText = true;
    renderTextView(b64DecodeUnicode(encoded));
    setStatus('Local Storage', 'Saved text');
    updateActions(true);
    if (NT.onContentChanged) NT.onContentChanged('Saved text');
  }

  function updateClock() { clockDisplay.textContent = new Date().toLocaleTimeString(); }
  setInterval(updateClock, 1000); updateClock();

  // ---------- Base64 tool ----------
  b64EncodeBtn.addEventListener('click', () => { b64ToolOutput.value = b64EncodeUnicode(b64ToolInput.value); flash(b64EncodeBtn, 'Encoded'); });
  b64DecodeBtn.addEventListener('click', () => {
    const res = b64DecodeUnicode(b64ToolInput.value.trim());
    b64ToolOutput.value = res || 'Error decoding string';
    flash(b64DecodeBtn, 'Decoded');
  });

  // ---------- Calculator (no eval of arbitrary text) ----------
  document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      if (val === 'C') { calcExpr = '0'; calcResetOnNext = false; }
      else if (val === 'back') { calcExpr = calcExpr.length > 1 && calcExpr !== 'Error' ? calcExpr.slice(0, -1) : '0'; }
      else if (val === '=') {
        try {
          const sanitized = calcExpr.replace(/×/g, '*').replace(/÷/g, '/');
          if (!/^[0-9+\-*/%.()\s]+$/.test(sanitized)) throw new Error('bad');
          const res = Function('"use strict"; return (' + sanitized + ')')();
          if (typeof res !== 'number' || !isFinite(res)) throw new Error('bad');
          calcExpr = String(+res.toFixed(10));
        } catch (e) { calcExpr = 'Error'; }
        calcResetOnNext = true;
      } else if (calcExpr === '0' || calcExpr === 'Error' || calcResetOnNext) {
        calcExpr = ['+', '-', '*', '/', '%'].includes(val) && calcExpr !== 'Error' ? calcExpr + val : val;
        calcResetOnNext = false;
      } else calcExpr += val;
      calcDisplay.textContent = calcExpr;
    });
  });

  // ---------- Favicon ----------
  function showImagePreview(url) {
    imagePreview.innerHTML = '';
    const img = document.createElement('img'); img.src = url; img.alt = 'Favicon preview';
    imagePreview.appendChild(img);
  }
  function setFavicon(url) {
    const d = TOP.document;
    d.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(n => n.remove());
    const l = d.createElement('link'); l.rel = 'icon'; l.href = url;
    d.head.appendChild(l);
  }
  const validIcon = v => /^data:image\//i.test(v) || /^https?:\/\//i.test(v);
  imageInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b = ev.target.result;
      base64FaviconInput.value = b; setFavicon(b); showImagePreview(b); saveConfigKey('disguise_favicon', b);
    };
    reader.readAsDataURL(file);
  });
  applyBase64Btn.addEventListener('click', () => {
    const b = base64FaviconInput.value.trim();
    if (!b) return;
    if (!validIcon(b)) { toast('Favicon must be a data:image/ string or an http(s) URL', 'error'); return; }
    setFavicon(b); showImagePreview(b); saveConfigKey('disguise_favicon', b); flash(applyBase64Btn, 'Set');
  });
  clearFaviconBtn.addEventListener('click', () => {
    TOP.document.querySelectorAll('link[rel="icon"]').forEach(n => n.remove());
    localStorage.removeItem('disguise_favicon');
    base64FaviconInput.value = '';
    imagePreview.innerHTML = '<div class="muted small">No image</div>';
    imageInput.value = '';
  });

  // ---------- Rewards ----------
  function updatePassiveShards() {
    const now = Date.now();
    const gained = Math.floor((now - lastShardTime) / CONFIG.SHARD_INTERVAL_MS);
    if (gained > 0) {
      shards += gained;
      lastShardTime += gained * CONFIG.SHARD_INTERVAL_MS;
      localStorage.setItem('disguise_shards', shards);
      localStorage.setItem('disguise_last_shard_time', lastShardTime);
      renderShop();
    }
    const remaining = CONFIG.SHARD_INTERVAL_MS - ((now - lastShardTime) % CONFIG.SHARD_INTERVAL_MS);
    shardTimerDisplay.textContent = Math.floor(remaining / 60000) + ':' + String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  }
  function updateTimedBonusUI() {
    const remaining = CONFIG.BONUS_INTERVAL_MINUTES * 60 * 1000 - (Date.now() - lastTimedClaim);
    if (remaining <= 0) {
      claimTimedBtn.disabled = false; claimTimedBtn.className = 'btn primary';
      claimTimedBtn.textContent = 'Claim bonus (+' + CONFIG.BONUS_REWARD_AMOUNT + ')';
    } else {
      claimTimedBtn.disabled = true; claimTimedBtn.className = 'btn';
      claimTimedBtn.textContent = 'Bonus in ' + Math.floor(remaining / 60000) + ':' + String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    }
  }
  setInterval(() => { updatePassiveShards(); updateTimedBonusUI(); shardsDisplay.textContent = shards; }, 1000);
  claimTimedBtn.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTimedClaim >= CONFIG.BONUS_INTERVAL_MINUTES * 60 * 1000) {
      points += CONFIG.BONUS_REWARD_AMOUNT; lastTimedClaim = now;
      localStorage.setItem('disguise_points', points);
      localStorage.setItem('disguise_last_timed_claim', lastTimedClaim);
      updateRewardsUI();
      toast('+' + CONFIG.BONUS_REWARD_AMOUNT + ' points');
    }
  });
  function updateRewardsUI() {
    updatePassiveShards();
    pointsDisplay.textContent = points; shardsDisplay.textContent = shards; streakDisplay.textContent = streak;
    if (lastClaim === new Date().toDateString()) { claimRewardBtn.disabled = true; claimRewardBtn.textContent = 'Claimed today'; }
    else { claimRewardBtn.disabled = false; claimRewardBtn.textContent = 'Claim daily (+' + CONFIG.DAILY_REWARD_AMOUNT + ')'; }
    updateTimedBonusUI(); renderShop();
  }
  NT.claimDaily = () => claimRewardBtn.click();
  function renderShop() {
    shopContainer.innerHTML = '';
    FEATURES.forEach(f => {
      const owned = isFeatureUnlocked(f.id);
      const afford = f.currency === 'pts' ? points >= f.cost : shards >= f.cost;
      const d = document.createElement('div');
      d.className = 'shop-item' + (owned ? ' owned' : '');
      const icon = ic(owned ? 'unlock' : f.currency === 'pts' ? 'gem' : 'bolt');
      d.innerHTML = '<div><b></b><span class="cost">' + icon + '<span></span></span></div>';
      d.querySelector('b').textContent = f.name;
      d.querySelector('.cost span').textContent = owned ? 'Unlocked' : f.cost + ' ' + (f.currency === 'pts' ? 'points' : 'shards');
      if (!owned) {
        const b = document.createElement('button');
        b.className = 'btn sm' + (afford ? ' primary' : ''); b.textContent = 'Unlock'; b.disabled = !afford;
        b.addEventListener('click', () => unlockFeature(f.id));
        d.appendChild(b);
      }
      shopContainer.appendChild(d);
    });
  }
  claimRewardBtn.addEventListener('click', () => {
    const today = new Date().toDateString();
    if (lastClaim === today) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    streak = lastClaim === yesterday ? streak + 1 : 1;
    const earned = CONFIG.DAILY_REWARD_AMOUNT + streak * 2;
    points += earned; lastClaim = today;
    localStorage.setItem('disguise_points', points);
    localStorage.setItem('disguise_streak', streak);
    localStorage.setItem('disguise_last_claim', lastClaim);
    updateRewardsUI();
    toast('+' + earned + ' points. ' + streak + ' day streak');
  });

  // ---------- URL viewer ----------
  function loadUrl(raw) {
    const url = safeUrl(raw);
    if (!url) {
      urlInput.classList.add('invalid');
      toast('Enter a valid http or https address', 'error');
      return false;
    }
    urlInput.classList.remove('invalid');
    urlInput.value = url;
    editorPanel.classList.add('hidden');
    revokeCurrent();
    V.blobURL = url; V.isText = false; V.isHTML = false; V.saved = null; V.file = null;
    iframeWarning.classList.add('show');
    setTimeout(() => iframeWarning.classList.remove('show'), 6000);
    makeFrame(url, sandboxFor(url), 'Web page');
    setStatus('Web: ' + url, 'External URL');
    updateActions(true);
    if (NT.onUrlLoaded) NT.onUrlLoaded(url);
    return true;
  }
  NT.openUrl = loadUrl;
  loadUrlBtn.addEventListener('click', () => { if (urlInput.value.trim()) loadUrl(urlInput.value); });
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (urlInput.value.trim()) loadUrl(urlInput.value); } });
  urlInput.addEventListener('input', () => urlInput.classList.remove('invalid'));

  // ---------- Presets ----------
  const presets = {
    nosotros: { title: 'Nosotros Online', favicon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAgVBMVEVHcEwPvMQIxc4Dxc0Bv8gLpKsqKy09NjccytQGxM0BxM0bSk0kHh8pJiczLzAGxs8oISIlICEjHyAnICEsKCkAw8wrJygnISIkHiAGqLAVaGwlHh4mISIvLC0kJSYnIiMqJyckEREkFxggKisRcnYdPkELmaAAy9QQgIYEtL0WW1+YsTbBAAAAI3RSTlMAGDGr+8ZEBQRQ1/vqcA50Vcf/nyn/UHn1/f3TqRndiDL/+s6POb0AAAETSURBVHgBlVFFgsQwDEuZnDZQZqb//284O2mXdTNbEvqAoiroO6iabpjWlyXbcXXDA+x/UVMC3Q0UQhkPv1gZaY6NUMgZjU+rHTfSns/4SQqJf7gXZDkWgVmwshKByHCRqTgDcqiGJaOCh4VrlhyGrQYAi4xJWdkeqoSmvH2vpocqanlK43e1OepRYQD8OmwCPclh1l2fvD6sC7FXCDCME5jPjyW2TzbevMxp8+yrY/nZYsizKNI9bp0lrhKY1i26Ied+TBmXDrZl78169CgmCUDiyytZvkUPbDVNC9k1C6dsXR61Je9ZeSIYF91+H9XHTsgg83gczfaOmugz/AamfEol5idX+lr68oQWC7u/HEb/whVJIRbep5lN3gAAAABJRU5ErkJggg==' },
    mail: { title: 'Inbox (3) - Mail', favicon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHJlY3QgeT0iNCIgeD0iMiIgd2lkdGg9IjIwIiBoZWlnaHQ9IjE2IiBmaWxsPSIjRUE0MzM1IiByeD0iMiIvPjwvc3ZnPg==' },
    sheets: { title: 'Q3 Financials - Sheets', favicon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHJlY3QgeT0iMCIgeD0iMiIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjMzRBODUzIiByeD0iMiIvPjwvc3ZnPg==' }
  };
  presetSelect.addEventListener('change', e => {
    const p = presets[e.target.value];
    if (!p) return;
    TOP.document.title = p.title; titleInput.value = p.title; saveConfigKey('disguise_title', p.title);
    setFavicon(p.favicon); showImagePreview(p.favicon); base64FaviconInput.value = p.favicon; saveConfigKey('disguise_favicon', p.favicon);
    e.target.value = '';
    toast('Disguise applied');
  });

  function applyOpacity(silent) {
    document.body.style.opacity = opacitySlider.value;
    opacityVal.textContent = Math.round(opacitySlider.value * 100) + '%';
    if (silent !== true) saveConfigKey('disguise_opacity', opacitySlider.value);
  }
  opacitySlider.addEventListener('input', () => applyOpacity());

  // ---------- Panic / privacy ----------
  function setupIdlePanic() {
    clearTimeout(idleTimeoutId);
    const ms = parseInt(idleTimer.value, 10) || 0;
    saveConfigKey('disguise_idle', ms);
    if (ms > 0) idleTimeoutId = setTimeout(() => panicBtn.click(), ms);
  }
  idleTimer.addEventListener('change', setupIdlePanic);
  function resetCursor() {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimeoutId);
    cursorTimeoutId = setTimeout(() => document.body.classList.add('hide-cursor'), 3000);
    setupIdlePanic();
  }
  ['mousemove', 'keydown', 'scroll', 'click'].forEach(evt => document.addEventListener(evt, resetCursor));
  applyTitleBtn.addEventListener('click', () => {
    const v = titleInput.value.trim();
    if (v) { TOP.document.title = v; saveConfigKey('disguise_title', v); flash(applyTitleBtn, 'Set'); }
  });
  applyBlankTitleBtn.addEventListener('click', () => {
    saveConfigKey('disguise_blank_title', blankTitleInput.value.trim() || 'New tab');
    flash(applyBlankTitleBtn, 'Set');
  });
  panicLink.addEventListener('change', e => {
    const v = e.target.value.trim();
    if (!v) { localStorage.removeItem('disguise_paniclink'); return; }
    const u = safeUrl(v);
    if (!u) { panicLink.classList.add('invalid'); toast('Panic link must be an http or https address', 'error'); return; }
    panicLink.classList.remove('invalid'); panicLink.value = u; saveConfigKey('disguise_paniclink', u);
  });
  panicHotkey.addEventListener('input', e => saveConfigKey('disguise_hotkey', e.target.value));
  panicBtn.addEventListener('click', () => {
    const dest = safeUrl(panicLink.value) || 'https://google.com';
    TOP.location.replace(dest);
  });
  cloakUrlBtn.addEventListener('click', () => {
    try { TOP.history.replaceState({}, '', cloakPathInput.value.trim() || '?q=search'); flash(cloakUrlBtn, 'Cloaked'); }
    catch (e) { toast('That path cannot be used for cloaking', 'error'); }
  });
  resetUrlBtn.addEventListener('click', () => { try { TOP.history.replaceState({}, '', TOP.location.pathname); } catch (e) {} });

  // ---------- Font size ----------
  function applyFontSize(silent) {
    document.documentElement.style.setProperty('--font-size', fontSize + 'px');
    if (silent !== true) saveConfigKey('disguise_font', fontSize);
  }
  fontIncBtn.addEventListener('click', () => { fontSize = Math.min(48, fontSize + 2); applyFontSize(); });
  fontDecBtn.addEventListener('click', () => { fontSize = Math.max(8, fontSize - 2); applyFontSize(); });
  NT.fontStep = d => { fontSize = Math.max(8, Math.min(48, fontSize + d)); applyFontSize(); };

  // ---------- Refresh / fullscreen ----------
  function refresh() {
    const iframe = previewArea.querySelector('iframe');
    if (V.saved && !(V.blobURL && /^https?:/i.test(V.blobURL))) {
      if (iframe) {
        revokeCurrent();
        V.blobURL = URL.createObjectURL(new Blob([savedText()], { type: 'text/html' }));
        iframe.src = V.blobURL;
      } else renderTextView(savedText());
    } else if (V.blobURL) {
      const t = previewArea.querySelector('img') || iframe;
      if (t) { const src = t.src; t.src = ''; setTimeout(() => { t.src = src; }, 50); }
    }
  }
  NT.refresh = refresh;
  refreshBtn.addEventListener('click', refresh);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (previewArea.requestFullscreen) previewArea.requestFullscreen().catch(() => toast('Fullscreen is not available here', 'error'));
  }
  NT.toggleFullscreen = toggleFullscreen;
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // ---------- Drop / open files ----------
  ['dragover', 'dragenter'].forEach(ev => previewArea.addEventListener(ev, e => { e.preventDefault(); previewArea.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev => previewArea.addEventListener(ev, e => { e.preventDefault(); previewArea.classList.remove('drag-over'); }));
  previewArea.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFileOpen(f); });
  // Whole-page drop too, so the empty state promise ("drop a file anywhere") holds
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && !previewArea.contains(e.target)) handleFileOpen(f); });
  fileInput.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) handleFileOpen(f); fileInput.value = ''; });
  NT.pickFile = () => fileInput.click();

  function handleFileOpen(file) {
    revokeCurrent();
    V.file = file; V.isText = false; V.isHTML = false; V.saved = null;
    editorPanel.classList.add('hidden');
    setStatus(file.name + ' \u2022 ' + bytesToSize(file.size), 'Not saved');
    iframeWarning.classList.remove('show');
    if (NT.onContentChanged) NT.onContentChanged(file.name);
    if (file.type.startsWith('image/')) {
      V.blobURL = URL.createObjectURL(file);
      previewArea.innerHTML = '';
      const img = document.createElement('img'); img.src = V.blobURL; img.alt = file.name;
      previewArea.appendChild(img);
      updateActions(true);
    } else if (file.type.startsWith('text/') || /\.(html?|js|css|json|md|txt|py|java|c|cpp|csv)$/i.test(file.name)) {
      file.text().then(text => {
        V.isText = true; V.isHTML = /\.html?$/i.test(file.name);
        V.saved = b64EncodeUnicode(text);
        renderTextView(text);
        updateActions(true);
      });
    } else {
      V.blobURL = URL.createObjectURL(file);
      makeFrame(V.blobURL, file.type === 'application/pdf' ? null : 'allow-scripts allow-pointer-lock', file.name);
      if (file.type === 'application/pdf') previewArea.querySelector('iframe').removeAttribute('sandbox');
      updateActions(true);
    }
    updateActions(true);
  }
  NT.handleFileOpen = handleFileOpen;

  toggleButtonsBtn.addEventListener('click', () => {
    optionsHidden = !optionsHidden;
    saveConfigKey('disguise_options_hidden', optionsHidden ? 'true' : 'false');
    toggleButtonsBtn.textContent = optionsHidden ? 'Show toolbar' : 'Hide toolbar';
    updateActions(hasContent());
  });
  NT.toggleToolbar = () => toggleButtonsBtn.click();

  function attemptSave(encoded, btn) {
    if (saveConfigKey('disguise_savedfile', encoded)) {
      if (btn) flash(btn, 'Saved');
      setStatus('Local Storage', 'Saved text');
      toast('Text saved to this browser');
    }
  }

  // ---------- about:blank launcher (sandboxed without allow-same-origin) ----------
  async function openBlank() {
    if (!(await requireFeature('feature_about_blank', 'Unlock the about:blank launcher for 10 shards?'))) return;
    let targetUrl = '';
    if (V.saved || V.isText) targetUrl = URL.createObjectURL(new Blob([savedText()], { type: 'text/html' }));
    else if (V.blobURL) targetUrl = V.blobURL;
    if (!targetUrl) { toast('Open something first', 'error'); return; }
    const w = window.open('about:blank', '_blank');
    if (!w) { toast('Pop-up blocked. Allow pop-ups to use about:blank', 'error'); return; }
    const d = w.document;
    d.title = localStorage.getItem('disguise_blank_title') || 'New tab';
    const fav = localStorage.getItem('disguise_favicon') || '';
    if (fav && validIcon(fav)) { const l = d.createElement('link'); l.rel = 'icon'; l.href = fav; d.head.appendChild(l); }
    const st = d.createElement('style');
    st.textContent = 'html,body{height:100%;margin:0;padding:0;overflow:hidden;background:#fff}iframe{width:100vw;height:100vh;border:none;display:block}';
    d.head.appendChild(st);
    const f = d.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-pointer-lock' + (/^https?:/i.test(targetUrl) ? ' allow-same-origin' : ''));
    f.src = targetUrl;
    d.body.appendChild(f);
  }
  NT.openBlank = openBlank;
  openBlankBtn.addEventListener('click', openBlank);

  function renderHere() {
    if (V.saved || V.isText) {
      const text = savedText();
      if (V.isHTML || /<\s*html/i.test(text) || /<\s*(body|div|script|h1)/i.test(text)) {
        revokeCurrent();
        V.blobURL = URL.createObjectURL(new Blob([text], { type: 'text/html' }));
        makeFrame(V.blobURL, 'allow-scripts allow-forms allow-popups allow-pointer-lock', 'Rendered HTML');
        iframeWarning.classList.remove('show');
      } else renderTextView(text);
    } else if (V.blobURL) {
      if (/^https?:/i.test(V.blobURL)) makeFrame(V.blobURL, sandboxFor(V.blobURL), 'Web page');
      else makeFrame(V.blobURL, 'allow-scripts allow-pointer-lock', 'File');
    }
    updateActions(true);
  }
  NT.renderHere = renderHere;
  openHereBtn.addEventListener('click', renderHere);

  async function download() {
    if (!(await requireFeature('feature_download', 'Unlock file downloads for 30 points?'))) return;
    if (V.saved) {
      const a = document.createElement('a');
      const u = URL.createObjectURL(new Blob([savedText()], { type: V.isHTML ? 'text/html' : 'text/plain' }));
      a.href = u; a.download = V.file ? V.file.name : 'export.txt'; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 2000);
    } else if (V.blobURL && !/^https?:/i.test(V.blobURL)) {
      const a = document.createElement('a'); a.href = V.blobURL; a.download = V.file ? V.file.name : 'file'; a.click();
    } else toast('Nothing to download for a web page', 'error');
  }
  NT.download = download;
  downloadBtn.addEventListener('click', download);

  // ---------- Editor ----------
  function openEditor() {
    if (!V.saved && !V.isText) return;
    editorTextarea.value = savedText();
    editorPanel.classList.remove('hidden');
    editorTextarea.focus();
    if (NT.onEditorOpen) NT.onEditorOpen();
  }
  NT.openEditor = openEditor;
  editBtn.addEventListener('click', openEditor);
  cancelEditBtn.addEventListener('click', () => { editorPanel.classList.add('hidden'); if (NT.updateCounts) NT.updateCounts(); });
  saveEditBtn.addEventListener('click', () => {
    V.saved = b64EncodeUnicode(editorTextarea.value);
    V.isText = true;
    renderTextView(editorTextarea.value);
    editorPanel.classList.add('hidden');
    updateActions(true);
    attemptSave(V.saved, saveEditBtn);
  });
  saveFileBtn.addEventListener('click', () => { if (V.saved) attemptSave(V.saved, saveFileBtn); });
  async function copyText() {
    try { if (V.saved) { await navigator.clipboard.writeText(savedText()); flash(copyBtn, 'Copied'); } else toast('No text to copy', 'error'); }
    catch (e) { toast('Clipboard is blocked by the browser', 'error'); }
  }
  NT.copyText = copyText;
  copyBtn.addEventListener('click', copyText);
  clearFileBtn.addEventListener('click', () => {
    localStorage.removeItem('disguise_savedfile');
    V.saved = null; V.file = null; V.isText = false; V.isHTML = false; revokeCurrent();
    showEmpty(); updateActions(false); setStatus('No source', '');
    if (NT.onContentChanged) NT.onContentChanged('New tab');
  });

  // ---------- Config export / import / reset (only this app's disguise_ keys) ----------
  function exportConfig() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('disguise_')) data[k] = localStorage.getItem(k); }
    const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = u; a.download = 'disguise_config.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
    toast('Configuration exported');
  }
  NT.exportConfig = exportConfig;
  exportBtn.addEventListener('click', exportConfig);
  importConfig.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('shape');
        let n = 0;
        Object.keys(data).forEach(k => {
          if (!k.startsWith('disguise_') || k === 'disguise_theme') return;
          let v = data[k];
          if (v == null || typeof v === 'object') return;
          v = String(v);
          if (k === 'disguise_colors') { v = NT.sanitizeColorsJSON(v); if (!v) return; }
          if (k === 'disguise_unlocked') { try { const arr = JSON.parse(v); if (!Array.isArray(arr)) return; v = JSON.stringify(arr.filter(x => typeof x === 'string' && x.startsWith('feature_'))); } catch (err) { return; } }
          if (/^disguise_(bookmarks|recents)$/.test(k)) { try { if (!Array.isArray(JSON.parse(v))) return; } catch (err) { return; } }
          localStorage.setItem(k, v); n++;
        });
        toast('Imported ' + n + ' settings. Reloading...');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast('That is not a valid config file', 'error'); }
    };
    reader.readAsText(f);
    importConfig.value = '';
  });
  async function resetAll() {
    const ok = await confirmDialog('Reset all settings?', 'This deletes saved text, notes, bookmarks, colors, unlocks, mini-game and rewards stored by New Tab. Other site data in your browser is not touched.', 'Reset everything', true);
    if (!ok) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('disguise_')) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
    location.reload();
  }
  NT.resetAll = resetAll;
  resetAllBtn.addEventListener('click', resetAll);

  el('unlockEverythingBtn').addEventListener('click', () => {
    FEATURES.forEach(f => { if (!unlockedItems.includes(f.id)) unlockedItems.push(f.id); });
    NT.setJSON('disguise_unlocked', unlockedItems);
    points = Math.max(points, 99999); shards = Math.max(shards, 99999);
    localStorage.setItem('disguise_points', points);
    localStorage.setItem('disguise_shards', shards);
    updateRewardsUI(); refreshPaywallUI();
    toast('Everything is unlocked, free');
  });

  // ---------- Hotkeys ----------
  let escapeCount = 0, escapeTimer;
  document.addEventListener('keydown', e => {
    const a = document.activeElement;
    if (panicHotkey.value && e.key.toLowerCase() === panicHotkey.value.toLowerCase() && !e.ctrlKey && !e.metaKey && !e.altKey && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) {
      e.preventDefault(); panicBtn.click();
    }
    if (e.key === 'Escape') {
      if (!editorPanel.classList.contains('hidden')) editorPanel.classList.add('hidden');
      else {
        escapeCount++; if (escapeCount >= 4) panicBtn.click();
        clearTimeout(escapeTimer); escapeTimer = setTimeout(() => { escapeCount = 0; }, 400);
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !editorPanel.classList.contains('hidden')) { e.preventDefault(); saveEditBtn.click(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') updateLastActiveTime();
    else processOfflineShards();
  });
  window.addEventListener('beforeunload', () => {
    updateLastActiveTime(); revokeCurrent();
    if (currentGameBlobURL) URL.revokeObjectURL(currentGameBlobURL);
  });

  // Sidebar (drawer on phones, collapse on desktop)
  const isNarrow = () => window.matchMedia('(max-width: 920px)').matches;
  NT.toggleSidebar = () => { if (isNarrow()) app.classList.toggle('drawer-open'); else app.classList.toggle('sidebar-collapsed'); };
  NT.openSidebar = () => { if (isNarrow()) app.classList.add('drawer-open'); else app.classList.remove('sidebar-collapsed'); };
  el('sidebarToggle').addEventListener('click', NT.toggleSidebar);
  el('sidebarToggleDesk').addEventListener('click', NT.toggleSidebar);
  el('scrim').addEventListener('click', () => app.classList.remove('drawer-open'));
  NT.openGroup = id => { NT.openSidebar(); const g = el(id); if (g) { g.open = true; setTimeout(() => g.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); } };

  NT.core = { loadSettings };
  window.NT_boot = loadSettings;
})();
