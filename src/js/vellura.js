const $ = (id) => document.getElementById(id);

const tabList = $("tabList");
const newTabButton = $("newTabButton");
const addressForm = $("addressForm");
const addressBar = $("addressBar");
const backButton = $("backButton");
const forwardButton = $("forwardButton");
const reloadButton = $("reloadButton");
const reloadIcon = $("reloadIcon");
const bookmarkButton = $("bookmarkButton");
const securityIcon = $("securityIcon");
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
const toast = $("toast");
const permissionDialog = $("permissionDialog");
const permissionMessage = $("permissionMessage");
const permissionAllow = $("permissionAllow");
const permissionBlock = $("permissionBlock");
const maximizeButton = $("maximizeButton");
const zoomOutButton = $("zoomOutButton");
const zoomInButton = $("zoomInButton");
const zoomResetButton = $("zoomResetButton");

let currentProfile = { id: "default", name: "Default", private: false };
let currentURL = "";
let currentTitle = "New Tab";
let currentBookmarked = false;
let currentZoom = 100;
let activePermission = null;

function fallbackLogo() {
  return "../assets/vellura-logo.png";
}

function normalizeAddress(value) {
  const v = value.trim();
  if (!v) return "vellura://newtab/";
  if (/^(https?|file|vellura):\/\//i.test(v)) return v;
  if (v.includes(".") && !v.includes(" ")) return `https://${v}`;
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function syncOverlay() {
  const open =
    !menuPanel.classList.contains("hidden") ||
    !profilePanel.classList.contains("hidden") ||
    !panel.classList.contains("hidden") ||
    !permissionDialog.classList.contains("hidden");

  window.vellura.setUIOverlay(open);
}

function closeMenu() {
  menuPanel.classList.add("hidden");
  menuButton.setAttribute("aria-expanded", "false");
  syncOverlay();
}

function toggleMenu() {
  menuPanel.classList.toggle("hidden");
  menuButton.setAttribute(
    "aria-expanded",
    String(!menuPanel.classList.contains("hidden"))
  );
  profilePanel.classList.add("hidden");
  panel.classList.add("hidden");
  syncOverlay();
}

function closeProfile() {
  profilePanel.classList.add("hidden");
  syncOverlay();
}

function toggleProfile() {
  profilePanel.classList.toggle("hidden");
  menuPanel.classList.add("hidden");
  panel.classList.add("hidden");
  syncOverlay();
  if (!profilePanel.classList.contains("hidden")) {
    window.vellura.listProfiles();
  }
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
  panel.classList.remove("hidden");
  panelToolbar.replaceChildren();

  if (toolbar.length) {
    panelToolbar.classList.remove("hidden");
    for (const item of toolbar) {
      panelToolbar.appendChild(item);
    }
  } else {
    panelToolbar.classList.add("hidden");
  }

  menuPanel.classList.add("hidden");
  profilePanel.classList.add("hidden");
  syncOverlay();
}

function renderTabs(tabs) {
  tabList.replaceChildren();

  for (const tab of tabs) {
    const tabEl = document.createElement("button");
    tabEl.type = "button";
    tabEl.className = `tab ${tab.active ? "active" : ""}`;
    tabEl.title = tab.title || "New Tab";

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.src = tab.favicon || fallbackLogo();
    favicon.alt = "";

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.loading ? "Loading…" : (tab.title || "New Tab");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Close tab";

    tabEl.addEventListener("click", () => {
      window.vellura.activateTab(tab.id);
    });

    tabEl.addEventListener("mousedown", (event) => {
      if (event.button === 1) {
        event.preventDefault();
        window.vellura.closeTab(tab.id);
      }
    });

    close.addEventListener("click", (event) => {
      event.stopPropagation();
      window.vellura.closeTab(tab.id);
    });

    tabEl.append(favicon, title, close);
    tabList.appendChild(tabEl);
  }

  // Keep the active tab visible when the strip changes.
  requestAnimationFrame(() => {
    tabList.querySelector(".tab.active")?.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  });
}

function updateSecurity(url) {
  if ((url || "").startsWith("https://")) {
    securityIcon.textContent = "🔒";
    securityIcon.title = "Secure connection";
  } else if ((url || "").startsWith("http://")) {
    securityIcon.textContent = "⚠";
    securityIcon.title = "Not secure";
  } else if ((url || "").startsWith("vellura://")) {
    securityIcon.textContent = "V";
    securityIcon.title = "Vellura page";
  } else {
    securityIcon.textContent = "⌁";
  }
}

function updateZoom(value) {
  currentZoom = Number(value) || 100;
  zoomResetButton.textContent = `${currentZoom}%`;
}

function updateBookmark(value) {
  currentBookmarked = !!value;
  bookmarkButton.textContent = currentBookmarked ? "★" : "☆";
  bookmarkButton.title = currentBookmarked
    ? "Remove bookmark"
    : "Bookmark this page";
}

function makeButton(text, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", handler);
  return button;
}

function safeDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function renderHistory(items) {
  panelBody.replaceChildren();

  if (!items.length) {
    panelBody.innerHTML = `<div class="empty-state">No browsing history yet.</div>`;
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
    panelBody.innerHTML = `<div class="empty-state">No bookmarks yet.</div>`;
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

    actions.appendChild(
      makeButton("Remove", () => window.vellura.removeBookmark(item.id))
    );

    row.append(main, actions);
    panelBody.appendChild(row);
  }
}

function renderDownloads(items) {
  panelBody.replaceChildren();

  if (!items.length) {
    panelBody.innerHTML = `<div class="empty-state">No downloads yet.</div>`;
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
      actions.appendChild(
        makeButton("Open", () => window.vellura.openDownload(item.path))
      );
      actions.appendChild(
        makeButton("Folder", () => window.vellura.showDownload(item.path))
      );
    } else if (item.state === "progressing") {
      actions.appendChild(
        makeButton("Pause", () => window.vellura.pauseDownload(item.id))
      );
      actions.appendChild(
        makeButton("Cancel", () => window.vellura.cancelDownload(item.id))
      );
    } else if (item.state === "interrupted") {
      actions.appendChild(
        makeButton("Resume", () => window.vellura.resumeDownload(item.id))
      );
    }

    row.append(main, actions);
    panelBody.appendChild(row);
  }
}

function renderExtensions(extensions) {
  panelBody.replaceChildren();

  if (!currentProfile.private) {
    const toolbarButton = makeButton("Install unpacked extension", () => {
      window.vellura.pickExtension();
    });
    toolbarButton.textContent = "Install unpacked extension";
    panelToolbar.replaceChildren(toolbarButton);
    panelToolbar.classList.remove("hidden");
  } else {
    panelToolbar.classList.add("hidden");
  }

  if (!extensions.length) {
    panelBody.innerHTML = `
      <div class="empty-state">
        <div>No extensions are installed.</div>
        <div style="margin-top:8px;font-size:11px">
          Vellura supports unpacked Chromium extensions that are compatible with Electron's supported extension APIs.
        </div>
      </div>
    `;
    return;
  }

  for (const ext of extensions) {
    const row = document.createElement("div");
    row.className = "data-row";

    const main = document.createElement("div");
    main.className = "row-main";

    const title = document.createElement("div");
    title.className = "data-title";
    title.textContent = ext.name || "Extension";

    const meta = document.createElement("div");
    meta.className = "data-meta";
    meta.textContent = `v${ext.version || "?"} • ${ext.path}`;

    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "data-buttons";
    actions.appendChild(
      makeButton("Remove", () => window.vellura.removeExtension(ext.id, ext.path))
    );

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
    sub.textContent = profile.current ? "Current profile" : "Open this profile";

    meta.append(name, sub);

    const check = document.createElement("span");
    check.textContent = profile.current ? "✓" : "›";
    check.style.color = "#92a6c0";

    option.append(avatar, meta, check);

    option.addEventListener("click", () => {
      if (!profile.current) window.vellura.switchProfile(profile.id);
      else closeProfile();
    });

    profileList.appendChild(option);
  }
}

function renderSettings(settings) {
  panelBody.replaceChildren();
  panelToolbar.classList.remove("hidden");

  const save = makeButton("Save settings", () => {
    window.vellura.updateSettings({
      searchEngine: $("searchEngineSelect").value
    });
  });
  panelToolbar.replaceChildren(save);

  const wrapper = document.createElement("div");
  wrapper.className = "data-row";

  const label = document.createElement("div");
  label.className = "row-main";

  const title = document.createElement("div");
  title.className = "data-title";
  title.textContent = "Search engine";

  const select = document.createElement("select");
  select.id = "searchEngineSelect";
  select.style.cssText =
    "margin-top:8px;width:min(320px,100%);height:36px;border:1px solid #344a67;border-radius:8px;background:#121c2a;color:#e8f0fc;padding:0 8px;outline:0";

  for (const [value, text] of [
    ["google", "Google"],
    ["bing", "Bing"],
    ["duckduckgo", "DuckDuckGo"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    if (settings.searchEngine === value) option.selected = true;
    select.appendChild(option);
  }

  label.append(title, select);

  const info = document.createElement("div");
  info.className = "row-main";
  info.style.marginTop = "14px";

  const infoTitle = document.createElement("div");
  infoTitle.className = "data-title";
  infoTitle.textContent = "Rendering engine";

  const infoValue = document.createElement("div");
  infoValue.className = "data-meta";
  infoValue.textContent = "Chromium through Electron";

  info.append(infoTitle, infoValue);

  wrapper.append(label);
  panelBody.append(wrapper, info);
}

function openHistoryPanel() {
  openPanel("History", "Pages you visited");
  window.vellura.openPanelData("history");
}

function openDownloadsPanel() {
  openPanel("Downloads", "Files downloaded in Vellura");
  window.vellura.openPanelData("downloads");
}

function openBookmarksPanel() {
  openPanel("Bookmarks", "Saved pages");
  window.vellura.openPanelData("bookmarks");
}

function openExtensionsPanel() {
  openPanel("Extensions", "Manage unpacked extensions");
  window.vellura.openPanelData("extensions");
}

function openProfilesPanel() {
  profilePanel.classList.remove("hidden");
  menuPanel.classList.add("hidden");
  window.vellura.listProfiles();
}

function runMenuAction(action) {
  if (action === "new-tab") {
    closeMenu();
    window.vellura.newTab();
  }
  else if (action === "new-window") {
    closeMenu();
    window.vellura.newWindow();
  }
  else if (action === "private-window") {
    closeMenu();
    window.vellura.newPrivateWindow();
  }
  else if (action === "history") openHistoryPanel();
  else if (action === "downloads") openDownloadsPanel();
  else if (action === "bookmarks") openBookmarksPanel();
  else if (action === "extensions") openExtensionsPanel();
  else if (action === "save-page") {
    window.vellura.savePage();
    closeMenu();
  }
  else if (action === "print") {
    window.vellura.print();
    closeMenu();
  }
  else if (action === "find") {
    requestFind();
    closeMenu();
  }
  else if (action === "cast") {
    showToast("Cast discovery is not exposed by Electron's browser API yet.");
    closeMenu();
  }
  else if (action === "devtools") {
    window.vellura.devtools();
    closeMenu();
  }
  else if (action === "fullscreen") {
    window.vellura.fullscreen();
    closeMenu();
  }
  else if (action === "clear-data") {
    closeMenu();
    if (confirm("Clear Vellura browsing history, cookies and site storage for this profile?")) {
      window.vellura.clearData();
    }
  }
  else if (action === "settings") {
    openPanel("Settings", "Vellura browser configuration");
    window.vellura.getSettings();
  }
  else if (action === "help") {
    openPanel("Help & Support", "Vellura browser shortcuts");
    panelBody.innerHTML = `
      <div class="data-row"><div class="row-main">
        <div class="data-title">Navigation</div>
        <div class="data-meta">Ctrl+L address bar • Alt+Left/Right back/forward • F5 reload</div>
      </div></div>
      <div class="data-row"><div class="row-main">
        <div class="data-title">Tabs</div>
        <div class="data-meta">Ctrl+T new • Ctrl+W close • Ctrl+Shift+T reopen • Ctrl+Tab switch</div>
      </div></div>
      <div class="data-row"><div class="row-main">
        <div class="data-title">Zoom</div>
        <div class="data-meta">Ctrl+= or Ctrl++ zoom in • Ctrl+- zoom out • Ctrl+0 reset</div>
      </div></div>
      <div class="data-row"><div class="row-main">
        <div class="data-title">Browser tools</div>
        <div class="data-meta">Ctrl+H history • Ctrl+J downloads • Ctrl+Shift+B bookmarks • Ctrl+Shift+A extensions</div>
      </div></div>
    `;
  }
}

function requestFind() {
  const value = prompt("Find in page:");
  if (value !== null) window.vellura.find(value);
}

addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  window.vellura.navigate(normalizeAddress(addressBar.value));
  addressBar.blur();
});

backButton.addEventListener("click", () => window.vellura.goBack());
forwardButton.addEventListener("click", () => window.vellura.goForward());
reloadButton.addEventListener("click", () => window.vellura.reload());
newTabButton.addEventListener("click", () => window.vellura.newTab());
bookmarkButton.addEventListener("click", () => window.vellura.toggleBookmark());
menuButton.addEventListener("click", toggleMenu);
profileButton.addEventListener("click", toggleProfile);
$("profileClose").addEventListener("click", closeProfile);
panelClose.addEventListener("click", closePanel);
$("zoomOutButton").addEventListener("click", () => window.vellura.changeZoom(-0.1));
$("zoomInButton").addEventListener("click", () => window.vellura.changeZoom(0.1));
$("zoomResetButton").addEventListener("click", () => window.vellura.resetZoom());

$("createProfileButton").addEventListener("click", () => {
  const value = $("newProfileName").value.trim();
  if (value) {
    window.vellura.createProfile(value);
    $("newProfileName").value = "";
  }
});

$("newProfileName").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("createProfileButton").click();
});

