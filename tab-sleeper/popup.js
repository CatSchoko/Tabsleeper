const DEFAULTS = {
  idleMinutes: 30,
  whitelist: [],
  excludePinned: true,
  excludeAudible: true
};

const idleMinutesEl = document.getElementById("idleMinutes");
const idleMinutesLabelEl = document.getElementById("idleMinutesLabel");
const whitelistEl = document.getElementById("whitelist");
const excludePinnedEl = document.getElementById("excludePinned");
const excludeAudibleEl = document.getElementById("excludeAudible");
const statusEl = document.getElementById("status");
const tabListEl = document.getElementById("tabList");
const sleepNowBtn = document.getElementById("sleepNow");
const wakeAllBtn = document.getElementById("wakeAll");
const statSleepingEl = document.getElementById("statSleeping");
const statTotalEl = document.getElementById("statTotal");
const statSavingsEl = document.getElementById("statSavings");

const AVG_SAVINGS_MB = 150; // grobe Schätzung pro schlafendem Tab, nur zur Anzeige
const SLEEP_URL = chrome.runtime.getURL("sleep.html");

function buildResumeUrl(url, videoTime) {
  if (!videoTime || videoTime < 3) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      u.searchParams.set("t", Math.floor(videoTime) + "s");
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Liest Original-URL/Titel/Favicon/Videozeit direkt aus der Sleep-Tab-URL.
// Kein Storage-Lookup per tabId -> funktioniert auch nach Browser-Neustart.
function parseSleepInfo(tabUrl) {
  try {
    const u = new URL(tabUrl);
    if (!tabUrl.startsWith(SLEEP_URL)) return null;
    const originalUrl = u.searchParams.get("u");
    if (!originalUrl) return null;
    return {
      url: originalUrl,
      title: u.searchParams.get("t") || originalUrl,
      favIconUrl: u.searchParams.get("f") || "",
      videoTime: u.searchParams.get("v") ? Number(u.searchParams.get("v")) : null
    };
  } catch {
    return null;
  }
}

async function getSleepingTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .map((tab) => ({ tabId: tab.id, info: parseSleepInfo(tab.url) }))
    .filter((entry) => entry.info);
}

async function loadSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  idleMinutesEl.value = s.idleMinutes;
  idleMinutesLabelEl.textContent = s.idleMinutes;
  whitelistEl.value = s.whitelist.join(", ");
  excludePinnedEl.checked = s.excludePinned;
  excludeAudibleEl.checked = s.excludeAudible;
}

idleMinutesEl.addEventListener("input", () => {
  idleMinutesLabelEl.textContent = idleMinutesEl.value;
});

async function saveSettings() {
  const whitelist = whitelistEl.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await chrome.storage.sync.set({
    idleMinutes: Math.max(1, parseInt(idleMinutesEl.value, 10) || DEFAULTS.idleMinutes),
    whitelist,
    excludePinned: excludePinnedEl.checked,
    excludeAudible: excludeAudibleEl.checked
  });

  statusEl.textContent = "Gespeichert ✓";
  setTimeout(() => (statusEl.textContent = ""), 1200);
}

[idleMinutesEl, whitelistEl, excludePinnedEl, excludeAudibleEl].forEach((el) =>
  el.addEventListener("change", saveSettings)
);

async function renderSleepingTabs() {
  const entries = await getSleepingTabs();
  const { stats = {} } = await chrome.storage.local.get("stats");

  statSleepingEl.textContent = entries.length;
  statTotalEl.textContent = stats.totalSlept || 0;
  statSavingsEl.textContent = `${entries.length * AVG_SAVINGS_MB} MB`;

  tabListEl.innerHTML = "";

  if (entries.length === 0) {
    tabListEl.innerHTML = '<div id="emptyMsg">Keine Tabs im Schlaf.</div>';
    return;
  }

  for (const { tabId, info } of entries) {
    const item = document.createElement("div");
    item.className = "tab-item";

    const icon = document.createElement("img");
    icon.src = info.favIconUrl || "";
    icon.onerror = () => (icon.style.visibility = "hidden");

    const title = document.createElement("span");
    title.textContent = info.title;
    title.title = info.title;

    const wakeBtn = document.createElement("button");
    wakeBtn.className = "wake-btn";
    wakeBtn.textContent = "Wake";
    wakeBtn.addEventListener("click", async () => {
      try {
        await chrome.tabs.update(tabId, { active: true, url: buildResumeUrl(info.url, info.videoTime) });
        const t = await chrome.tabs.get(tabId);
        await chrome.windows.update(t.windowId, { focused: true });
      } catch {
        // Tab existiert nicht mehr
      }
      window.close();
    });

    item.append(icon, title, wakeBtn);
    tabListEl.appendChild(item);
  }
}

wakeAllBtn.addEventListener("click", async () => {
  const entries = await getSleepingTabs();

  for (const { tabId, info } of entries) {
    try {
      await chrome.tabs.update(tabId, { url: buildResumeUrl(info.url, info.videoTime) });
    } catch {
      // Tab existiert nicht mehr, ignorieren
    }
  }

  renderSleepingTabs();
});

sleepNowBtn.addEventListener("click", async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && !activeTab.pinned) {
    await chrome.runtime.sendMessage({ type: "sleepTab", tabId: activeTab.id });
    setTimeout(renderSleepingTabs, 300);
  }
});

loadSettings();
renderSleepingTabs();
