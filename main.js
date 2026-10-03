const {
  app,
  BaseWindow,
  WebContentsView,
  ipcMain,
  session,
  protocol,
  net,
  dialog,
  shell,
  Menu,
  clipboard,
  globalShortcut
} = require("electron");

const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "vellura",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

const APP_NAME = "Vellura";
const APP_ID = "com.vellura.browser";
const DEFAULT_PROFILE_ID = "default";
const START_PAGE = "vellura://newtab/";
const TOOLBAR_HEIGHT = 116;

let nextWindowId = 0;

const states = new Map();
const sessionOwners = new WeakMap();
const registeredSessions = new WeakSet();
const permissionRequests = new Map();

app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

function dataRoot() {
  return path.join(
    app.getPath("userData"),
    "profiles"
  );
}

function safeFileName(value) {
  return String(value)
    .replace(
      /[<>:"/\\|?*]/g,
      "_"
    )
    .slice(0, 80);
}

function readJSON(
  filePath,
  fallback
) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const parsed =
      JSON.parse(
        fs.readFileSync(
          filePath,
          "utf8"
        )
      );

    return parsed;
  } catch {
    return fallback;
  }
}

function writeJSON(
  filePath,
  value
) {
  try {
    fs.mkdirSync(
      path.dirname(filePath),
      {
        recursive: true
      }
    );

    fs.writeFileSync(
      filePath,
      JSON.stringify(
        value,
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // A failed preference write should not stop browsing.
  }
}

function profilesPath() {
  return path.join(
    app.getPath("userData"),
    "profiles.json"
  );
}

function loadProfiles() {
  const value =
    readJSON(
      profilesPath(),
      null
    );

  if (
    !Array.isArray(value) ||
    !value.length
  ) {
    const profiles = [
      {
        id:
          DEFAULT_PROFILE_ID,

        name:
          "Default",

        createdAt:
          new Date().toISOString()
      }
    ];

    writeJSON(
      profilesPath(),
      profiles
    );

    return profiles;
  }

  return value;
}

function saveProfiles(
  profiles
) {
  writeJSON(
    profilesPath(),
    profiles
  );
}

function getProfile(
  profileId
) {
  return (
    loadProfiles().find(
      (p) =>
        p.id ===
        profileId
    ) ||
    loadProfiles()[0]
  );
}

function profileDataDir(
  profileId
) {
  return path.join(
    dataRoot(),
    safeFileName(
      profileId
    )
  );
}

function createProfileStore(
  profileId
) {
  const dir =
    profileDataDir(
      profileId
    );

  return {
    id:
      profileId,

    dir,

    history:
      readJSON(
        path.join(
          dir,
          "history.json"
        ),
        []
      ),

    bookmarks:
      readJSON(
        path.join(
          dir,
          "bookmarks.json"
        ),
        []
      ),

    extensions:
      readJSON(
        path.join(
          dir,
          "extensions.json"
        ),
        []
      ),

    settings: {
      searchEngine:
        "google",

      startupPage:
        "vellura://newtab/",

      theme:
        "midnight",

      ...(
        readJSON(
          path.join(
            dir,
            "settings.json"
          ),
          {}
        ) || {}
      )
    }
  };
}

function persistProfileStore(
  store
) {
  writeJSON(
    path.join(
      store.dir,
      "history.json"
    ),
    store.history
  );

  writeJSON(
    path.join(
      store.dir,
      "bookmarks.json"
    ),
    store.bookmarks
  );

  writeJSON(
    path.join(
      store.dir,
      "extensions.json"
    ),
    store.extensions
  );

  writeJSON(
    path.join(
      store.dir,
      "settings.json"
    ),
    store.settings
  );
}

function searchBase(
  store
) {
  switch (
    store.settings.searchEngine
  ) {
    case "bing":
      return (
        "https://www.bing.com/search?q="
      );

    case "duckduckgo":
      return (
        "https://duckduckgo.com/?q="
      );

    case "google":
    default:
      return (
        "https://www.google.com/search?q="
      );
  }
}

function normalizeURL(
  input,
  store
) {
  const value =
    String(input || "")
      .trim();

  if (!value) {
    return (
      store?.settings?.startupPage ||
      START_PAGE
    );
  }

  if (
    /^vellura:\/\/newtab\/?$/i.test(
      value
    )
  ) {
    return "vellura://newtab/";
  }

  if (
    /^(https?|file):\/\//i.test(
      value
    )
  ) {
    return value;
  }

  if (
    value.includes(".") &&
    !value.includes(" ")
  ) {
    return `https://${value}`;
  }

  return (
    `${searchBase(store)}` +
    `${encodeURIComponent(value)}`
  );
}

function isInternalURL(
  url
) {
  return /^vellura:\/\//i.test(
    url || ""
  );
}

function findStateByWebContents(
  contents
) {
  for (
    const state of
    states.values()
  ) {
    if (
      state.uiView?.webContents ===
      contents
    ) {
      return state;
    }

    for (
      const tab of
      state.tabs.values()
    ) {
      if (
        tab.view.webContents ===
        contents
      ) {
        return state;
      }
    }
  }

  return null;
}

function trustedUI(event) {
  return findStateByWebContents(
    event.sender
  );
}

function activeTab(state) {
  return state.activeTabId
    ? state.tabs.get(
        state.activeTabId
      )
    : null;
}

/*
 * Find the Vellura window that currently
 * owns native keyboard focus.
 */
function getFocusedState() {
  for (
    const state of
    states.values()
  ) {
    if (
      state.window &&
      state.window.isFocused()
    ) {
      return state;
    }
  }

  return null;
}

function protocolRootFile(
  relative
) {
  return path.join(
    __dirname,
    "src",
    "pages",
    relative
  );
}

function registerVelluraProtocol(
  ses
) {
  if (
    registeredSessions.has(ses)
  ) {
    return;
  }

  ses.protocol.handle(
    "vellura",
    async (request) => {
      const requestURL =
        new URL(request.url);

      let filePath = null;

      let contentType =
        "text/plain; charset=utf-8";

      if (
        requestURL.hostname ===
        "newtab"
      ) {
        const pathname =
          requestURL.pathname ||
          "/";

        const allowed = {
          "/": [
            "newtab.html",
            "text/html; charset=utf-8"
          ],

          "/newtab.html": [
            "newtab.html",
            "text/html; charset=utf-8"
          ],

          "/newtab.css": [
            "newtab.css",
            "text/css; charset=utf-8"
          ],

          "/newtab.js": [
            "newtab.js",
            "application/javascript; charset=utf-8"
          ]
        };

        const entry =
          allowed[pathname];

        if (!entry) {
          return new Response(
            "Not Found",
            {
              status: 404
            }
          );
        }

        filePath =
          protocolRootFile(
            entry[0]
          );

        contentType =
          entry[1];
      } else if (
        requestURL.hostname ===
        "assets"
      ) {
        const pathname =
          requestURL.pathname ||
          "";

        const allowed = {
          "/vellura-logo.png": [
            "vellura-logo.png",
            "image/png"
          ]
        };

        const entry =
          allowed[pathname];

        if (!entry) {
          return new Response(
            "Not Found",
            {
              status: 404
            }
          );
        }

        filePath = path.join(
          __dirname,
          "assets",
          entry[0]
        );

        contentType =
          entry[1];
      } else {
        return new Response(
          "Not Found",
          {
            status: 404
          }
        );
      }

      return net.fetch(
        pathToFileURL(
          filePath
        ).toString(),
        {
          headers: {
            "Content-Type":
              contentType
          }
        }
      );
    }
  );

  registeredSessions.add(ses);
}