$("minimizeButton").addEventListener("click", () => window.vellura.minimizeWindow());
maximizeButton.addEventListener("click", () => window.vellura.maximizeWindow());
$("closeButton").addEventListener("click", () => window.vellura.closeWindow());

menuPanel.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  runMenuAction(actionButton.dataset.action);
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    addressBar.focus();
    addressBar.select();
  }

  if (event.key === "Escape") {
    closeMenu();
    closeProfile();
    closePanel();
    permissionDialog.classList.add("hidden");
    syncOverlay();
  }

  if (event.ctrlKey && event.shiftKey && event.key === "0") {
    event.preventDefault();
    window.vellura.repairUIZoom();
  }
});

window.vellura.onTabsUpdated(renderTabs);

window.vellura.onNavigationState((state) => {
  currentURL = state.url || "";
  currentTitle = state.title || "New Tab";

  addressBar.value = currentURL;
  backButton.disabled = !state.canGoBack;
  forwardButton.disabled = !state.canGoForward;
  reloadIcon.textContent = state.loading ? "×" : "↻";

  updateSecurity(currentURL);
  updateBookmark(state.bookmarked);
  updateZoom(state.zoom);
});

window.vellura.onURLChanged((url) => {
  currentURL = url || "";
  if (document.activeElement !== addressBar) addressBar.value = currentURL;
  updateSecurity(currentURL);
});

