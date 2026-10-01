import { DEFAULT_SETTINGS, buildFilter } from "./shared.js";

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULT_SETTINGS };
let tab = null;
let active = false;

async function getTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function inject(func, args = []) {
  const target = { tabId: tab.id };
  await chrome.scripting.executeScript({ target, files: ["page.js"] });
  const [res] = await chrome.scripting.executeScript({ target, func, args });
  return res?.result;
}

async function probe() {
  try {
    return (await inject(() => self.__pdfdm.probe())) ?? { isPdf: false, active: false };
  } catch {
    // Restricted page (chrome://, Web Store, another extension's viewer,
    // or a local file without "Allow access to file URLs").
    return { isPdf: false, active: false, restricted: true };
  }
}

async function apply(on) {
  const filter = on ? buildFilter(settings) : null;
  try {
    await inject((f, bg) => self.__pdfdm.apply(f, bg), [filter, settings.darkBg]);
    active = on;
  } catch {
    /* restricted page — probe already disabled the toggle */
  }
  render();
}

// Explain *why* the toggle can't work here instead of a generic message.
async function explain(state) {
  const url = tab?.url || "";
  const hint = $("hint");
  if (url.startsWith("file:") && !(await chrome.extension.isAllowedFileSchemeAccess())) {
    hint.textContent = "";
    hint.append(
      "Local PDF files need one extra switch: turn on \"Allow access to file URLs\" for PDF Dark Mode, then reload this tab. "
    );
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = "Open the setting";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
    hint.append(a);
  } else if (url.startsWith("chrome-extension:")) {
    hint.textContent =
      "This PDF is open in another extension's viewer (for example Adobe Acrobat). Chrome doesn't let extensions change each other's pages, so open the PDF in Chrome's own viewer to use dark mode.";
  } else if (state.restricted) {
    hint.textContent = "Chrome doesn't allow extensions on this page.";
  }
  hint.hidden = false;
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
  $("darkBg").checked = settings.darkBg;
}

async function save() {
  await chrome.storage.local.set({ settings });
}

async function reapplyIfActive() {
  if (active) await apply(true);
}

async function init() {
  const stored = await chrome.storage.local.get({ settings: DEFAULT_SETTINGS });
  settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  tab = await getTab();

  const state = await probe();
  active = state.active;
  if (!state.isPdf) await explain(state);
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

  $("darkBg").addEventListener("change", async () => {
    settings.darkBg = $("darkBg").checked;
    await save();
    await reapplyIfActive();
  });

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