function sendTabs(state) {
  if (
    !state.uiView ||
    state.uiView.webContents.isDestroyed()
  ) {
    return;
  }

  const data =
    [
      ...state.tabs.values()
    ].map(
      (tab) => ({
        id:
          tab.id,

        title:
          tab.title ||
          "New Tab",

        url:
          tab.url ||
          START_PAGE,

        favicon:
          tab.favicon ||
          "",

        loading:
          !!tab.loading,

        active:
          tab.id ===
          state.activeTabId,

        private:
          state.isPrivate
      })
    );

  state.uiView.webContents.send(
    "tabs:updated",
    data
  );

  sendNavigationState(
    state
  );
}

function isBookmarked(
  state,
  url
) {
  return (
    !isInternalURL(url) &&
    state.store.bookmarks.some(
      (bookmark) =>
        bookmark.url ===
        url
    )
  );
}

function sendNavigationState(
  state
) {
  const tab =
    activeTab(state);

  if (
    !tab ||
    !state.uiView ||
    state.uiView.webContents.isDestroyed()
  ) {
    return;
  }

  const history =
    tab.view.webContents
      .navigationHistory;

  state.uiView.webContents.send(
    "browser:navigation-state",
    {
      tabId:
        tab.id,

      url:
        tab.url ||
        "",

      title:
        tab.title ||
        "New Tab",

      favicon:
        tab.favicon ||
        "",

      canGoBack:
        history.canGoBack(),

      canGoForward:
        history.canGoForward(),

      loading:
        !!tab.loading,

      zoom:
        Math.round(
          tab.view.webContents
            .getZoomFactor() *
          100
        ),

      bookmarked:
        isBookmarked(
          state,
          tab.url || ""
        )
    }
  );
}

function sendActiveURL(
  state
) {
  const tab =
    activeTab(state);

  if (
    !tab ||
    !state.uiView ||
    state.uiView.webContents.isDestroyed()
  ) {
    return;
  }

  state.uiView.webContents.send(
    "browser:url-changed",
    tab.url || ""
  );

  state.uiView.webContents.send(
    "browser:title-changed",
    tab.title ||
      "New Tab"
  );

  sendNavigationState(
    state
  );
}

/*
 * IMPORTANT:
 *
 * Keep the original uiOverlayOpen behavior.
 * This is required by the Vellura menu/panel system.
 *
 * Do not replace uiHeight with only
 * TOOLBAR_HEIGHT.
 */
function resizeState(state) {
  if (!state.window) {
    return;
  }

  const [
    width,
    height
  ] =
    state.window.getContentSize();

  const fullscreen =
    state.window.isFullScreen();

  const chromeHeight =
    fullscreen
      ? 0
      : TOOLBAR_HEIGHT;

  const uiHeight =
    fullscreen
      ? 0
      : (
          state.uiOverlayOpen
            ? height
            : TOOLBAR_HEIGHT
        );

  const pageHeight =
    Math.max(
      0,
      height -
        chromeHeight
    );

  if (state.uiView) {
    state.uiView.setBounds({
      x: 0,
      y: 0,
      width,
      height:
        uiHeight
    });

    state.uiView.setVisible(
      !fullscreen
    );
  }

  for (
    const tab of
    state.tabs.values()
  ) {
    tab.view.setBounds({
      x: 0,
      y: chromeHeight,
      width,
      height:
        pageHeight
    });
  }

  keepUIOnTop(
    state
  );

  state.uiView?.webContents.send(
    "window:fullscreen",
    fullscreen
  );
}

function keepUIOnTop(
  state
) {
  if (
    state.window &&
    state.uiView
  ) {
    state.window.contentView
      .addChildView(
        state.uiView
      );
  }
}

function setWindowStateUI(
  state
) {
  if (
    !state.uiView ||
    state.uiView.webContents.isDestroyed()
  ) {
    return;
  }

  state.uiView.webContents.send(
    "window:maximized",
    state.window.isMaximized()
  );

  state.uiView.webContents.send(
    "window:fullscreen",
    state.window.isFullScreen()
  );
}