window.vellura.onTitleChanged((title) => {
  currentTitle = title || "New Tab";
  document.title = currentProfile.private
    ? `${currentTitle} — Vellura Private`
    : `${currentTitle} — Vellura`;
});

window.vellura.onAddressFocus(() => {
  addressBar.focus();
  addressBar.select();
});

window.vellura.onFindRequest(requestFind);

window.vellura.onClearDataConfirm(() => {
  if (confirm("Clear Vellura browsing history, cookies and site storage for this profile?")) {
    window.vellura.clearData();
  }
});

window.vellura.onPanelOpen(({ title, subtitle }) => {
  openPanel(title, subtitle);
});

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
  $("profileStatus").textContent =
    profile.private ? "Private browser window" : "Your Vellura profile";

  $("menuSubtitle").textContent =
    profile.private ? "Private browsing." : "Browse beyond.";

  $("privateBadge").classList.toggle("hidden", !profile.private);
});

window.vellura.onWindowMaximized((maximized) => {
  maximizeButton.textContent = maximized ? "❐" : "□";
});

window.vellura.onWindowFullscreen((fullscreen) => {
  document.body.classList.toggle("fullscreen", !!fullscreen);
});

window.vellura.onZoomChanged(updateZoom);

window.vellura.onProfilesOpen(openProfilesPanel);

window.vellura.onSettingsData(renderSettings);

window.vellura.onPermissionRequest((request) => {
  activePermission = request;
  $("permissionTitle").textContent = "Site permission request";
  permissionMessage.textContent =
    `${request.origin} is requesting permission for ${request.permission}.`;
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


document.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;

  const insideMenu = menuPanel.contains(event.target) || menuButton.contains(event.target);
  const insideProfile = profilePanel.contains(event.target) || profileButton.contains(event.target);
  const insidePanel = panel.contains(event.target);

  if (!insideMenu && !insideProfile && !insidePanel && !event.target.closest(".permission-dialog")) {
    if (!menuPanel.classList.contains("hidden")) closeMenu();
    if (!profilePanel.classList.contains("hidden")) closeProfile();
    if (!panel.classList.contains("hidden")) closePanel();
  }
});
