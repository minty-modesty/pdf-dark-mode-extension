import { DEFAULT_SETTINGS, buildFilter, pageApplyDark, pageProbe } from "./shared.js";

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };
let tab = null;
let active = false;

async function getTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function probe() {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageProbe,
    });
    return res?.result ?? { isPdf: false, active: false };
  } catch {
    // Restricted page (chrome://, Web Store, etc.)
    return { isPdf: false, active: false, restricted: true };
  }
}

async function apply(on) {
  const filter = on ? buildFilter(settings) : null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageApplyDark,
      args: [filter],
    });
    active = on;
  } catch {
    /* restricted page — probe already disabled the toggle */
  }
  render();
}

function render() {
  $("toggle").setAttribute("aria-pressed", String(active));
  document.querySelectorAll(".theme").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.theme === settings.theme);
  });
  $("brightness").value = settings.brightness;
  $("brightnessOut").textContent = settings.brightness + "%";
  $("contrast").value = settings.contrast;
  $("contrastOut").textContent = settings.contrast + "%";
  $("auto").checked = settings.auto;
}

async function save() {
  await chrome.storage.sync.set({ settings });
}

async function reapplyIfActive() {
  if (active) await apply(true);
}

async function init() {
  const stored = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  tab = await getTab();

  const state = await probe();
  active = state.active;
  if (!state.isPdf) $("hint").hidden = false;
  if (state.restricted) $("toggle").disabled = true;
  render();

  $("toggle").addEventListener("click", async () => {
    await apply(!active);
  });

  document.querySelectorAll(".theme").forEach((btn) => {
    btn.addEventListener("click", async () => {
      settings.theme = btn.dataset.theme;
      await save();
      render();
      if (!active) await apply(true);
      else await reapplyIfActive();
    });
  });

  for (const key of ["brightness", "contrast"]) {
    $(key).addEventListener("input", async () => {
      settings[key] = Number($(key).value);
      render();
      await reapplyIfActive();
    });
    $(key).addEventListener("change", save);
  }

  $("auto").addEventListener("change", async () => {
    if ($("auto").checked) {
      // Needs host access to darken PDFs without a click per tab.
      const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
      if (!granted) {
        $("auto").checked = false;
        return;
      }
      settings.auto = true;
    } else {
      settings.auto = false;
    }
    await save();
    // Background (re)registers or removes the auto content script on change.
    chrome.runtime.sendMessage({ type: "auto-changed" }).catch(() => {});
  });
}

init();