function createPermissionHandlers(
  state
) {
  const ses =
    state.browserSession;

  if (
    sessionOwners.has(ses)
  ) {
    return;
  }

  sessionOwners.set(
    ses,
    true
  );

  ses.setPermissionCheckHandler(
    (
      webContents,
      permission,
      requestingOrigin
    ) => {
      const owner =
        findStateByWebContents(
          webContents
        );

      if (
        !owner ||
        (
          owner.isPrivate &&
          !webContents
        )
      ) {
        return false;
      }

      const key =
        `${requestingOrigin}|${permission}`;

      return (
        owner.permissions.get(
          key
        ) === true
      );
    }
  );

  ses.setPermissionRequestHandler(
    (
      webContents,
      permission,
      callback,
      details
    ) => {
      const owner =
        findStateByWebContents(
          webContents
        );

      if (
        !owner ||
        !owner.uiView
      ) {
        callback(false);
        return;
      }

      const origin =
        details?.requestingUrl ||
        details?.requestingOrigin ||
        webContents.getURL();

      const requestId =
        `permission-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

      const key =
        `${origin}|${permission}`;

      permissionRequests.set(
        requestId,
        {
          state:
            owner,

          callback,

          key
        }
      );

      owner.uiView.webContents.send(
        "permission:request",
        {
          id:
            requestId,

          permission,

          origin
        }
      );
    }
  );
}

function createContextMenuForTab(
  state,
  tab
) {
  tab.view.webContents.on(
    "context-menu",
    (_event, params) => {
      const template = [];

      if (
        params.isEditable
      ) {
        template.push(
          {
            role:
              "undo",

            enabled:
              params.editFlags.canUndo
          },

          {
            role:
              "redo",

            enabled:
              params.editFlags.canRedo
          },

          {
            type:
              "separator"
          },

          {
            role:
              "cut",

            enabled:
              params.editFlags.canCut
          },

          {
            role:
              "copy",

            enabled:
              params.editFlags.canCopy
          },

          {
            role:
              "paste",

            enabled:
              params.editFlags.canPaste
          },

          {
            type:
              "separator"
          }
        );
      } else if (
        params.selectionText
      ) {
        template.push({
          label:
            "Copy",

          enabled:
            params.editFlags.canCopy,

          click: () =>
            clipboard.writeText(
              params.selectionText
            )
        });

        template.push({
          type:
            "separator"
        });
      }

      if (
        params.linkURL
      ) {
        template.push({
          label:
            "Open link in new tab",

          click: () =>
            createTab(
              state,
              params.linkURL,
              true
            )
        });

        template.push({
          label:
            "Open link in new window",

          click: () =>
            createBrowserWindow({
              profileId:
                state.profile.id,

              isPrivate:
                false,

              initialURL:
                params.linkURL
            })
        });

        template.push({
          label:
            "Copy link address",

          click: () =>
            clipboard.writeText(
              params.linkURL
            )
        });

        template.push({
          type:
            "separator"
        });
      }

      template.push(
        {
          label:
            "Back",

          enabled:
            tab.view.webContents
              .navigationHistory
              .canGoBack(),

          click:
            () =>
              goBack(state)
        },

        {
          label:
            "Forward",

          enabled:
            tab.view.webContents
              .navigationHistory
              .canGoForward(),

          click:
            () =>
              goForward(state)
        },

        {
          label:
            "Reload",

          click:
            () =>
              reloadTab(
                state,
                tab
              )
        },

        {
          type:
            "separator"
        },

        {
          label:
            "Save page as…",

          click:
            () =>
              savePage(state)
        },

        {
          label:
            "Print…",

          click:
            () =>
              printPage(state)
        },

        {
          label:
            "Inspect",

          click:
            () =>
              tab.view.webContents
                .openDevTools({
                  mode:
                    "detach"
                })
        }
      );

      Menu
        .buildFromTemplate(
          template
        )
        .popup({
          window:
            state.window
        });
    }
  );
}

async function loadSavedExtensions(
  state
) {
  if (
    state.isPrivate ||
    !state.browserSession
      .isPersistent()
  ) {
    return;
  }

  for (
    const extPath of
    state.store.extensions
  ) {
    try {
      const loaded =
        state.browserSession
          .extensions
          .getAllExtensions();

      const alreadyLoaded =
        loaded.some(
          (ext) =>
            ext.path ===
            extPath
        );

      if (
        !alreadyLoaded &&
        fs.existsSync(
          extPath
        )
      ) {
        await state.browserSession
          .extensions
          .loadExtension(
            extPath,
            {
              allowFileAccess:
                true
            }
          );
      }
    } catch {
      state.uiView?.webContents.send(
        "toast",
        `Could not load extension: ${path.basename(
          extPath
        )}`
      );
    }
  }

  sendExtensions(
    state
  );
}

function extensionData(
  state
) {
  return state.browserSession
    .extensions
    .getAllExtensions()
    .map(
      (ext) => ({
        id:
          ext.id,

        name:
          ext.name,

        version:
          ext.version,

        path:
          ext.path,

        manifest:
          ext.manifest
      })
    );
}

function sendExtensions(
  state
) {
  state.uiView?.webContents.send(
    "extensions:updated",
    extensionData(state)
  );
}

async function installExtension(
  state,
  extensionPath
) {
  if (
    state.isPrivate
  ) {
    state.uiView?.webContents.send(
      "toast",
      "Extensions are disabled in private windows."
    );

    return;
  }

  try {
    if (
      !fs.existsSync(
        path.join(
          extensionPath,
          "manifest.json"
        )
      )
    ) {
      throw new Error(
        "The selected folder does not contain manifest.json."
      );
    }

    const loaded =
      await state.browserSession
        .extensions
        .loadExtension(
          extensionPath,
          {
            allowFileAccess:
              true
          }
        );

    if (
      !state.store.extensions.includes(
        extensionPath
      )
    ) {
      state.store.extensions.push(
        extensionPath
      );

      persistProfileStore(
        state.store
      );
    }

    state.uiView?.webContents.send(
      "toast",
      `Extension installed: ${loaded.name}`
    );

    sendExtensions(
      state
    );
  } catch (error) {
    state.uiView?.webContents.send(
      "toast",
      `Extension install failed: ${error.message}`
    );
  }
}

async function removeExtension(
  state,
  extensionId,
  extensionPath
) {
  try {
    state.browserSession
      .extensions
      .removeExtension(
        extensionId
      );

    state.store.extensions =
      state.store.extensions.filter(
        (p) =>
          p !==
          extensionPath
      );

    persistProfileStore(
      state.store
    );

    sendExtensions(
      state
    );
  } catch (error) {
    state.uiView?.webContents.send(
      "toast",
      `Could not remove extension: ${error.message}`
    );
  }
}

function addHistory(
  state,
  tab
) {
  if (
    state.isPrivate ||
    !tab?.url ||
    isInternalURL(
      tab.url
    )
  ) {
    return;
  }

  const entry = {
    id:
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    title:
      tab.title ||
      tab.url,

    url:
      tab.url,

    time:
      new Date().toISOString()
  };

  state.store.history = [
    entry,

    ...state.store.history.filter(
      (item) =>
        item.url !==
        tab.url
    )
  ].slice(
    0,
    2000
  );

  persistProfileStore(
    state.store
  );
}

function sendPanelData(
  state,
  panel
) {
  if (!state.uiView) {
    return;
  }

  if (
    panel ===
    "history"
  ) {
    state.uiView.webContents.send(
      "panel:history",
      state.store.history
    );
  } else if (
    panel ===
    "bookmarks"
  ) {
    state.uiView.webContents.send(
      "panel:bookmarks",
      state.store.bookmarks
    );
  } else if (
    panel ===
    "downloads"
  ) {
    state.uiView.webContents.send(
      "panel:downloads",
      [
        ...state.downloads.values()
      ]
    );
  } else if (
    panel ===
    "extensions"
  ) {
    sendExtensions(
      state
    );
  } else if (
    panel ===
    "profiles"
  ) {
    state.uiView.webContents.send(
      "panel:profiles",
      loadProfiles().map(
        (p) => ({
          ...p,

          current:
            p.id ===
            state.profile.id
        })
      )
    );
  }
}

function addBookmark(
  state
) {
  const tab =
    activeTab(state);

  if (
    !tab ||
    !tab.url ||
    isInternalURL(
      tab.url
    )
  ) {
    return;
  }

  const existing =
    state.store.bookmarks.find(
      (b) =>
        b.url ===
        tab.url
    );

  if (existing) {
    state.store.bookmarks =
      state.store.bookmarks.filter(
        (b) =>
          b.id !==
          existing.id
      );
  } else {
    state.store.bookmarks.unshift({
      id:
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      title:
        tab.title ||
        tab.url,

      url:
        tab.url,

      added:
        new Date().toISOString()
    });
  }

  persistProfileStore(
    state.store
  );

  sendTabs(
    state
  );

  sendActiveURL(
    state
  );

  state.uiView?.webContents.send(
    "toast",
    existing
      ? "Bookmark removed."
      : "Bookmark saved."
  );
}

function removeBookmark(
  state,
  id
) {
  state.store.bookmarks =
    state.store.bookmarks.filter(
      (b) =>
        b.id !==
        id
    );

  persistProfileStore(
    state.store
  );

  sendTabs(
    state
  );

  sendActiveURL(
    state
  );

  sendPanelData(
    state,
    "bookmarks"
  );
}

function registerDownloadTracking(
  state
) {
  const ses =
    state.browserSession;

  if (
    state.downloadHandlerAttached
  ) {
    return;
  }

  state.downloadHandlerAttached =
    true;

  ses.on(
    "will-download",
    (_event, item) => {
      const id =
        `download-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

      item.setSaveDialogOptions({
        defaultPath:
          path.join(
            app.getPath(
              "downloads"
            ),
            item.getFilename()
          )
      });

      const record = {
        id,

        filename:
          item.getFilename(),

        url:
          item.getURL(),

        state:
          "progressing",

        receivedBytes:
          0,

        totalBytes:
          item.getTotalBytes(),

        path:
          "",

        private:
          state.isPrivate
      };

      state.downloads.set(
        id,
        record
      );

      state.downloadItems.set(
        id,
        item
      );

      sendPanelData(
        state,
        "downloads"
      );

      item.on(
        "updated",
        (_event, status) => {
          record.state =
            status;

          record.receivedBytes =
            item.getReceivedBytes();

          record.totalBytes =
            item.getTotalBytes();

          record.path =
            item.getSavePath();

          sendPanelData(
            state,
            "downloads"
          );
        }
      );

      item.once(
        "done",
        (_event, status) => {
          record.state =
            status;

          record.receivedBytes =
            item.getReceivedBytes();

          record.totalBytes =
            item.getTotalBytes();

          record.path =
            item.getSavePath();

          sendPanelData(
            state,
            "downloads"
          );
        }
      );
    }
  );
}

