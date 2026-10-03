const { contextBridge, ipcRenderer } = require("electron");

function receive(channel, callback) {
  ipcRenderer.on(channel, (_event, payload) => callback(payload));
}

contextBridge.exposeInMainWorld("vellura", {
  navigate: (url) => ipcRenderer.send("browser:navigate", url),
  goBack: () => ipcRenderer.send("browser:back"),
  goForward: () => ipcRenderer.send("browser:forward"),
  reload: () => ipcRenderer.send("browser:reload"),

  changeZoom: (delta) => ipcRenderer.send("browser:zoom", delta),
  resetZoom: () => ipcRenderer.send("browser:zoom-reset"),
  find: (text) => ipcRenderer.send("browser:find", text),
  print: () => ipcRenderer.send("browser:print"),
  savePage: () => ipcRenderer.send("browser:save-page"),
  devtools: () => ipcRenderer.send("browser:devtools"),
  fullscreen: () => ipcRenderer.send("browser:fullscreen"),
  setUIOverlay: (isOpen) => ipcRenderer.send("ui:overlay", !!isOpen),
  repairUIZoom: () => ipcRenderer.send("browser:repair-ui-zoom"),

  newTab: (url) => ipcRenderer.send("tabs:new", url),
  activateTab: (id) => ipcRenderer.send("tabs:activate", id),
  closeTab: (id) => ipcRenderer.send("tabs:close", id),
  reopenTab: () => ipcRenderer.send("tabs:reopen"),
  tabAction: (action, id) => ipcRenderer.send("tabs:action", { action, id }),
  reorderTab: (id, beforeId) =>
    ipcRenderer.send("tabs:reorder", { id, beforeId }),

  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  maximizeWindow: () => ipcRenderer.send("window:maximize"),
  closeWindow: () => ipcRenderer.send("window:close"),
  newWindow: () => ipcRenderer.send("window:new"),
  newPrivateWindow: () => ipcRenderer.send("window:new-private"),

  toggleBookmark: () => ipcRenderer.send("bookmark:toggle"),
  removeBookmark: (id) => ipcRenderer.send("bookmark:remove", id),

  openPanelData: (panel) => ipcRenderer.send("panel:open-data", panel),

  pickExtension: () => ipcRenderer.invoke("extensions:pick"),
  removeExtension: (id, path) => ipcRenderer.send("extensions:remove", id, path),

  openDownload: (path) => ipcRenderer.send("download:open", path),
  showDownload: (path) => ipcRenderer.send("download:show", path),
  cancelDownload: (id) => ipcRenderer.send("download:cancel", id),
  pauseDownload: (id) => ipcRenderer.send("download:pause", id),
  resumeDownload: (id) => ipcRenderer.send("download:resume", id),

  openURL: (url) => ipcRenderer.send("browser:open-url", url),

  clearData: () => ipcRenderer.send("data:clear"),

  listProfiles: () => ipcRenderer.send("profile:list"),
  switchProfile: (id) => ipcRenderer.send("profile:switch", id),
  createProfile: (name) => ipcRenderer.send("profile:create", name),

  updateSettings: (patch) => ipcRenderer.send("settings:update", patch),
  getSettings: () => ipcRenderer.send("settings:get"),

  answerPermission: (id, allowed) =>
    ipcRenderer.send("permission:answer", id, allowed),

  exit: () => ipcRenderer.send("app:exit"),

  onTabsUpdated: (cb) => receive("tabs:updated", cb),
  onNavigationState: (cb) => receive("browser:navigation-state", cb),
  onURLChanged: (cb) => receive("browser:url-changed", cb),
  onTitleChanged: (cb) => receive("browser:title-changed", cb),

  onAddressFocus: (cb) => receive("address:focus", cb),
  onFindRequest: (cb) => receive("find:request", cb),
  onCommandPalette: (cb) => receive("command-palette:open", cb),
  onClearDataConfirm: (cb) => receive("clear-data:confirm", cb),

  onPanelOpen: (cb) => receive("panel:open", cb),
  onPanelHistory: (cb) => receive("panel:history", cb),
  onPanelDownloads: (cb) => receive("panel:downloads", cb),
  onPanelBookmarks: (cb) => receive("panel:bookmarks", cb),
  onPanelProfiles: (cb) => receive("panel:profiles", cb),
  onExtensionsUpdated: (cb) => receive("extensions:updated", cb),
  
  onProfile: (cb) => receive("window:profile", cb),
  onWindowMaximized: (cb) => receive("window:maximized", cb),
  onWindowFullscreen: (cb) => receive("window:fullscreen", cb),
  onZoomChanged: (cb) => receive("zoom:changed", cb),

  onProfilesOpen: (cb) => receive("profiles:open", cb),
  onSettingsData: (cb) => receive("settings:data", cb),
  onPermissionRequest: (cb) => receive("permission:request", cb),
  onToast: (cb) => receive("toast", cb)
});
