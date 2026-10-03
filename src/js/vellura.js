const $ = (id) => document.getElementById(id);

const tabList = $("tabList");
const addressForm = $("addressForm");
const addressBar = $("addressBar");
const backButton = $("backButton");
const forwardButton = $("forwardButton");
const reloadButton = $("reloadButton");
const reloadIcon = $("reloadIcon");
const bookmarkButton = $("bookmarkButton");
const securityIcon = $("securityIcon");
const siteInfoButton = $("siteInfoButton");
const siteInfoPanel = $("siteInfoPanel");
const profileButton = $("profileButton");
const profileInitial = $("profileInitial");
const menuButton = $("menuButton");
const menuPanel = $("menuPanel");
const profilePanel = $("profilePanel");
const panel = $("panel");
const panelClose = $("panelClose");
const panelTitle = $("panelTitle");
const panelSubtitle = $("panelSubtitle");
const panelBody = $("panelBody");
const panelToolbar = $("panelToolbar");
const panelIcon = $("panelIcon");
const toast = $("toast");
const permissionDialog = $("permissionDialog");
const permissionMessage = $("permissionMessage");
const permissionAllow = $("permissionAllow");
const permissionBlock = $("permissionBlock");
const maximizeButton = $("maximizeButton");
const maximizeIcon = $("maximizeIcon");
const zoomOutButton = $("zoomOutButton");
const zoomInButton = $("zoomInButton");
const zoomResetButton = $("zoomResetButton");
const commandPalette = $("commandPalette");
const commandInput = $("commandInput");
const commandList = $("commandList");
const tabContextMenu = $("tabContextMenu");
const findBar = $("findBar");
const findInput = $("findInput");

let currentProfile = { id: "default", name: "Default", private: false };
let currentURL = "";
let currentTitle = "New Tab";
let currentBookmarked = false;
let currentZoom = 100;
let activePermission = null;
let currentTabs = [];
let contextTab = null;
let selectedCommand = 0;

const panelIcons = {
  History: "history",
  Downloads: "download",
  Bookmarks: "bookmark",
  Extensions: "extension",
  Profiles: "user",
  Settings: "settings",
  "Help & Support": "help"
};

const commands = [
  { id: "new-tab", title: "Open a new tab", detail: "Start a fresh browsing session", icon: "plus", shortcut: "Ctrl T" },
  { id: "private-window", title: "Open a private window", detail: "Browse without saving local history", icon: "shield", shortcut: "Ctrl Shift N" },
  { id: "history", title: "Search browsing history", detail: "Return to pages you visited", icon: "history", shortcut: "Ctrl H" },
  { id: "downloads", title: "Open downloads", detail: "View and manage downloaded files", icon: "download", shortcut: "Ctrl J" },
  { id: "bookmarks", title: "Open bookmarks", detail: "Browse your saved pages", icon: "bookmark", shortcut: "Ctrl Shift B" },
  { id: "extensions", title: "Manage extensions", detail: "Install compatible unpacked extensions", icon: "extension", shortcut: "Ctrl Shift A" },
  { id: "find", title: "Find in this page", detail: "Search the current page", icon: "search", shortcut: "Ctrl F" },
  { id: "settings", title: "Open Vellura settings", detail: "Personalize search, appearance, and startup", icon: "settings", shortcut: "" },
  { id: "clear-data", title: "Clear browsing data", detail: "Remove history, cookies, and site storage", icon: "trash", shortcut: "Ctrl Shift Del" },
  { id: "devtools", title: "Open developer tools", detail: "Inspect the active page", icon: "code", shortcut: "Ctrl Shift I" }
];

function svgIcon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  if (className) svg.setAttribute("class", className);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#icon-${name}`);
  svg.appendChild(use);
  return svg;
}

function setIcon(element, name) {
  const use = element?.querySelector("use");
  if (use) use.setAttribute("href", `#icon-${name}`);
}

function fallbackLogo() {
  return "../assets/vellura-logo.png";
}

function normalizeAddress(value) {
  const input = String(value || "").trim();
  if (!input) return "vellura://newtab/";
  if (/^(https?|file|vellura):\/\//i.test(input)) return input;
  if (input.includes(".") && !input.includes(" ")) return `https://${input}`;
  return input;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2800);
}