function registerShortcuts(
  state,
  contents
) {
  contents.on(
    "before-input-event",
    (
      event,
      input
    ) => {
      if (
        input.type !==
        "keyDown"
      ) {
        return;
      }

      const key =
        String(
          input.key || ""
        );

      const lower =
        key.toLowerCase();

      const ctrl =
        !!input.control;

      const shift =
        !!input.shift;

      const alt =
        !!input.alt;

      /*
       * Escape always exits fullscreen.
       */
      if (
        state.window.isFullScreen() &&
        key === "escape"
      ) {
        event.preventDefault();

        state.window.setFullScreen(
          false
        );

        state.uiOverlayOpen =
          false;

        resizeState(
          state
        );

        setWindowStateUI(
          state
        );

        return;
      }

      /*
       * Ctrl + L
       */
      if (
        ctrl &&
        lower === "l"
      ) {
        event.preventDefault();

        keepUIOnTop(
          state
        );

        state.uiView?.webContents.focus();

        state.uiView?.webContents.send(
          "address:focus"
        );

        return;
      }

      /*
       * Ctrl + T
       */
      if (
        ctrl &&
        !shift &&
        lower === "t"
      ) {
        event.preventDefault();

        createTab(
          state,
          START_PAGE,
          true
        );

        return;
      }

      /*
       * Ctrl + W
       */
      if (
        ctrl &&
        !shift &&
        lower === "w"
      ) {
        event.preventDefault();

        closeActiveTab(
          state
        );

        return;
      }

      /*
       * Ctrl + N
       */
      if (
        ctrl &&
        !shift &&
        lower === "n"
      ) {
        event.preventDefault();

        createBrowserWindow({
          profileId:
            state.profile.id,

          isPrivate:
            false
        });

        return;
      }

      /*
       * Ctrl + Shift + N
       */
      if (
        ctrl &&
        shift &&
        lower === "n"
      ) {
        event.preventDefault();

        createBrowserWindow({
          profileId:
            state.profile.id,

          isPrivate:
            true
        });

        return;
      }

      /*
       * Ctrl + Shift + T
       */
      if (
        ctrl &&
        shift &&
        lower === "t"
      ) {
        event.preventDefault();

        reopenClosedTab(
          state
        );

        return;
      }

      /*
       * Ctrl + Tab
       */
      if (
        ctrl &&
        lower === "tab"
      ) {
        event.preventDefault();

        activateNextTab(
          state,
          shift
            ? -1
            : 1
        );

        return;
      }

      /*
       * Ctrl + 1 ... Ctrl + 9
       */
      if (
        ctrl &&
        !shift &&
        /^[1-9]$/.test(
          key
        )
      ) {
        event.preventDefault();

        const index =
          key === "9"
            ? state.tabs.size -
              1
            : Number(key) -
              1;

        activateTabByIndex(
          state,
          index
        );

        return;
      }

      /*
       * Ctrl + R
       */
      if (
        ctrl &&
        lower === "r"
      ) {
        event.preventDefault();

        reloadActiveTab(
          state
        );

        return;
      }

      /*
       * F5
       */
      if (
        !ctrl &&
        !alt &&
        key === "F5"
      ) {
        event.preventDefault();

        reloadActiveTab(
          state
        );

        return;
      }

      /*
       * Alt + Left
       */
      if (
        alt &&
        lower === "arrowleft"
      ) {
        event.preventDefault();

        goBack(
          state
        );

        return;
      }

      /*
       * Alt + Right
       */
      if (
        alt &&
        lower === "arrowright"
      ) {
        event.preventDefault();

        goForward(
          state
        );

        return;
      }

      /*
       * Zoom in
       *
       * Ctrl+=
       * Ctrl++
       * Numpad Add
       */
      if (
        ctrl &&
        (
          key === "=" ||
          key === "+" ||
          lower === "add" ||
          input.code ===
            "Equal" ||
          input.code ===
            "NumpadAdd"
        )
      ) {
        event.preventDefault();

        changeZoom(
          state,
          0.1
        );

        return;
      }

      /*
       * Zoom out
       */
      if (
        ctrl &&
        (
          lower === "-" ||
          lower === "subtract" ||
          input.code ===
            "Minus" ||
          input.code ===
            "NumpadSubtract"
        )
      ) {
        event.preventDefault();

        changeZoom(
          state,
          -0.1
        );

        return;
      }

      /*
       * Emergency UI zoom repair
       */
      if (
        ctrl &&
        shift &&
        key === "0"
      ) {
        event.preventDefault();

        state.uiView?.webContents
          .setZoomFactor(1);

        return;
      }

      /*
       * Ctrl + 0
       *
       * Reset webpage zoom.
       */
      if (
        ctrl &&
        key === "0"
      ) {
        event.preventDefault();

        resetZoom(
          state
        );

        return;
      }

      /*
       * Ctrl + D
       */
      if (
        ctrl &&
        !shift &&
        lower === "d"
      ) {
        event.preventDefault();

        addBookmark(
          state
        );

        return;
      }

      /*
       * Ctrl + H
       */
      if (
        ctrl &&
        lower === "h"
      ) {
        event.preventDefault();

        sendPanelData(
          state,
          "history"
        );

        state.uiView?.webContents.send(
          "panel:open",
          {
            title:
              "History",

            subtitle:
              "Pages you visited"
          }
        );

        return;
      }

      /*
       * Ctrl + J
       */
      if (
        ctrl &&
        lower === "j"
      ) {
        event.preventDefault();

        sendPanelData(
          state,
          "downloads"
        );

        state.uiView?.webContents.send(
          "panel:open",
          {
            title:
              "Downloads",

            subtitle:
              "Files downloaded in Vellura"
          }
        );

        return;
      }

      /*
       * Ctrl + Shift + B
       */
      if (
        ctrl &&
        shift &&
        lower === "b"
      ) {
        event.preventDefault();

        sendPanelData(
          state,
          "bookmarks"
        );

        state.uiView?.webContents.send(
          "panel:open",
          {
            title:
              "Bookmarks",

            subtitle:
              "Saved pages"
          }
        );

        return;
      }

      /*
       * Ctrl + F
       */
      if (
        ctrl &&
        lower === "f"
      ) {
        event.preventDefault();

        state.uiView?.webContents.send(
          "find:request"
        );

        return;
      }

      /*
       * Ctrl + P
       */
      if (
        ctrl &&
        lower === "p"
      ) {
        event.preventDefault();

        printPage(
          state
        );

        return;
      }

      /*
       * Ctrl + Shift + I
       */
      if (
        ctrl &&
        shift &&
        lower === "i"
      ) {
        event.preventDefault();

        getActiveTab(
          state
        )
          ?.view.webContents
          .openDevTools({
            mode:
              "detach"
          });

        return;
      }

      /*
       * Ctrl + Shift + A
       */
      if (
        ctrl &&
        shift &&
        lower === "a"
      ) {
        event.preventDefault();

        sendPanelData(
          state,
          "extensions"
        );

        state.uiView?.webContents.send(
          "panel:open",
          {
            title:
              "Extensions",

            subtitle:
              "Manage unpacked extensions"
          }
        );

        return;
      }

      /*
       * Ctrl + Shift + M
       */
      if (
        ctrl &&
        shift &&
        lower === "m"
      ) {
        event.preventDefault();

        sendPanelData(
          state,
          "profiles"
        );

        state.uiView?.webContents.send(
          "profiles:open"
        );

        return;
      }

      /*
       * Ctrl + Shift + Delete
       */
      if (
        ctrl &&
        shift &&
        key === "Delete"
      ) {
        event.preventDefault();

        state.uiView?.webContents.send(
          "clear-data:confirm"
        );

        return;
      }

      /*
       * F11
       *
       * This local handler remains for
       * renderer/web-content focus.
       *
       * There is also a global F11 handler
       * below for the case where the page
       * consumes the key.
       */
      if (
        !ctrl &&
        !alt &&
        key === "F11"
      ) {
        event.preventDefault();

        toggleFullscreen(
          state
        );
      }
    }
  );
}

