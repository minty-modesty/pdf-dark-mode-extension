// Service worker: keeps the "auto dark" content script registration in sync
// with settings + granted permissions. Registration persists across restarts,
// so all operations are idempotent.

const SCRIPT_ID = "pdfdm-auto";
const SCRIPT_JS = ["page.js", "autodark.js"];

async function syncAutoRegistration() {
  const { settings } = await chrome.storage.local.get({ settings: {} });
  const wantAuto = !!settings.auto;
  const hasHosts = await chrome.permissions.contains({ origins: ["<all_urls>"] });

  let registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  // Registrations survive extension updates; v1.0 registered only autodark.js.
  if (registered.length && registered[0].js?.join() !== SCRIPT_JS.join()) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    registered = [];
  }
  const isRegistered = registered.length > 0;

  if (wantAuto && hasHosts && !isRegistered) {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        js: SCRIPT_JS,
        matches: ["<all_urls>"],
        runAt: "document_end",
        allFrames: false,
      },
    ]);
  } else if ((!wantAuto || !hasHosts) && isRegistered) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
}

// v1.0 kept settings in chrome.storage.sync; the privacy policy promises they
// stay in this browser, so v1.1 moves them to chrome.storage.local once.
async function migrateSettings() {
  const { settings: local } = await chrome.storage.local.get("settings");
  if (!local) {
    const { settings: synced } = await chrome.storage.sync.get("settings");
    if (synced) await chrome.storage.local.set({ settings: synced });
  }
  await chrome.storage.sync.remove("settings");
}

chrome.runtime.onInstalled.addListener(async () => {
  await migrateSettings();
  await syncAutoRegistration();
});
chrome.runtime.onStartup.addListener(syncAutoRegistration);
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "auto-changed") syncAutoRegistration();
});
chrome.permissions.onRemoved.addListener(syncAutoRegistration);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) syncAutoRegistration();
});