function overlaysOpen() {
  return [
    menuPanel,
    profilePanel,
    panel,
    permissionDialog,
    siteInfoPanel,
    commandPalette,
    tabContextMenu,
    findBar
  ].some((element) => !element.classList.contains("hidden"));
}

function syncOverlay() {
  window.vellura.setUIOverlay(overlaysOpen());
}

function hidePopover(element) {
  element.classList.add("hidden");
}

function closeTransientPopovers(except = null) {
  for (const element of [menuPanel, profilePanel, siteInfoPanel, tabContextMenu]) {
    if (element !== except) hidePopover(element);
  }
  menuButton.setAttribute("aria-expanded", "false");
  siteInfoButton.setAttribute("aria-expanded", "false");
}

function closeMenu() {
  hidePopover(menuPanel);
  menuButton.setAttribute("aria-expanded", "false");
  syncOverlay();
}

function toggleMenu() {
  const opening = menuPanel.classList.contains("hidden");
  closeTransientPopovers(opening ? menuPanel : null);
  menuPanel.classList.toggle("hidden", !opening);
  menuButton.setAttribute("aria-expanded", String(opening));
  syncOverlay();
}

function closeProfile() {
  hidePopover(profilePanel);
  syncOverlay();
}

function toggleProfile() {
  const opening = profilePanel.classList.contains("hidden");
  closeTransientPopovers(opening ? profilePanel : null);
  profilePanel.classList.toggle("hidden", !opening);
  if (opening) window.vellura.listProfiles();
  syncOverlay();
}

function closeSiteInfo() {
  hidePopover(siteInfoPanel);
  siteInfoButton.setAttribute("aria-expanded", "false");
  syncOverlay();
}

function toggleSiteInfo() {
  const opening = siteInfoPanel.classList.contains("hidden");
  closeTransientPopovers(opening ? siteInfoPanel : null);
  siteInfoPanel.classList.toggle("hidden", !opening);
  siteInfoButton.setAttribute("aria-expanded", String(opening));
  syncOverlay();
}

function closePanel() {
  panel.classList.add("hidden");
  panelToolbar.classList.add("hidden");
  panelToolbar.replaceChildren();
  panelBody.replaceChildren();
  syncOverlay();
}

function openPanel(title, subtitle, toolbar = []) {
  panelTitle.textContent = title;
  panelSubtitle.textContent = subtitle;
  setIcon(panelIcon, panelIcons[title] || "sparkles");
  panel.classList.remove("hidden");
  panelToolbar.replaceChildren(...toolbar);
  panelToolbar.classList.toggle("hidden", !toolbar.length);
  closeTransientPopovers();
  closeCommandPalette();
  syncOverlay();
}