function createTab(
  state,
  initialURL = START_PAGE,
  activate = true
) {
  const id =
    `tab-${++state.tabCounter}`;

  const tabSession =
    state.browserSession;

  const view =
    new WebContentsView({
      webPreferences: {
        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          true,

        session:
          tabSession
      }
    });

  const tab = {
    id,

    view,

    title:
      "New Tab",

    url:
      normalizeURL(
        initialURL,
        state.store
      ),

    favicon:
      "",

    loading:
      true
  };

  state.tabs.set(
    id,
    tab
  );

  state.window.contentView
    .addChildView(
      view
    );

  view.setVisible(
    false
  );

  registerShortcuts(
    state,
    view.webContents
  );

  createContextMenuForTab(
    state,
    tab
  );

  view.webContents.on(
    "did-start-loading",
    () => {
      tab.loading =
        true;

      sendTabs(
        state
      );
    }
  );

  view.webContents.on(
    "did-stop-loading",
    () => {
      tab.loading =
        false;

      tab.url =
        view.webContents
          .getURL();

      tab.title =
        view.webContents
          .getTitle() ||
        (
          isInternalURL(
            tab.url
          )
            ? "Vellura"
            : tab.url
        );

      sendTabs(
        state
      );

      if (
        tab.id ===
        state.activeTabId
      ) {
        sendActiveURL(
          state
        );

        state.window.setTitle(
          state.isPrivate
            ? `${tab.title} — Vellura Private`
            : `${tab.title} — Vellura`
        );
      }
    }
  );

  view.webContents.on(
    "did-navigate",
    (_event, url) => {
      tab.url =
        url;

      tab.title =
        view.webContents
          .getTitle() ||
        (
          isInternalURL(
            url
          )
            ? "Vellura"
            : tab.title
        );

      addHistory(
        state,
        tab
      );

      sendTabs(
        state
      );

      if (
        tab.id ===
        state.activeTabId
      ) {
        sendActiveURL(
          state
        );
      }
    }
  );

  view.webContents.on(
    "did-navigate-in-page",
    (_event, url) => {
      tab.url =
        url;

      sendTabs(
        state
      );

      if (
        tab.id ===
        state.activeTabId
      ) {
        sendActiveURL(
          state
        );
      }
    }
  );

  view.webContents.on(
    "page-title-updated",
    (
      event,
      title
    ) => {
      event.preventDefault();

      tab.title =
        title ||
        "New Tab";

      sendTabs(
        state
      );

      if (
        tab.id ===
        state.activeTabId
      ) {
        state.window.setTitle(
          state.isPrivate
            ? `${tab.title} — Vellura Private`
            : `${tab.title} — Vellura`
        );

        sendActiveURL(
          state
        );
      }
    }
  );

  view.webContents.on(
    "page-favicon-updated",
    (
      _event,
      favicons
    ) => {
      tab.favicon =
        favicons?.[0] ||
        "";

      sendTabs(
        state
      );
    }
  );

  view.webContents.on(
    "did-fail-load",
    (
      _event,
      code,
      description,
      url,
      isMainFrame
    ) => {
      if (
        !isMainFrame ||
        code === -3
      ) {
        return;
      }

      tab.loading =
        false;

      tab.title =
        "Page could not be loaded";

      state.uiView?.webContents.send(
        "toast",
        `${description || "Navigation failed"} (${code})`
      );

      sendTabs(
        state
      );

      if (
        tab.id ===
        state.activeTabId
      ) {
        sendActiveURL(
          state
        );
      }
    }
  );

  view.webContents.on(
    "render-process-gone",
    () => {
      tab.loading =
        false;

      tab.title =
        "Page crashed";

      sendTabs(
        state
      );
    }
  );

  view.webContents.setWindowOpenHandler(
    ({ url }) => {
      createTab(
        state,
        url,
        true
      );

      return {
        action:
          "deny"
      };
    }
  );

  view.webContents
    .loadURL(
      tab.url
    )
    .catch(() => {});

  if (activate) {
    activateTab(
      state,
      id
    );
  }

  resizeState(
    state
  );

  sendTabs(
    state
  );

  return id;
}

function activateTab(
  state,
  tabId
) {
  const target =
    state.tabs.get(
      tabId
    );

  if (!target) {
    return;
  }

  state.activeTabId =
    tabId;

  for (
    const tab of
    state.tabs.values()
  ) {
    tab.view.setVisible(
      tab.id === tabId
    );
  }

  keepUIOnTop(
    state
  );

  sendTabs(
    state
  );

  sendActiveURL(
    state
  );

  state.window.setTitle(
    state.isPrivate
      ? `${target.title || "New Tab"} — Vellura Private`
      : `${target.title || "New Tab"} — Vellura`
  );
}

function closeTab(
  state,
  tabId
) {
  const tab =
    state.tabs.get(
      tabId
    );

  if (!tab) {
    return;
  }

  if (
    tab.url &&
    !isInternalURL(
      tab.url
    ) &&
    !state.isPrivate
  ) {
    state.closedTabs.push({
      url:
        tab.url,

      title:
        tab.title
    });

    while (
      state.closedTabs.length >
      30
    ) {
      state.closedTabs.shift();
    }
  }

  const wasActive =
    state.activeTabId ===
    tabId;

  state.window.contentView
    .removeChildView(
      tab.view
    );

  state.tabs.delete(
    tabId
  );

  if (
    !tab.view.webContents
      .isDestroyed()
  ) {
    tab.view.webContents.close();
  }

  if (
    state.tabs.size ===
    0
  ) {
    state.activeTabId =
      null;

    createTab(
      state,
      START_PAGE,
      true
    );

    return;
  }

  if (wasActive) {
    const ids =
      [
        ...state.tabs.keys()
      ];

    const index =
      Math.min(
        Math.max(
          0,
          ids.length - 1
        ),

        Math.max(
          0,
          ids.indexOf(
            tabId
          )
        )
      );

    activateTab(
      state,
      ids[index] ||
      ids[
        ids.length - 1
      ]
    );
  }

  resizeState(
    state
  );

  sendTabs(
    state
  );
}

function closeActiveTab(
  state
) {
  if (
    state.activeTabId
  ) {
    closeTab(
      state,
      state.activeTabId
    );
  }
}

function reopenClosedTab(
  state
) {
  if (
    !state.closedTabs.length
  ) {
    return;
  }

  const closed =
    state.closedTabs.pop();

  createTab(
    state,
    closed.url,
    true
  );
}

function activateNextTab(
  state,
  direction = 1
) {
  const ids =
    [
      ...state.tabs.keys()
    ];

  if (
    ids.length <
    2
  ) {
    return;
  }

  const index =
    ids.indexOf(
      state.activeTabId
    );

  activateTab(
    state,
    ids[
      (
        index +
        direction +
        ids.length
      ) %
      ids.length
    ]
  );
}

function activateTabByIndex(
  state,
  index
) {
  const ids =
    [
      ...state.tabs.keys()
    ];

  if (
    index >= 0 &&
    index <
      ids.length
  ) {
    activateTab(
      state,
      ids[index]
    );
  }
}

function goBack(
  state
) {
  const tab =
    activeTab(state);

  if (!tab) {
    return;
  }

  const history =
    tab.view.webContents
      .navigationHistory;

  if (
    history.canGoBack()
  ) {
    history.goBack();
  }
}

function goForward(
  state
) {
  const tab =
    activeTab(state);

  if (!tab) {
    return;
  }

  const history =
    tab.view.webContents
      .navigationHistory;

  if (
    history.canGoForward()
  ) {
    history.goForward();
  }
}

