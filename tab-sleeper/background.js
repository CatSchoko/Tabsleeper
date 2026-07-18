const DEFAULTS = {
  idleMinutes: 30,
  whitelist: [],
  excludePinned: true,
  excludeAudible: true
};

const SLEEP_URL = chrome.runtime.getURL("sleep.html");

// ── In-Memory State ──────────────────────────────────────────────────────
// Läuft der Service Worker (MV3 wird bei Inaktivität beendet und bei Bedarf
// neu gestartet), ist dieser State weg. `ensureState()` lädt ihn dann aus
// chrome.storage nach - aber nur EINMAL pro Aufwachen, nicht bei jedem Event.
// Der eigentliche Gewinn: Tab-Wechsel/Seitenladen lösen danach KEINE
// Storage-I/O und KEIN chrome.tabs.query({}) mehr aus, nur noch echte
// Statusänderungen (Tab schläft ein/wacht auf) werden persistiert.

let lastActive = null;      // Map<tabId, timestamp>
let sleepingTabIds = null;  // Set<tabId>
let settingsCache = null;   // gecachte Settings, invalidiert bei storage.onChanged
let stateReady = null;      // Promise, verhindert parallele Doppel-Initialisierung

function ensureState() {
  if (stateReady) return stateReady;

  stateReady = (async () => {
    const stored = await chrome.storage.local.get(["lastActive", "sleepingTabIds"]);

    lastActive = new Map(
      Object.entries(stored.lastActive || {}).map(([k, v]) => [Number(k), v])
    );

    if (Array.isArray(stored.sleepingTabIds)) {
      sleepingTabIds = new Set(stored.sleepingTabIds);
    } else {
      // Erster Start / alte Version ohne gespeicherten Set -> einmalig real abfragen
      const tabs = await chrome.tabs.query({});
      sleepingTabIds = new Set(
        tabs.filter((t) => t.url && t.url.startsWith(SLEEP_URL)).map((t) => t.id)
      );
      persistSleepingSet();
    }
  })();

  return stateReady;
}

function persistLastActive() {
  if (!lastActive) return Promise.resolve();
  return chrome.storage.local.set({ lastActive: Object.fromEntries(lastActive) });
}

function persistSleepingSet() {
  if (!sleepingTabIds) return Promise.resolve();
  return chrome.storage.local.set({ sleepingTabIds: [...sleepingTabIds] });
}

async function ensureSettings() {
  if (settingsCache) return settingsCache;
  settingsCache = await chrome.storage.sync.get(DEFAULTS);
  return settingsCache;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") settingsCache = null; // beim nächsten Zugriff neu laden
});

// ── Helpers ──────────────────────────────────────────────────────────────

function isYouTubeWatch(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") && u.pathname === "/watch";
  } catch {
    return false;
  }
}

function isWhitelisted(url, whitelist) {
  if (!url || !whitelist || whitelist.length === 0) return false;
  try {
    const host = new URL(url).hostname;
    return whitelist.some((p) => p.trim() !== "" && host.includes(p.trim()));
  } catch {
    return false;
  }
}

async function touchTab(tabId) {
  if (tabId === undefined || tabId < 0) return;
  await ensureState();
  lastActive.set(tabId, Date.now()); // rein im Speicher, kein I/O
}

async function forgetTab(tabId) {
  await ensureState();
  lastActive.delete(tabId);
  if (sleepingTabIds.delete(tabId)) {
    await persistSleepingSet();
    updateBadge();
  }
}

// Versucht die aktuelle Video-Zeit auf YouTube-Watch-Seiten auszulesen, bevor
// die Seite entladen wird, damit man beim Wecken genau dort weitermachen kann.
async function readYouTubeTime(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const v = document.querySelector("video");
        return v ? v.currentTime : null;
      }
    });
    return results?.[0]?.result ?? null;
  } catch {
    return null;
  }
}

// Original-URL/Titel/Favicon/Videozeit werden direkt in die Sleep-URL kodiert.
// Dadurch ist die Sleep-Seite komplett eigenständig (kein Storage-Lookup per
// tabId nötig) und übersteht auch einen Browser-Neustart, bei dem Chrome
// allen Tabs neue IDs vergibt.
function buildSleepUrl(originalUrl, title, favIconUrl, videoTime) {
  const params = new URLSearchParams();
  params.set("u", originalUrl);
  params.set("t", title || originalUrl);
  if (favIconUrl) params.set("f", favIconUrl);
  if (videoTime && videoTime > 3) params.set("v", String(Math.floor(videoTime)));
  return `${SLEEP_URL}?${params.toString()}`;
}

