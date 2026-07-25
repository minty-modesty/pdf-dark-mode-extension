// Auto-dark content script (only registered when the user opts in to
// "automatically darken every PDF"). Self-contained: no imports allowed here.
(async () => {
  const isPdf =
    document.contentType === "application/pdf" ||
    !!document.querySelector(
      'embed[type="application/x-google-chrome-pdf"], embed[type="application/pdf"]'
    );
  if (!isPdf) return;
  if (document.getElementById("__pdfdm_style")) return;

  const DEFAULTS = { theme: "soft", brightness: 100, contrast: 100, auto: false };
  const { settings } = await chrome.storage.sync.get({ settings: DEFAULTS });
  const s = { ...DEFAULTS, ...settings };
  if (!s.auto) return;

  const base = {
    soft: "invert(90%) hue-rotate(180deg)",
    black: "invert(100%) hue-rotate(180deg)",
    sepia: "invert(93%) hue-rotate(180deg) sepia(35%)",
  }[s.theme] || "invert(90%) hue-rotate(180deg)";
  const b = Math.min(130, Math.max(70, s.brightness)) / 100;
  const c = Math.min(130, Math.max(70, s.contrast)) / 100;
  const filter = `${base} brightness(${b}) contrast(${c})`;

  // Top-level PDF tabs: viewer is an OOP child frame with no embed element
  // in this document — only a filter on <html> reaches it (Chrome ≥150).
  const style = document.createElement("style");
  style.id = "__pdfdm_style";
  style.textContent =
    document.contentType === "application/pdf"
      ? `html { filter: ${filter} !important; background-color: #17171a !important; }`
      : [
          `embed[type="application/x-google-chrome-pdf"],`,
          `embed[type="application/pdf"],`,
          `object[type="application/pdf"]`,
          `{ filter: ${filter} !important; }`,
        ].join("\n");
  (document.head || document.documentElement).appendChild(style);
})();