function reloadTab(
  state,
  tab
) {
  if (tab) {
    tab.view.webContents
      .reload();
  }
}

function reloadActiveTab(
  state
) {
  reloadTab(
    state,
    activeTab(state)
  );
}

function changeZoom(
  state,
  delta
) {
  const tab =
    activeTab(state);

  if (!tab) {
    return;
  }

  const current =
    tab.view.webContents
      .getZoomFactor();

  const next =
    Math.round(
      Math.max(
        0.25,
        Math.min(
          5,
          current + delta
        )
      ) * 10
    ) / 10;

  tab.view.webContents
    .setZoomFactor(
      next
    );

  sendNavigationState(
    state
  );

  state.uiView?.webContents.send(
    "zoom:changed",
    Math.round(
      next * 100
    )
  );
}

function resetZoom(
  state
) {
  const tab =
    activeTab(state);

  if (!tab) {
    return;
  }

  tab.view.webContents
    .setZoomFactor(
      1
    );

  sendNavigationState(
    state
  );

  state.uiView?.webContents.send(
    "zoom:changed",
    100
  );
}

async function savePage(
  state
) {
  const tab =
    activeTab(state);

  if (
    !tab ||
    isInternalURL(
      tab.url
    )
  ) {
    return;
  }

  const result =
    await dialog.showSaveDialog(
      state.window,
      {
        title:
          "Save page",

        defaultPath:
          path.join(
            app.getPath(
              "downloads"
            ),

            `${safeFileName(
              tab.title ||
              "Vellura page"
            )}.html`
          ),

        filters: [
          {
            name:
              "HTML page",

            extensions: [
              "html"
            ]
          },

          {
            name:
              "MHTML page",

            extensions: [
              "mhtml"
            ]
          }
        ]
      }
    );

  if (
    result.canceled ||
    !result.filePath
  ) {
    return;
  }

  try {
    const saveType =
      result.filePath
        .toLowerCase()
        .endsWith(
          ".mhtml"
        )
        ? "MHTML"
        : "HTMLComplete";

    await tab.view.webContents
      .savePage(
        result.filePath,
        saveType
      );

    state.uiView?.webContents.send(
      "toast",
      "Page saved successfully."
    );
  } catch (
    error
  ) {
    state.uiView?.webContents.send(
      "toast",
      `Could not save page: ${error.message}`
    );
  }
}

function printPage(
  state
) {
  const tab =
    activeTab(state);

  if (!tab) {
    return;
  }

  tab.view.webContents.print(
    {},
    (
      _success,
      reason
    ) => {
      if (reason) {
        state.uiView?.webContents.send(
          "toast",
          `Print failed: ${reason}`
        );
      }
    }
  );
}

/*
 * Fullscreen toggle.
 *
 * Keep menu overlay state intact elsewhere.
 */
function toggleFullscreen(
  state
) {
  state.uiOverlayOpen =
    false;

  const next =
    !state.window.isFullScreen();

  state.window.setFullScreen(
    next
  );

  /*
   * Wait until Electron has updated
   * the native fullscreen state.
   */
  setTimeout(
    () => {
      if (!state.window) {
        return;
      }

      resizeState(
        state
      );

      setWindowStateUI(
        state
      );
    },
    0
  );
}

function clearBrowsingData(
  state
) {
  state.store.history =
    [];

  persistProfileStore(
    state.store
  );

  state.browserSession
    .clearCache()
    .catch(() => {});

  state.browserSession
    .clearStorageData({
      storages: [
        "appcache",
        "cookies",
        "filesystem",
        "indexdb",
        "localstorage",
        "serviceworkers",
        "cachestorage",
        "websql"
      ]
    })
    .then(
      () => {
        state.uiView?.webContents.send(
          "toast",
          "Browsing data cleared."
        );

        sendPanelData(
          state,
          "history"
        );
      }
    )
    .catch(
      (error) => {
        state.uiView?.webContents.send(
          "toast",
          `Could not clear data: ${error.message}`
        );
      }
    );
}

function openPath(
  state,
  filePath
) {
  if (!filePath) {
    return;
  }

  shell.openPath(
    filePath
  ).then(
    (error) => {
      if (error) {
        state.uiView?.webContents.send(
          "toast",
          error
        );
      }
    }
  );
}

function showInFolder(
  state,
  filePath
) {
  if (filePath) {
    shell.showItemInFolder(
      filePath
    );
  }
}

