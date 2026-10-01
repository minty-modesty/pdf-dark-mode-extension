// Settings model shared by the popup.

export const DEFAULT_SETTINGS = {
  theme: "soft", // soft | black | sepia
  brightness: 100, // percent, 70–130
  contrast: 100, // percent, 70–130
  auto: false,
  darkBg: true, // also darken the gray area around pages (v1.1)
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

// The page-side code (apply/probe) lives in page.js, injected as a file so the
// popup and the auto-dark content script share one implementation.
