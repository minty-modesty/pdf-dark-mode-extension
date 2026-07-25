// Shared between popup and background: settings model + the functions that get
// injected into pages. Injected functions must be self-contained (no closures).

export const DEFAULT_SETTINGS = {
  theme: "soft", // soft | black | sepia
  brightness: 100, // percent, 70–130
  contrast: 100, // percent, 70–130
  auto: false,
};

export function buildFilter({ theme, brightness, contrast }) {
  const base = {
    soft: "invert(90%) hue-rotate(180deg)",
    black: "invert(100%) hue-rotate(180deg)",
    sepia: "invert(93%) hue-rotate(180deg) sepia(35%)",
  }[theme] || "invert(90%) hue-rotate(180deg)";
  const b = Math.min(130, Math.max(70, brightness)) / 100;
  const c = Math.min(130, Math.max(70, contrast)) / 100;
  return `${base} brightness(${b}) contrast(${c})`;
}

// Runs in the page. Applies or removes the dark style. `filter` of null removes.
export function pageApplyDark(filter) {
  const ID = "__pdfdm_style";
  const existing = document.getElementById(ID);
  if (!filter) {
    if (existing) existing.remove();
    return;
  }
  // Top-level PDF tabs (Chrome ≥150 verified): the viewer lives in an
  // out-of-process child frame with NO embed element in this document —
  // the only thing that visually affects it is a filter on <html> itself.
  // Embedded PDFs in regular pages: filter the author's embed/iframe element.
  const topLevelPdf = document.contentType === "application/pdf";
  const css = topLevelPdf
    ? `html { filter: ${filter} !important; background-color: #17171a !important; }`
    : [
        `embed[type="application/x-google-chrome-pdf"],`,
        `embed[type="application/pdf"],`,
        `object[type="application/pdf"],`,
        `iframe[src$=".pdf" i], iframe[src*=".pdf?" i], iframe[src*=".pdf#" i]`,
        `{ filter: ${filter} !important; }`,
      ].join("\n");
  if (existing) {
    existing.textContent = css;
  } else {
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
}

// Runs in the page. Reports whether this tab looks like a PDF and current state.
export function pageProbe() {
  const isPdf =
    document.contentType === "application/pdf" ||
    !!document.querySelector(
      'embed[type="application/x-google-chrome-pdf"], embed[type="application/pdf"], object[type="application/pdf"], iframe[src$=".pdf" i], iframe[src*=".pdf?" i], iframe[src*=".pdf#" i]'
    );
  return { isPdf, active: !!document.getElementById("__pdfdm_style") };
}
