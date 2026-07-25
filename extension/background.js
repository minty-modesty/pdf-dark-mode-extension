// Service worker: keeps the "auto dark" content script registration in sync
// with settings + granted permissions. Registration persists across restarts,
// so all operations are idempotent.

const SCRIPT_ID = "pdfdm-auto";

async function syncAutoRegistration() {
  const { settings } = await chrome.storage.sync.get({ settings: {} });
  const wantAuto = !!settings.auto;
  const hasHosts = await chrome.permissions.contains({ origins: ["<all_urls>"] });

  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  const isRegistered = registered.length > 0;

  if (wantAuto && hasHosts && !isRegistered) {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        js: ["autodark.js"],
        matches: ["<all_urls>"],
        runAt: "document_end",
        allFrames: false,
      },
    ]);
  } else if ((!wantAuto || !hasHosts) && isRegistered) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
}

chrome.runtime.onInstalled.addListener(syncAutoRegistration);
chrome.runtime.onStartup.addListener(syncAutoRegistration);
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "auto-changed") syncAutoRegistration();
});
chrome.permissions.onRemoved.addListener(syncAutoRegistration);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) syncAutoRegistration();
});