// Navigiert den Tab auf die eigene Sleep-Seite. Die Originalseite (DOM/JS/Bilder)
// wird dadurch komplett verworfen -> das bringt die eigentliche Speicherersparnis.
// Zurück geht es NUR über den Wake-Button.
async function sleepTab(tab) {
  if (!tab || !tab.url || tab.url.startsWith(SLEEP_URL) || tab.url.startsWith("chrome://")) return;

  let videoTime = null;
  if (isYouTubeWatch(tab.url)) {
    videoTime = await readYouTubeTime(tab.id);
  }

  const sleepUrl = buildSleepUrl(tab.url, tab.title || tab.url, tab.favIconUrl || "", videoTime);

  const { stats = {} } = await chrome.storage.local.get("stats");
  stats.totalSlept = (stats.totalSlept || 0) + 1;
  await chrome.storage.local.set({ stats });

  chrome.tabs.update(tab.id, { url: sleepUrl }).catch(() => {});
  // sleepingTabIds wird in onUpdated ergänzt, sobald die Navigation abgeschlossen ist
  // (einzige Quelle der Wahrheit, keine doppelte Buchführung hier)
}

function updateBadge() {
  const count = sleepingTabIds ? sleepingTabIds.size : 0;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#4a9eff" });
}

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "sleep-tab-now",
      title: "Diesen Tab jetzt schlafen legen",
      contexts: ["tab"]
    });
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("checkTabs", { periodInMinutes: 1 });
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set(current);
  setupContextMenu();
  await ensureState();
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureState();
  updateBadge();
});

// Best-effort: letzten Stand sichern, bevor der Service Worker beendet wird
chrome.runtime.onSuspend.addListener(() => {
  persistLastActive();
});

// ── Events ───────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sleep-tab-now" && tab && !tab.pinned) {
    sleepTab(tab);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "sleep-current-tab") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && !tab.pinned) sleepTab(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "sleepTab" && msg.tabId) {
    chrome.tabs.get(msg.tabId).then((tab) => sleepTab(tab)).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => touchTab(tabId));
chrome.tabs.onCreated.addListener((tab) => touchTab(tab.id));

// Hot Path: feuert bei JEDEM Seitenladen in JEDEM Tab -> bewusst so schlank
// wie möglich gehalten. Kein chrome.tabs.query({}), kein Storage-I/O, außer
// wenn sich der Schlaf-Status eines Tabs tatsächlich ändert.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  await ensureState();

  const isSleepTab = !!(tab.url && tab.url.startsWith(SLEEP_URL));
  const wasSleeping = sleepingTabIds.has(tabId);

  if (isSleepTab && !wasSleeping) {
    sleepingTabIds.add(tabId);
    await persistSleepingSet();
    updateBadge();
  } else if (!isSleepTab && wasSleeping) {
    sleepingTabIds.delete(tabId);
    await persistSleepingSet();
    updateBadge();
  }

  if (!isSleepTab) touchTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => forgetTab(tabId));

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "checkTabs") return;

  await ensureState();
  const settings = await ensureSettings();
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const idleThreshold = settings.idleMinutes * 60 * 1000;

  // Gleichzeitig genutzt, um sleepingTabIds zu korrigieren (Drift-Schutz,
  // falls mal ein Event verpasst wurde) - kostet nichts extra, die Tabs
  // sind durch die Zeile darüber ohnehin schon abgefragt.
  const realSleepingIds = new Set(
    tabs.filter((t) => t.url && t.url.startsWith(SLEEP_URL)).map((t) => t.id)
  );
  let setChanged = realSleepingIds.size !== sleepingTabIds.size;
  if (!setChanged) {
    for (const id of realSleepingIds) {
      if (!sleepingTabIds.has(id)) { setChanged = true; break; }
    }
  }
  if (setChanged) {
    sleepingTabIds = realSleepingIds;
    await persistSleepingSet();
    updateBadge();
  }

  for (const tab of tabs) {
    if (tab.active) continue;
    if (sleepingTabIds.has(tab.id)) continue; // schläft bereits
    if (settings.excludePinned && tab.pinned) continue;
    if (settings.excludeAudible && tab.audible) continue;
    if (isWhitelisted(tab.url, settings.whitelist)) continue;

    const last = lastActive.get(tab.id) ?? now;
    if (now - last > idleThreshold) {
      sleepTab(tab);
    }
  }

  await persistLastActive(); // einmal pro Minute, statt bei jedem Tab-Wechsel
});
