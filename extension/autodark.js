// Auto-dark content script (only registered when the user opts in to
// "automatically darken every PDF"). Runs after page.js, which defines
// self.__pdfdm. No imports allowed in content scripts.
(async () => {
  const pdfdm = self.__pdfdm;
  if (!pdfdm) return;
  const { isPdf, active } = pdfdm.probe();
  if (!isPdf || active) return;

  const DEFAULTS = { theme: "soft", brightness: 100, contrast: 100, auto: false, darkBg: true };
  const { settings } = await chrome.storage.local.get({ settings: DEFAULTS });
  const s = { ...DEFAULTS, ...settings };
  if (!s.auto) return;

  const base = {
    soft: "invert(90%) hue-rotate(180deg)",
    black: "invert(100%) hue-rotate(180deg)",
    sepia: "invert(93%) hue-rotate(180deg) sepia(35%)",
  }[s.theme] || "invert(90%) hue-rotate(180deg)";
  const b = Math.min(130, Math.max(70, s.brightness)) / 100;
  const c = Math.min(130, Math.max(70, s.contrast)) / 100;
  pdfdm.apply(`${base} brightness(${b}) contrast(${c})`, s.darkBg !== false);
})();