function renderTabs(tabs) {
  currentTabs = tabs;
  tabList.replaceChildren();

  for (const tab of tabs) {
    const tabEl = document.createElement("div");
    tabEl.className = `tab ${tab.active ? "active" : ""} ${tab.pinned ? "pinned" : ""} ${tab.audible ? "audible" : ""}`;
    tabEl.title = tab.title || "New Tab";
    tabEl.dataset.tabId = tab.id;
    tabEl.draggable = !tab.pinned;
    tabEl.setAttribute("role", "tab");
    tabEl.setAttribute("aria-selected", String(!!tab.active));
    tabEl.tabIndex = tab.active ? 0 : -1;

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.src = tab.favicon || fallbackLogo();
    favicon.alt = "";
    favicon.addEventListener("error", () => {
      favicon.src = fallbackLogo();
    }, { once: true });

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.loading ? "Loading…" : (tab.title || "New Tab");

    const audio = document.createElement("button");
    audio.type = "button";
    audio.className = "tab-audio";
    audio.title = tab.muted ? "Unmute site" : "Mute site";
    audio.appendChild(svgIcon(tab.muted ? "volume-off" : "volume"));
    if (tab.muted) audio.classList.add("muted");
    audio.addEventListener("click", (event) => {
      event.stopPropagation();
      window.vellura.tabAction("mute", tab.id);
    });

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.title = "Close tab";
    close.appendChild(svgIcon("x"));
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      window.vellura.closeTab(tab.id);
    });

    tabEl.addEventListener("click", () => window.vellura.activateTab(tab.id));
    tabEl.addEventListener("keydown", (event) => {
      const tabElements = [...tabList.querySelectorAll(".tab")];
      const index = tabElements.indexOf(tabEl);

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const next = tabElements[(index + direction + tabElements.length) % tabElements.length];
        next?.focus();
        if (next?.dataset.tabId) window.vellura.activateTab(next.dataset.tabId);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.vellura.activateTab(tab.id);
      } else if (event.key === "Delete") {
        event.preventDefault();
        window.vellura.closeTab(tab.id);
      }
    });
    tabEl.addEventListener("auxclick", (event) => {
      if (event.button === 1) window.vellura.closeTab(tab.id);
    });
    tabEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openTabContextMenu(event.clientX, event.clientY, tab);
    });
    tabEl.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", tab.id);
      tabEl.classList.add("dragging");
    });
    tabEl.addEventListener("dragend", () => tabEl.classList.remove("dragging"));
    tabEl.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    tabEl.addEventListener("drop", (event) => {
      event.preventDefault();
      const movingId = event.dataTransfer.getData("text/plain");
      if (movingId && movingId !== tab.id) window.vellura.reorderTab(movingId, tab.id);
    });

    tabEl.append(favicon, title, audio, close);
    tabList.appendChild(tabEl);
  }

  requestAnimationFrame(() => {
    tabList.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function openTabContextMenu(x, y, tab) {
  contextTab = tab;
  $("pinTabLabel").textContent = tab.pinned ? "Unpin tab" : "Pin tab";
  $("muteTabLabel").textContent = tab.muted ? "Unmute site" : "Mute site";
  closeTransientPopovers(tabContextMenu);
  tabContextMenu.classList.remove("hidden");

  const margin = 8;
  const width = 230;
  const height = 210;
  tabContextMenu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - width - margin))}px`;
  tabContextMenu.style.top = `${Math.max(58, Math.min(y, window.innerHeight - height - margin))}px`;
  syncOverlay();
}

function updateSecurity(url) {
  siteInfoButton.classList.remove("insecure", "internal");

  if ((url || "").startsWith("https://")) {
    setIcon(securityIcon, "lock");
    siteInfoButton.title = "Secure connection";
    $("siteInfoTitle").textContent = "Connection is secure";
    $("connectionStatus").textContent = "Encrypted";
  } else if ((url || "").startsWith("http://")) {
    setIcon(securityIcon, "shield");
    siteInfoButton.classList.add("insecure");
    siteInfoButton.title = "Connection is not secure";
    $("siteInfoTitle").textContent = "Connection is not secure";
    $("connectionStatus").textContent = "Not encrypted";
  } else {
    setIcon(securityIcon, "shield");
    siteInfoButton.classList.add("internal");
    siteInfoButton.title = "Vellura protected page";
    $("siteInfoTitle").textContent = "Protected Vellura page";
    $("connectionStatus").textContent = "Internal";
  }

  try {
    const parsed = new URL(url);
    $("siteInfoOrigin").textContent = parsed.hostname || "Vellura internal page";
  } catch {
    $("siteInfoOrigin").textContent = "Vellura internal page";
  }
}

function updateZoom(value) {
  currentZoom = Number(value) || 100;
  zoomResetButton.textContent = `${currentZoom}%`;
}

function updateBookmark(value) {
  currentBookmarked = !!value;
  bookmarkButton.classList.toggle("active", currentBookmarked);
  bookmarkButton.title = currentBookmarked ? "Remove bookmark" : "Bookmark this page";
}

function makeButton(text, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener("click", handler);
  return button;
}

function safeDate(value) {
  try {
    return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function emptyState(title, detail) {
  panelBody.innerHTML = `<div class="empty-state"><strong>${title}</strong><div style="margin-top:8px">${detail}</div></div>`;
}

function renderHistory(items) {
  panelBody.replaceChildren();
  if (!items.length) {
    emptyState("Your history is clear", "Pages you visit will appear here.");
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "data-row";
    const main = document.createElement("div");
    main.className = "row-main";
    const title = document.createElement("div");
    title.className = "data-title";
    title.textContent = item.title || item.url;
    const link = document.createElement("div");
    link.className = "data-link";
    link.textContent = item.url;
    link.addEventListener("click", () => {
      window.vellura.openURL(item.url);
      closePanel();
    });
    const meta = document.createElement("div");
    meta.className = "data-meta";
    meta.textContent = safeDate(item.time);
    main.append(title, link, meta);
    row.appendChild(main);
    panelBody.appendChild(row);
  }
}

function renderBookmarks(items) {
  panelBody.replaceChildren();
  if (!items.length) {
    emptyState("No bookmarks yet", "Use the star in the address bar to save a page.");
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "data-row";
    const main = document.createElement("div");
    main.className = "row-main";
    const title = document.createElement("div");
    title.className = "data-title";
    title.textContent = item.title || item.url;
    const link = document.createElement("div");
    link.className = "data-link";
    link.textContent = item.url;
    link.addEventListener("click", () => {
      window.vellura.openURL(item.url);
      closePanel();
    });
    main.append(title, link);
    const actions = document.createElement("div");
    actions.className = "data-buttons";
    actions.appendChild(makeButton("Remove", () => window.vellura.removeBookmark(item.id)));
    row.append(main, actions);
    panelBody.appendChild(row);
  }
}

function renderDownloads(items) {
  panelBody.replaceChildren();
  if (!items.length) {
    emptyState("No downloads yet", "Files downloaded in Vellura will appear here.");
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "data-row";
    const main = document.createElement("div");
    main.className = "row-main";
    const title = document.createElement("div");
    title.className = "data-title";
    title.textContent = item.filename;
    const progress = item.totalBytes > 0
      ? `${Math.round((item.receivedBytes / item.totalBytes) * 100)}%`
      : item.state;
    const meta = document.createElement("div");
    meta.className = "data-meta";
    meta.textContent = `${item.state} • ${progress}`;
    main.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "data-buttons";

    if (item.path && item.state === "completed") {
      actions.append(
        makeButton("Open", () => window.vellura.openDownload(item.path)),
        makeButton("Show in folder", () => window.vellura.showDownload(item.path))
      );
    } else if (item.state === "progressing") {
      actions.append(
        makeButton("Pause", () => window.vellura.pauseDownload(item.id)),
        makeButton("Cancel", () => window.vellura.cancelDownload(item.id))
      );
    } else if (item.state === "interrupted") {
      actions.appendChild(makeButton("Resume", () => window.vellura.resumeDownload(item.id)));
    }

    row.append(main, actions);
    panelBody.appendChild(row);
  }
}

function renderExtensions(extensions) {
  panelBody.replaceChildren();
  if (!currentProfile.private) {
    panelToolbar.replaceChildren(makeButton("Install unpacked extension", () => window.vellura.pickExtension(), "primary-button"));
    panelToolbar.classList.remove("hidden");
  } else {
    panelToolbar.classList.add("hidden");
  }

  if (!extensions.length) {
    emptyState("No extensions installed", "Install an unpacked Chromium extension that uses Electron-supported APIs.");
    return;
  }

  for (const extension of extensions) {
    const row = document.createElement("div");
    row.className = "data-row";
    const main = document.createElement("div");
    main.className = "row-main";
    const title = document.createElement("div");
    title.className = "data-title";
    title.textContent = extension.name || "Extension";
    const meta = document.createElement("div");
    meta.className = "data-meta";
    meta.textContent = `v${extension.version || "?"} • ${extension.path}`;
    main.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "data-buttons";
    actions.appendChild(makeButton("Remove", () => window.vellura.removeExtension(extension.id, extension.path)));
    row.append(main, actions);
    panelBody.appendChild(row);
  }
}

function renderProfiles(profiles) {
  const profileList = $("profileList");
  profileList.replaceChildren();

  for (const profile of profiles) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `profile-option ${profile.current ? "current" : ""}`;
    const avatar = document.createElement("div");
    avatar.className = "profile-avatar small";
    avatar.textContent = (profile.name || "D").slice(0, 1).toUpperCase();
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("strong");
    name.textContent = profile.name;
    const sub = document.createElement("span");
    sub.textContent = profile.current ? "Current profile" : "Open in a new window";
    meta.append(name, sub);
    const status = document.createElement("span");
    status.textContent = profile.current ? "✓" : "›";
    option.append(avatar, meta, status);
    option.addEventListener("click", () => {
      if (profile.current) closeProfile();
      else window.vellura.switchProfile(profile.id);
    });
    profileList.appendChild(option);
  }
}

function createSettingsCard(title, detail, control, wide = false) {
  const card = document.createElement("section");
  card.className = `settings-card ${wide ? "wide" : ""}`;
  const heading = document.createElement("h3");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = detail;
  card.append(heading, copy, control);
  return card;
}

function renderSettings(settings) {
  panelBody.replaceChildren();
  panelToolbar.classList.remove("hidden");
  const save = makeButton("Save changes", () => {
    window.vellura.updateSettings({
      searchEngine: $("searchEngineSelect").value,
      theme: $("themeSelect").value,
      startupPage: $("startupPageInput").value,
      compactTabs: $("compactTabsInput").checked
    });
  }, "primary-button");
  panelToolbar.replaceChildren(save);

  const grid = document.createElement("div");
  grid.className = "settings-grid";

  const searchSelect = document.createElement("select");
  searchSelect.id = "searchEngineSelect";
  searchSelect.className = "settings-control";
  for (const [value, text] of [["google", "Google"], ["bing", "Bing"], ["duckduckgo", "DuckDuckGo"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = settings.searchEngine === value;
    searchSelect.appendChild(option);
  }

  const themeSelect = document.createElement("select");
  themeSelect.id = "themeSelect";
  themeSelect.className = "settings-control";
  for (const [value, text] of [["midnight", "Midnight"], ["aurora", "Aurora"], ["light", "Daylight"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = settings.theme === value;
    themeSelect.appendChild(option);
  }
  themeSelect.addEventListener("change", () => applySettings({ ...settings, theme: themeSelect.value }));

  const startupInput = document.createElement("input");
  startupInput.id = "startupPageInput";
  startupInput.className = "settings-control";
  startupInput.value = settings.startupPage || "vellura://newtab/";
  startupInput.placeholder = "vellura://newtab/ or a website";

  const compactWrap = document.createElement("div");
  compactWrap.className = "settings-switch";
  const compactText = document.createElement("span");
  compactText.textContent = "Fit more tabs in the tab strip";
  const compactLabel = document.createElement("label");
  compactLabel.className = "switch";
  const compactInput = document.createElement("input");
  compactInput.id = "compactTabsInput";
  compactInput.type = "checkbox";
  compactInput.checked = !!settings.compactTabs;
  const compactVisual = document.createElement("span");
  compactLabel.append(compactInput, compactVisual);
  compactWrap.append(compactText, compactLabel);

  const engineInfo = document.createElement("div");
  engineInfo.className = "data-meta";
  engineInfo.textContent = "Vellura uses Chromium through Electron with context isolation, sandboxed page renderers, profile-scoped storage, and explicit permission prompts.";

  grid.append(
    createSettingsCard("Search engine", "Used when text entered in the address bar is not a web address.", searchSelect),
    createSettingsCard("Appearance", "Choose a visual theme for Vellura's browser chrome.", themeSelect),
    createSettingsCard("Startup page", "Choose what opens in every new browser window.", startupInput, true),
    createSettingsCard("Compact tabs", "Reduce tab width when you keep many pages open.", compactWrap),
    createSettingsCard("Privacy architecture", "Security details for this Vellura build.", engineInfo)
  );
  panelBody.appendChild(grid);
}

function applySettings(settings = {}) {
  const theme = ["midnight", "aurora", "light"].includes(settings.theme) ? settings.theme : "midnight";
  document.body.dataset.theme = theme;
  document.body.classList.toggle("compact-tabs", !!settings.compactTabs);
}

function openHistoryPanel() {
  openPanel("History", "Pages visited in this profile");
  window.vellura.openPanelData("history");
}

function openDownloadsPanel() {
  openPanel("Downloads", "Files downloaded in Vellura");
  window.vellura.openPanelData("downloads");
}

function openBookmarksPanel() {
  openPanel("Bookmarks", "Your saved pages");
  window.vellura.openPanelData("bookmarks");
}

function openExtensionsPanel() {
  openPanel("Extensions", "Compatible Chromium add-ons");
  window.vellura.openPanelData("extensions");
}

function openProfilesPanel() {
  closeTransientPopovers(profilePanel);
  profilePanel.classList.remove("hidden");
  window.vellura.listProfiles();
  syncOverlay();
}

function openSettingsPanel() {
  openPanel("Settings", "Personalize Vellura");
  window.vellura.getSettings();
}

function renderHelp() {
  openPanel("Help & Support", "Vellura keyboard shortcuts");
  const groups = [
    ["Navigation", "Ctrl+L address bar • Alt+Left/Right back and forward • F5 reload"],
    ["Command center", "Ctrl+K opens every major Vellura action from one searchable menu"],
    ["Tabs", "Ctrl+T new • Ctrl+W close • Ctrl+Shift+T reopen • Ctrl+Tab switch • right-click for tab tools"],
    ["Page tools", "Ctrl+F find • Ctrl+P print • Ctrl+=/− zoom • Ctrl+0 reset"],
    ["Browser data", "Ctrl+H history • Ctrl+J downloads • Ctrl+Shift+B bookmarks • Ctrl+Shift+A extensions"]
  ];
  panelBody.replaceChildren();
  for (const [title, detail] of groups) {
    const row = document.createElement("div");
    row.className = "data-row";
    const main = document.createElement("div");
    main.className = "row-main";
    const heading = document.createElement("div");
    heading.className = "data-title";
    heading.textContent = title;
    const meta = document.createElement("div");
    meta.className = "data-meta";
    meta.textContent = detail;
    main.append(heading, meta);
    row.appendChild(main);
    panelBody.appendChild(row);
  }
}

function runMenuAction(action) {
  if (action === "new-tab") window.vellura.newTab();
  else if (action === "new-window") window.vellura.newWindow();
  else if (action === "private-window") window.vellura.newPrivateWindow();
  else if (action === "history") return openHistoryPanel();
  else if (action === "downloads") return openDownloadsPanel();
  else if (action === "bookmarks") return openBookmarksPanel();
  else if (action === "extensions") return openExtensionsPanel();
  else if (action === "save-page") window.vellura.savePage();
  else if (action === "print") window.vellura.print();
  else if (action === "find") return openFindBar();
  else if (action === "devtools") window.vellura.devtools();
  else if (action === "fullscreen") window.vellura.fullscreen();
  else if (action === "clear-data") {
    if (confirm("Clear Vellura browsing history, cookies, cache, and site storage for this profile?")) window.vellura.clearData();
  } else if (action === "settings") return openSettingsPanel();
  else if (action === "help") return renderHelp();
  else if (action === "exit") window.vellura.exit();
  closeMenu();
}

function openFindBar() {
  closeMenu();
  findBar.classList.remove("hidden");
  findInput.focus();
  findInput.select();
  syncOverlay();
}

function closeFindBar() {
  findBar.classList.add("hidden");
  findInput.value = "";
  window.vellura.find("");
  syncOverlay();
}

function filteredCommands() {
  const query = commandInput.value.trim().toLowerCase();
  if (!query) return commands;
  return commands.filter((command) =>
    `${command.title} ${command.detail} ${command.id}`.toLowerCase().includes(query)
  );
}

function renderCommands() {
  const visibleCommands = filteredCommands();
  selectedCommand = Math.max(0, Math.min(selectedCommand, visibleCommands.length - 1));
  commandList.replaceChildren();

  if (!visibleCommands.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.margin = "15px";
    empty.textContent = "No matching Vellura commands.";
    commandList.appendChild(empty);
    return;
  }

  visibleCommands.forEach((command, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `command-item ${index === selectedCommand ? "selected" : ""}`;
    const icon = document.createElement("span");
    icon.className = "command-item-icon";
    icon.appendChild(svgIcon(command.icon));
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = command.title;
    const detail = document.createElement("span");
    detail.textContent = command.detail;
    copy.append(title, detail);
    const shortcut = document.createElement("kbd");
    shortcut.textContent = command.shortcut;
    if (!command.shortcut) shortcut.style.visibility = "hidden";
    item.append(icon, copy, shortcut);
    item.addEventListener("mouseenter", () => {
      selectedCommand = index;
      commandList.querySelectorAll(".command-item").forEach((candidate, candidateIndex) => {
        candidate.classList.toggle("selected", candidateIndex === selectedCommand);
      });
    });
    item.addEventListener("click", () => runCommand(command.id));
    commandList.appendChild(item);
  });
}

function openCommandPalette() {
  closeTransientPopovers();
  commandPalette.classList.remove("hidden");
  commandInput.value = "";
  selectedCommand = 0;
  renderCommands();
  commandInput.focus();
  syncOverlay();
}

function closeCommandPalette() {
  commandPalette.classList.add("hidden");
  syncOverlay();
}

function runCommand(commandId) {
  closeCommandPalette();
  runMenuAction(commandId);
}

addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  window.vellura.navigate(normalizeAddress(addressBar.value));
  addressBar.blur();
});

backButton.addEventListener("click", () => window.vellura.goBack());
forwardButton.addEventListener("click", () => window.vellura.goForward());
reloadButton.addEventListener("click", () => window.vellura.reload());
$("newTabButton").addEventListener("click", () => window.vellura.newTab());
bookmarkButton.addEventListener("click", () => window.vellura.toggleBookmark());
menuButton.addEventListener("click", toggleMenu);
profileButton.addEventListener("click", toggleProfile);
siteInfoButton.addEventListener("click", toggleSiteInfo);
$("shieldButton").addEventListener("click", toggleSiteInfo);
$("downloadsButton").addEventListener("click", openDownloadsPanel);
$("commandButton").addEventListener("click", openCommandPalette);
$("profileClose").addEventListener("click", closeProfile);
panelClose.addEventListener("click", closePanel);
zoomOutButton.addEventListener("click", () => window.vellura.changeZoom(-0.1));
zoomInButton.addEventListener("click", () => window.vellura.changeZoom(0.1));
zoomResetButton.addEventListener("click", () => window.vellura.resetZoom());
$("findClose").addEventListener("click", closeFindBar);

$("createProfileButton").addEventListener("click", () => {
  const value = $("newProfileName").value.trim();
  if (!value) return;
  window.vellura.createProfile(value);
  $("newProfileName").value = "";
});

$("newProfileName").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("createProfileButton").click();
});

$("minimizeButton").addEventListener("click", () => window.vellura.minimizeWindow());
maximizeButton.addEventListener("click", () => window.vellura.maximizeWindow());
$("closeButton").addEventListener("click", () => window.vellura.closeWindow());

menuPanel.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) runMenuAction(actionButton.dataset.action);
});

siteInfoPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-site-action='settings']")) {
    closeSiteInfo();
    openSettingsPanel();
  }
});

tabContextMenu.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-tab-action]");
  if (!actionButton || !contextTab) return;
  window.vellura.tabAction(actionButton.dataset.tabAction, contextTab.id);
  hidePopover(tabContextMenu);
  contextTab = null;
  syncOverlay();
});

findInput.addEventListener("input", () => window.vellura.find(findInput.value));
findInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") window.vellura.find(findInput.value);
  if (event.key === "Escape") closeFindBar();
});

commandInput.addEventListener("input", () => {
  selectedCommand = 0;
  renderCommands();
});

commandInput.addEventListener("keydown", (event) => {
  const visible = filteredCommands();
  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedCommand = Math.min(selectedCommand + 1, visible.length - 1);
    renderCommands();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedCommand = Math.max(selectedCommand - 1, 0);
    renderCommands();
  } else if (event.key === "Enter" && visible[selectedCommand]) {
    event.preventDefault();
    runCommand(visible[selectedCommand].id);
  } else if (event.key === "Escape") {
    closeCommandPalette();
  }
});

commandPalette.addEventListener("mousedown", (event) => {
  if (event.target === commandPalette) closeCommandPalette();
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (event.ctrlKey && key === "l") {
    event.preventDefault();
    addressBar.focus();
    addressBar.select();
  }
  if (event.ctrlKey && key === "k") {
    event.preventDefault();
    openCommandPalette();
  }
  if (event.ctrlKey && key === "f") {
    event.preventDefault();
    openFindBar();
  }
  if (event.key === "Escape") {
    closeTransientPopovers();
    if (!commandPalette.classList.contains("hidden")) closeCommandPalette();
    else if (!findBar.classList.contains("hidden")) closeFindBar();
    else if (!panel.classList.contains("hidden")) closePanel();
    permissionDialog.classList.add("hidden");
    syncOverlay();
  }
  if (event.ctrlKey && event.shiftKey && event.key === "0") {
    event.preventDefault();
    window.vellura.repairUIZoom();
  }
});

document.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  const pairings = [
    [menuPanel, menuButton],
    [profilePanel, profileButton],
    [siteInfoPanel, siteInfoButton],
    [tabContextMenu, null]
  ];
  let changed = false;
  for (const [popover, trigger] of pairings) {
    if (popover.classList.contains("hidden")) continue;
    if (!popover.contains(event.target) && !trigger?.contains(event.target)) {
      popover.classList.add("hidden");
      changed = true;
    }
  }
  if (changed) syncOverlay();
});

window.vellura.onTabsUpdated(renderTabs);

window.vellura.onNavigationState((state) => {
  currentURL = state.url || "";
  currentTitle = state.title || "New Tab";
  addressBar.value = currentURL.startsWith("vellura://newtab") ? "" : currentURL;
  backButton.disabled = !state.canGoBack;
  forwardButton.disabled = !state.canGoForward;
  setIcon(reloadIcon, state.loading ? "stop" : "reload");
  updateSecurity(currentURL);
  updateBookmark(state.bookmarked);
  updateZoom(state.zoom);
});

window.vellura.onURLChanged((url) => {
  currentURL = url || "";
  if (document.activeElement !== addressBar) addressBar.value = currentURL.startsWith("vellura://newtab") ? "" : currentURL;
  updateSecurity(currentURL);
});

window.vellura.onTitleChanged((title) => {
  currentTitle = title || "New Tab";
  document.title = currentProfile.private ? `${currentTitle} — Vellura Private` : `${currentTitle} — Vellura`;
});

window.vellura.onAddressFocus(() => {
  addressBar.focus();
  addressBar.select();
});

window.vellura.onFindRequest(openFindBar);
window.vellura.onCommandPalette(openCommandPalette);

window.vellura.onClearDataConfirm(() => {
  if (confirm("Clear Vellura browsing history, cookies, cache, and site storage for this profile?")) window.vellura.clearData();
});

window.vellura.onPanelOpen(({ title, subtitle }) => openPanel(title, subtitle));
window.vellura.onPanelHistory(renderHistory);
window.vellura.onPanelBookmarks(renderBookmarks);
window.vellura.onPanelDownloads(renderDownloads);
window.vellura.onExtensionsUpdated(renderExtensions);
window.vellura.onPanelProfiles(renderProfiles);

window.vellura.onProfile((profile) => {
  currentProfile = profile;
  const initial = (profile.name || "D").slice(0, 1).toUpperCase();
  profileInitial.textContent = initial;
  $("profileAvatarLarge").textContent = initial;
  $("profileNameLarge").textContent = profile.name;
  $("profileStatus").textContent = profile.private ? "Private browsing window" : "Profile data stays separate";
  $("menuSubtitle").textContent = profile.private ? "Private browsing." : "Browse beyond.";
  $("privateBadge").classList.toggle("hidden", !profile.private);
});

window.vellura.onWindowMaximized((maximized) => {
  setIcon(maximizeIcon, maximized ? "restore" : "maximize");
});

window.vellura.onWindowFullscreen((fullscreen) => {
  document.body.classList.toggle("fullscreen", !!fullscreen);
});

window.vellura.onZoomChanged(updateZoom);
window.vellura.onProfilesOpen(openProfilesPanel);
window.vellura.onSettingsData((settings) => {
  applySettings(settings);
  if (!panel.classList.contains("hidden") && panelTitle.textContent === "Settings") renderSettings(settings);
});

window.vellura.onPermissionRequest((request) => {
  activePermission = request;
  $("permissionTitle").textContent = "Site permission request";
  permissionMessage.textContent = `${request.origin} wants permission to use ${request.permission}.`;
  permissionDialog.classList.remove("hidden");
  syncOverlay();
});

permissionAllow.addEventListener("click", () => {
  if (!activePermission) return;
  window.vellura.answerPermission(activePermission.id, true);
  activePermission = null;
  permissionDialog.classList.add("hidden");
  syncOverlay();
});

permissionBlock.addEventListener("click", () => {
  if (!activePermission) return;
  window.vellura.answerPermission(activePermission.id, false);
  activePermission = null;
  permissionDialog.classList.add("hidden");
  syncOverlay();
});

window.vellura.onToast(showToast);
window.vellura.getSettings();
