const STORAGE_KEY = "vellura:newtab";
const COLORS = ["#7c5cff", "#1aaad1", "#27b382", "#ed7758", "#d14f8d", "#6587e8"];

const defaults = {
  theme: "midnight",
  shortcuts: [
    { name: "GitHub", url: "https://github.com", color: "#7c5cff" },
    { name: "YouTube", url: "https://youtube.com", color: "#ed5b61" },
    { name: "Gmail", url: "https://mail.google.com", color: "#d68b48" },
    { name: "Wikipedia", url: "https://wikipedia.org", color: "#6587e8" },
    { name: "Reddit", url: "https://reddit.com", color: "#ed7758" },
    { name: "Maps", url: "https://maps.google.com", color: "#27b382" }
  ]
};

const clock = document.querySelector("#clock");
const period = document.querySelector("#period");
const date = document.querySelector("#date");
const greeting = document.querySelector("#greeting");
const searchForm = document.querySelector("#searchForm");
const query = document.querySelector("#query");
const shortcutGrid = document.querySelector("#shortcutGrid");
const shortcutManager = document.querySelector("#shortcutManager");
const shortcutForm = document.querySelector("#shortcutForm");
const shortcutName = document.querySelector("#shortcutName");
const shortcutURL = document.querySelector("#shortcutURL");
const customizePanel = document.querySelector("#customizePanel");
const customizeButton = document.querySelector("#customizeButton");
const addShortcutButton = document.querySelector("#addShortcutButton");
const closeCustomizeButton = document.querySelector("#closeCustomize");
const panelScrim = document.querySelector("#panelScrim");

let preferences = loadPreferences();

function loadPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      theme: ["midnight", "aurora", "ember"].includes(stored?.theme)
        ? stored.theme
        : defaults.theme,
      shortcuts: Array.isArray(stored?.shortcuts)
        ? stored.shortcuts.slice(0, 12)
        : defaults.shortcuts
    };
  } catch {
    return structuredClone(defaults);
  }
}

function savePreferences() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function normalizeAddress(value) {
  const input = value.trim();
  if (!input) {
    return "";
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(input)) {
    return input;
  }

  if (
    input.includes(" ") ||
    (!input.includes(".") && input !== "localhost")
  ) {
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  }

  return `https://${input}`;
}

function getInitial(name) {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

function updateClock() {
  const now = new Date();
  const hour = now.getHours();
  const twelveHour = hour % 12 || 12;

  clock.textContent = `${String(twelveHour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  period.textContent = hour >= 12 ? "PM" : "AM";
  date.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(now);

  const moment = hour < 12
    ? "morning"
    : hour < 18
      ? "afternoon"
      : "evening";
  greeting.textContent = `Good ${moment}.`;
}

function renderShortcuts() {
  shortcutGrid.replaceChildren();
  shortcutManager.replaceChildren();

  preferences.shortcuts.forEach((shortcut, index) => {
    const link = document.createElement("a");
    link.className = "shortcut";
    link.href = shortcut.url;
    link.title = shortcut.url;

    const icon = document.createElement("span");
    icon.className = "shortcut-icon";
    icon.style.setProperty("--shortcut-color", shortcut.color);
    icon.textContent = getInitial(shortcut.name);

    const name = document.createElement("span");
    name.className = "shortcut-name";
    name.textContent = shortcut.name;

    link.append(icon, name);
    shortcutGrid.append(link);

    const item = document.createElement("div");
    item.className = "manager-item";

    const managerIcon = document.createElement("span");
    managerIcon.className = "manager-icon";
    managerIcon.style.setProperty("--item-color", shortcut.color);
    managerIcon.textContent = getInitial(shortcut.name);

    const copy = document.createElement("div");
    copy.className = "manager-copy";
    const managerName = document.createElement("strong");
    managerName.textContent = shortcut.name;
    const managerURL = document.createElement("span");
    managerURL.textContent = shortcut.url.replace(/^https?:\/\//, "");
    copy.append(managerName, managerURL);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.removeShortcut = String(index);
    remove.setAttribute("aria-label", `Remove ${shortcut.name}`);
    remove.textContent = "×";

    item.append(managerIcon, copy, remove);
    shortcutManager.append(item);
  });
}

function applyTheme(theme) {
  preferences.theme = theme;
  document.body.dataset.wallpaper = theme;
  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === theme);
  });
  savePreferences();
}

function openCustomize(focusForm = false) {
  document.body.classList.add("customizing");
  customizePanel.setAttribute("aria-hidden", "false");
  customizeButton.setAttribute("aria-expanded", "true");
  window.setTimeout(() => {
    (focusForm ? shortcutName : closeCustomizeButton).focus();
  }, 180);
}

function closeCustomize() {
  document.body.classList.remove("customizing");
  customizePanel.setAttribute("aria-hidden", "true");
  customizeButton.setAttribute("aria-expanded", "false");
  customizeButton.focus();
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const destination = normalizeAddress(query.value);
  if (destination) {
    window.location.assign(destination);
  }
});

customizeButton.addEventListener("click", () => openCustomize());
addShortcutButton.addEventListener("click", () => openCustomize(true));
closeCustomizeButton.addEventListener("click", closeCustomize);
panelScrim.addEventListener("click", closeCustomize);

document.querySelectorAll("[data-theme]").forEach((button) => {
  button.addEventListener("click", () => applyTheme(button.dataset.theme));
});

shortcutForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (preferences.shortcuts.length >= 12) {
    shortcutURL.setCustomValidity("You can save up to 12 shortcuts.");
    shortcutURL.reportValidity();
    return;
  }

  const name = shortcutName.value.trim();
  const url = normalizeAddress(shortcutURL.value);

  if (!name || !url) {
    return;
  }

  preferences.shortcuts.push({
    name,
    url,
    color: COLORS[preferences.shortcuts.length % COLORS.length]
  });
  savePreferences();
  renderShortcuts();
  shortcutForm.reset();
  shortcutName.focus();
});

shortcutURL.addEventListener("input", () => shortcutURL.setCustomValidity(""));

shortcutManager.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-shortcut]");
  if (!button) {
    return;
  }

  preferences.shortcuts.splice(Number(button.dataset.removeShortcut), 1);
  savePreferences();
  renderShortcuts();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("customizing")) {
    closeCustomize();
  }
});

applyTheme(preferences.theme);
renderShortcuts();
updateClock();
window.setInterval(updateClock, 30_000);