function createUI(
  state
) {
  state.uiPartition =
    `vellura-ui-${state.id}`;

  state.uiSession =
    session.fromPartition(
      state.uiPartition
    );

  state.uiView =
    new WebContentsView({
      webPreferences: {
        preload:
          path.join(
            __dirname,
            "preload.js"
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          true,

        session:
          state.uiSession
      }
    });

  /*
   * Keep browser chrome at 100%.
   */
  state.uiView.webContents
    .setZoomFactor(
      1
    );

  state.uiView.webContents
    .setVisualZoomLevelLimits(
      1,
      1
    )
    .catch(
      () => {}
    );

  state.window.contentView
    .addChildView(
      state.uiView
    );

  registerShortcuts(
    state,
    state.uiView.webContents
  );

  state.uiView.webContents.on(
    "will-navigate",
    (event) => {
      event.preventDefault();
    }
  );

  state.uiView.webContents.on(
    "did-finish-load",
    () => {
      /*
       * Repair any old Vellura UI
       * zoom immediately on launch.
       */
      state.uiView.webContents
        .setZoomFactor(
          1
        );

      state.uiView.webContents.send(
        "window:profile",
        {
          id:
            state.profile.id,

          name:
            state.profile.name,

          private:
            state.isPrivate
        }
      );

      sendTabs(
        state
      );

      sendActiveURL(
        state
      );

      sendPanelData(
        state,
        "extensions"
      );

      setWindowStateUI(
        state
      );
    }
  );

  state.uiView.webContents
    .loadFile(
      path.join(
        __dirname,
        "src",
        "index.html"
      ),
      {
        query: {
          private:
            state.isPrivate
              ? "1"
              : "0"
        }
      }
    );
}

function createBrowserWindow(
  {
    profileId =
      DEFAULT_PROFILE_ID,

    isPrivate =
      false,

    initialURL =
      null
  } = {}
) {
  const profile =
    getProfile(
      profileId
    );

  const state = {
    id:
      ++nextWindowId,

    window:
      null,

    uiView:
      null,

    tabs:
      new Map(),

    activeTabId:
      null,

    tabCounter:
      0,

    closedTabs:
      [],

    downloads:
      new Map(),

    downloadItems:
      new Map(),

    isPrivate,

    profile,

    store:
      isPrivate
        ? {
            id:
              `private-${nextWindowId}`,

            dir:
              null,

            history:
              [],

            bookmarks:
              [],

            extensions:
              [],

            settings: {
              searchEngine:
                "google",

              startupPage:
                START_PAGE,

              theme:
                "midnight"
            }
          }
        : createProfileStore(
            profile.id
          ),

    permissions:
      new Map(),

    browserPartition:
      isPrivate
        ? `vellura-incognito-${nextWindowId}`
        : `persist:vellura-profile-${profile.id}`,

    browserSession:
      null,

    downloadHandlerAttached:
      false,

    /*
     * Keep this property.
     *
     * The menu/panels use it so the UI
     * view can expand over the browser.
     */
    uiOverlayOpen:
      false
  };

  state.browserSession =
    session.fromPartition(
      state.browserPartition
    );

  registerVelluraProtocol(
    state.browserSession
  );

  createPermissionHandlers(
    state
  );

  state.window =
    new BaseWindow({
      width:
        1480,

      height:
        940,

      minWidth:
        920,

      minHeight:
        620,

      title:
        isPrivate
          ? "Vellura Private"
          : APP_NAME,

      icon:
        path.join(
          __dirname,
          "assets",
          "vellura.ico"
        ),

      backgroundColor:
        "#070a12",

      frame:
        false,

      thickFrame:
        true,

      resizable:
        true,

      maximizable:
        true,

      minimizable:
        true,

      movable:
        true,

      show:
        true,

      name:
        `Vellura-${state.id}`,

      windowStatePersistence: {
        enabled:
          true,

        bounds: {
          width:
            1480,

          height:
            940
        }
      }
    });

  state.window.accessibleTitle =
    isPrivate
      ? "Vellura Private browser"
      : "Vellura browser";

  states.set(
    state.id,
    state
  );

  createUI(
    state
  );

  registerDownloadTracking(
    state
  );

  state.window.on(
    "resize",
    () => {
      resizeState(
        state
      );
    }
  );

  state.window.on(
    "maximize",
    () => {
      setWindowStateUI(
        state
      );

      resizeState(
        state
      );
    }
  );

  state.window.on(
    "unmaximize",
    () => {
      setWindowStateUI(
        state
      );

      resizeState(
        state
      );
    }
  );

  state.window.on(
    "enter-full-screen",
    () => {
      setWindowStateUI(
        state
      );

      resizeState(
        state
      );
    }
  );

  state.window.on(
    "leave-full-screen",
    () => {
      setWindowStateUI(
        state
      );

      resizeState(
        state
      );
    }
  );

  state.window.on(
    "closed",
    () => {
      for (
        const tab of
        state.tabs.values()
      ) {
        if (
          !tab.view.webContents
            .isDestroyed()
        ) {
          tab.view.webContents
            .close();
        }
      }

      state.tabs.clear();

      if (
        state.uiView &&
        !state.uiView.webContents
          .isDestroyed()
      ) {
        state.uiView.webContents
          .close();
      }

      states.delete(
        state.id
      );
    }
  );

  /*
   * Restore extensions every launch
   * for persistent profiles.
   */
  loadSavedExtensions(
    state
  ).catch(
    () => {}
  );

  createTab(
    state,

    initialURL ||
      state.store.settings.startupPage ||
      START_PAGE,

    true
  );

  resizeState(
    state
  );

  return state;
}

// ------------------------------------------------------------------
// IPC
// ------------------------------------------------------------------

/*
 * Keep this IPC handler.
 *
 * The Vellura menu uses it to tell the
 * main process that an overlay is open.
 */
ipcMain.on(
  "ui:overlay",
  (
    event,
    isOpen
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    state.uiOverlayOpen =
      !!isOpen;

    resizeState(
      state
    );
  }
);

/*
 * Repair browser chrome zoom.
 */
ipcMain.on(
  "browser:repair-ui-zoom",
  (event) => {
    const state =
      trustedUI(event);

    if (
      !state ||
      !state.uiView
    ) {
      return;
    }

    state.uiView.webContents
      .setZoomFactor(
        1
      );

    state.uiView.webContents.send(
      "toast",
      "Vellura interface restored to 100%."
    );
  }
);

/*
 * Navigate.
 */
ipcMain.on(
  "browser:navigate",
  (
    event,
    value
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    const tab =
      activeTab(state);

    if (!tab) {
      return;
    }

    const url =
      normalizeURL(
        value,
        state.store
      );

    tab.loading =
      true;

    tab.url =
      url;

    sendTabs(
      state
    );

    tab.view.webContents
      .loadURL(
        url
      )
      .catch(
        () => {}
      );
  }
);

/*
 * Back.
 */
ipcMain.on(
  "browser:back",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      goBack(
        state
      );
    }
  }
);

/*
 * Forward.
 */
ipcMain.on(
  "browser:forward",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      goForward(
        state
      );
    }
  }
);

/*
 * Reload.
 */
ipcMain.on(
  "browser:reload",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      reloadActiveTab(
        state
      );
    }
  }
);

/*
 * Page zoom.
 */
ipcMain.on(
  "browser:zoom",
  (
    event,
    delta
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      changeZoom(
        state,
        Number(delta) ||
          0
      );
    }
  }
);

/*
 * Reset page zoom.
 */
ipcMain.on(
  "browser:zoom-reset",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      resetZoom(
        state
      );
    }
  }
);

/*
 * Find in page.
 */
ipcMain.on(
  "browser:find",
  (
    event,
    text
  ) => {
    const state =
      trustedUI(event);

    const tab =
      state
        ? activeTab(state)
        : null;

    if (!tab) {
      return;
    }

    if (!text) {
      tab.view.webContents
        .stopFindInPage(
          "clearSelection"
        );
    } else {
      tab.view.webContents
        .findInPage(
          String(text)
        );
    }
  }
);

/*
 * Print.
 */
ipcMain.on(
  "browser:print",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      printPage(
        state
      );
    }
  }
);

/*
 * Save page.
 */
ipcMain.on(
  "browser:save-page",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      savePage(
        state
      );
    }
  }
);

/*
 * DevTools.
 */
ipcMain.on(
  "browser:devtools",
  (event) => {
    const state =
      trustedUI(event);

    const tab =
      state
        ? activeTab(state)
        : null;

    if (tab) {
      tab.view.webContents
        .openDevTools({
          mode:
            "detach"
        });
    }
  }
);

/*
 * Fullscreen.
 */
ipcMain.on(
  "browser:fullscreen",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      toggleFullscreen(
        state
      );
    }
  }
);

/*
 * New tab.
 */
ipcMain.on(
  "tabs:new",
  (
    event,
    url
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      createTab(
        state,

        url ||
          START_PAGE,

        true
      );
    }
  }
);

/*
 * Activate tab.
 */
ipcMain.on(
  "tabs:activate",
  (
    event,
    id
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      activateTab(
        state,
        id
      );
    }
  }
);

/*
 * Close tab.
 */
ipcMain.on(
  "tabs:close",
  (
    event,
    id
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      closeTab(
        state,
        id
      );
    }
  }
);

/*
 * Reopen closed tab.
 */
ipcMain.on(
  "tabs:reopen",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      reopenClosedTab(
        state
      );
    }
  }
);

/*
 * Minimize window.
 */
ipcMain.on(
  "window:minimize",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      state.window.minimize();
    }
  }
);

/*
 * Maximize / restore.
 */
ipcMain.on(
  "window:maximize",
  (event) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    if (
      state.window.isMaximized()
    ) {
      state.window.unmaximize();
    } else {
      state.window.maximize();
    }

    setWindowStateUI(
      state
    );

    resizeState(
      state
    );
  }
);

/*
 * Close.
 */
ipcMain.on(
  "window:close",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      state.window.close();
    }
  }
);

/*
 * New normal window.
 */
ipcMain.on(
  "window:new",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      createBrowserWindow({
        profileId:
          state.profile.id,

        isPrivate:
          false
      });
    }
  }
);

/*
 * New private window.
 */
ipcMain.on(
  "window:new-private",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      createBrowserWindow({
        profileId:
          state.profile.id,

        isPrivate:
          true
      });
    }
  }
);

/*
 * Bookmark toggle.
 */
ipcMain.on(
  "bookmark:toggle",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      addBookmark(
        state
      );
    }
  }
);

/*
 * Remove bookmark.
 */
ipcMain.on(
  "bookmark:remove",
  (
    event,
    id
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      removeBookmark(
        state,
        id
      );
    }
  }
);

/*
 * Open data panel.
 */
ipcMain.on(
  "panel:open-data",
  (
    event,
    panel
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    sendPanelData(
      state,
      panel
    );

    const labels = {
      history: [
        "History",
        "Pages you visited"
      ],

      downloads: [
        "Downloads",
        "Files downloaded in Vellura"
      ],

      bookmarks: [
        "Bookmarks",
        "Saved pages"
      ],

      extensions: [
        "Extensions",
        "Manage unpacked extensions"
      ],

      profiles: [
        "Profiles",
        "Switch or create browser profiles"
      ]
    };

    const [
      title,
      subtitle
    ] =
      labels[panel] ||
      [
        panel,
        ""
      ];

    state.uiView.webContents.send(
      "panel:open",
      {
        title,
        subtitle
      }
    );
  }
);

/*
 * Pick extension.
 */
ipcMain.handle(
  "extensions:pick",
  async (event) => {
    const state =
      trustedUI(event);

    if (
      !state ||
      state.isPrivate
    ) {
      return {
        canceled:
          true
      };
    }

    const result =
      await dialog.showOpenDialog(
        state.window,
        {
          title:
            "Select an unpacked extension folder",

          properties: [
            "openDirectory"
          ]
        }
      );

    if (
      result.canceled ||
      !result.filePaths[0]
    ) {
      return {
        canceled:
          true
      };
    }

    await installExtension(
      state,
      result.filePaths[0]
    );

    return {
      canceled:
        false
    };
  }
);

/*
 * Remove extension.
 */
ipcMain.on(
  "extensions:remove",
  async (
    event,
    id,
    extensionPath
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      await removeExtension(
        state,
        id,
        extensionPath
      );
    }
  }
);

/*
 * Open download.
 */
ipcMain.on(
  "download:open",
  (
    event,
    filePath
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      openPath(
        state,
        filePath
      );
    }
  }
);

/*
 * Show download in Explorer.
 */
ipcMain.on(
  "download:show",
  (
    event,
    filePath
  ) => {
    const state =
      trustedUI(event);

    if (state) {
      showInFolder(
        state,
        filePath
      );
    }
  }
);

/*
 * Cancel download.
 */
ipcMain.on(
  "download:cancel",
  (
    event,
    id
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    const item =
      state.downloadItems.get(
        id
      );

    if (item) {
      item.cancel();
    }
  }
);

/*
 * Pause download.
 */
ipcMain.on(
  "download:pause",
  (
    event,
    id
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    const item =
      state.downloadItems.get(
        id
      );

    if (
      item &&
      !item.isPaused()
    ) {
      item.pause();
    }
  }
);

/*
 * Resume download.
 */
ipcMain.on(
  "download:resume",
  (
    event,
    id
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    const item =
      state.downloadItems.get(
        id
      );

    if (
      item &&
      item.canResume()
    ) {
      item.resume();
    }
  }
);

/*
 * Open URL from browser data panels.
 */
ipcMain.on(
  "browser:open-url",
  (
    event,
    url
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    const tab =
      activeTab(state);

    if (tab) {
      tab.view.webContents
        .loadURL(
          normalizeURL(
            url,
            state.store
          )
        )
        .catch(
          () => {}
        );
    }
  }
);

/*
 * Clear browser data.
 */
ipcMain.on(
  "data:clear",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      clearBrowsingData(
        state
      );
    }
  }
);

/*
 * List profiles.
 */
ipcMain.on(
  "profile:list",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      sendPanelData(
        state,
        "profiles"
      );
    }
  }
);

/*
 * Switch profile.
 */
ipcMain.on(
  "profile:switch",
  (
    event,
    profileId
  ) => {
    const state =
      trustedUI(event);

    if (
      !state ||
      !profileId
    ) {
      return;
    }

    if (
      profileId ===
      state.profile.id
    ) {
      return;
    }

    createBrowserWindow({
      profileId,

      isPrivate:
        false
    });
  }
);

/*
 * Create profile.
 */
ipcMain.on(
  "profile:create",
  (
    event,
    name
  ) => {
    const state =
      trustedUI(event);

    if (!state) {
      return;
    }

    const trimmed =
      String(name || "")
        .trim()
        .slice(
          0,
          40
        );

    if (!trimmed) {
      state.uiView.webContents.send(
        "toast",
        "Enter a profile name."
      );

      return;
    }

    const profiles =
      loadProfiles();

    const baseId =
      `profile-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

    const newProfile = {
      id:
        baseId,

      name:
        trimmed,

      createdAt:
        new Date().toISOString()
    };

    profiles.push(
      newProfile
    );

    saveProfiles(
      profiles
    );

    createBrowserWindow({
      profileId:
        newProfile.id,

      isPrivate:
        false
    });

    state.uiView.webContents.send(
      "toast",
      `Profile created: ${trimmed}`
    );

    sendPanelData(
      state,
      "profiles"
    );
  }
);

/*
 * Settings update.
 */
ipcMain.on(
  "settings:update",
  (
    event,
    patch
  ) => {
    const state =
      trustedUI(event);

    if (
      !state ||
      !patch ||
      typeof patch !==
        "object" ||
      state.isPrivate
    ) {
      return;
    }

    if (
      typeof patch.searchEngine ===
      "string"
    ) {
      if (
        [
          "google",
          "bing",
          "duckduckgo"
        ].includes(
          patch.searchEngine
        )
      ) {
        state.store.settings.searchEngine =
          patch.searchEngine;
      }
    }

    if (
      typeof patch.theme ===
        "string" &&
      patch.theme ===
        "midnight"
    ) {
      state.store.settings.theme =
        "midnight";
    }

    persistProfileStore(
      state.store
    );

    state.uiView.webContents.send(
      "settings:data",
      state.store.settings
    );

    state.uiView.webContents.send(
      "toast",
      "Settings saved."
    );
  }
);

/*
 * Get settings.
 */
ipcMain.on(
  "settings:get",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      state.uiView.webContents.send(
        "settings:data",
        state.store.settings
      );
    }
  }
);

/*
 * Answer site permission request.
 */
ipcMain.on(
  "permission:answer",
  (
    event,
    requestId,
    allowed
  ) => {
    const record =
      permissionRequests.get(
        requestId
      );

    if (!record) {
      return;
    }

    permissionRequests.delete(
      requestId
    );

    const allow =
      !!allowed;

    if (allow) {
      record.state.permissions.set(
        record.key,
        true
      );
    }

    record.callback(
      allow
    );
  }
);

/*
 * Exit application.
 */
ipcMain.on(
  "app:exit",
  (event) => {
    const state =
      trustedUI(event);

    if (state) {
      state.window.close();
    }
  }
);

/*
 * Application ready.
 */
app.whenReady().then(
  () => {
    /*
     * Global F11 handler.
     *
     * This is important because the renderer
     * or webpage can consume F11 before the
     * normal before-input-event handler sees it.
     */
    globalShortcut.register(
      "F11",
      () => {
        const state =
          getFocusedState();

        if (state) {
          toggleFullscreen(
            state
          );
        }
      }
    );

    createBrowserWindow({
      profileId:
        DEFAULT_PROFILE_ID,

      isPrivate:
        false
    });

    app.on(
      "activate",
      () => {
        if (
          BaseWindow
            .getAllWindows()
            .length ===
          0
        ) {
          createBrowserWindow({
            profileId:
              DEFAULT_PROFILE_ID,

            isPrivate:
              false
          });
        }
      }
    );
  }
);

/*
 * Clean up the global shortcut.
 */
app.on(
  "will-quit",
  () => {
    globalShortcut.unregister(
      "F11"
    );
  }
);

/*
 * Windows.
 */
app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);