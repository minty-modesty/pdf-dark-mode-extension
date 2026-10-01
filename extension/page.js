// Injected into PDF tabs (classic script, isolated world). Used by the popup
// (via chrome.scripting.executeScript files) and by the opt-in auto-dark
// content script. Exposes self.__pdfdm = { apply, probe }.
//
// How the dark background works (v1.1):
// Chrome's PDF viewer runs in an out-of-process frame we cannot style. A CSS
// filter can only treat everything in it the same way, so inverting the page
// also turned the viewer's dark-gray surround and toolbar light gray.
// v1.1 instead puts a click-through overlay *below* the toolbar and inverts
// what is behind it with backdrop-filter. Before inverting, an SVG filter
// finds the viewer's flat dark-gray surround (neutral, luminance ~20-44,
// at least a few pixels wide) and lifts it to light gray, so the inversion
// lands it on dark gray again. Text edges are thinner than the morphology
// radius, so glyphs are never touched. The toolbar is left uncovered and
// keeps Chrome's own dark styling.
(() => {
  if (self.__pdfdm) return;

  const STYLE_ID = "__pdfdm_style";
  const LAYER_ID = "__pdfdm_layer";
  const SVG_ID = "__pdfdm_svg";
  const FILTER_ID = "__pdfdm_bg";
  const TOOLBAR_PX = 56; // Chrome PDF viewer toolbar height (Chrome 130+)

  const EMBED_SEL = [
    'embed[type="application/x-google-chrome-pdf"]',
    'embed[type="application/pdf"]',
    'object[type="application/pdf"]',
    'iframe[src$=".pdf" i]',
    'iframe[src*=".pdf?" i]',
    'iframe[src*=".pdf#" i]',
  ].join(", ");

  function isTopLevelPdf() {
    return document.contentType === "application/pdf";
  }

  function ensureSvg() {
    if (document.getElementById(SVG_ID)) return;
    const lum = [];
    const chroma = [];
    for (let i = 0; i < 256; i++) {
      lum.push(i >= 20 && i <= 44 ? 1 : 0); // viewer surround 40, page shadow 24-39
      chroma.push(i <= 10 ? 1 : 0); // |R-G|+|G-B| small = neutral gray
    }
    const A = "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0";
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.id = SVG_ID;
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
    svg.innerHTML = `<filter id="${FILTER_ID}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
<feColorMatrix in="SourceGraphic" type="matrix" values="${A} .2126 .7152 .0722 0 0" result="l"/>
<feComponentTransfer in="l" result="lm"><feFuncA type="discrete" tableValues="${lum.join(" ")}"/></feComponentTransfer>
<feColorMatrix in="SourceGraphic" type="matrix" values="${A} 1 -1 0 0 0" result="c1"/>
<feColorMatrix in="SourceGraphic" type="matrix" values="${A} -1 1 0 0 0" result="c2"/>
<feColorMatrix in="SourceGraphic" type="matrix" values="${A} 0 1 -1 0 0" result="c3"/>
<feColorMatrix in="SourceGraphic" type="matrix" values="${A} 0 -1 1 0 0" result="c4"/>
<feComposite in="c1" in2="c2" operator="arithmetic" k2="1" k3="1" result="c12"/>
<feComposite in="c3" in2="c4" operator="arithmetic" k2="1" k3="1" result="c34"/>
<feComposite in="c12" in2="c34" operator="arithmetic" k2="1" k3="1" result="c"/>
<feComponentTransfer in="c" result="cm"><feFuncA type="discrete" tableValues="${chroma.join(" ")}"/></feComponentTransfer>
<feComposite in="lm" in2="cm" operator="arithmetic" k1="1" result="m0"/>
<feMorphology in="m0" operator="erode" radius="1.5" result="me"/>
<feMorphology in="me" operator="dilate" radius="2" result="md"/>
<feFlood flood-color="#000" flood-opacity="1" result="all"/>
<feMorphology in="all" operator="erode" radius="4" result="inner"/>
<feComposite in="all" in2="inner" operator="out" result="edge"/>
<feComposite in="edge" in2="m0" operator="in" result="edgem"/>
<feComposite in="edgem" in2="md" operator="over" result="mu"/>
<feComposite in="mu" in2="m0" operator="in" result="m"/>
<feFlood flood-color="rgb(236,236,236)" result="f"/>
<feComposite in="f" in2="m" operator="in" result="fm"/>
<feComposite in="fm" in2="SourceGraphic" operator="over"/>
</filter>`;
    document.documentElement.appendChild(svg);
  }

  function layerTop() {
    // Presentation mode / fullscreen has no toolbar.
    const full =
      !!document.fullscreenElement ||
      (innerHeight >= screen.height && innerWidth >= screen.width);
    return full ? 0 : TOOLBAR_PX;
  }

  function onResize() {
    const layer = document.getElementById(LAYER_ID);
    if (layer) layer.style.top = layerTop() + "px";
  }

  function remove() {
    for (const id of [STYLE_ID, LAYER_ID, SVG_ID]) document.getElementById(id)?.remove();
    removeEventListener("resize", onResize);
    document.removeEventListener("fullscreenchange", onResize);
  }

  // filter: CSS filter string, or null to turn dark mode off.
  // darkBg: also darken the viewer surround (v1.1 default true).
  function apply(filter, darkBg = true) {
    if (!filter) return remove();
    const full = darkBg ? `url(#${FILTER_ID}) ${filter}` : filter;
    let css;
    if (isTopLevelPdf()) {
      if (darkBg) ensureSvg();
      else document.getElementById(SVG_ID)?.remove();
      // The marker style carries no visual rules here; the layer does the work.
      css = `#${LAYER_ID}{}`;
      let layer = document.getElementById(LAYER_ID);
      if (!layer) {
        layer = document.createElement("div");
        layer.id = LAYER_ID;
        document.documentElement.appendChild(layer);
        addEventListener("resize", onResize);
        document.addEventListener("fullscreenchange", onResize);
      }
      layer.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;pointer-events:none;" +
        "z-index:2147483647;top:" + layerTop() + "px;" +
        `backdrop-filter:${full};-webkit-backdrop-filter:${full};`;
    } else {
      // PDFs embedded in a web page: Chrome 154 drops an SVG url() filter on
      // the plugin element entirely (verified), so these keep the plain
      // inversion. Only full-tab PDFs get the dark surround.
      document.getElementById(LAYER_ID)?.remove();
      document.getElementById(SVG_ID)?.remove();
      css = `${EMBED_SEL} { filter: ${filter} !important; }`;
    }
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
  }

  function probe() {
    const isPdf = isTopLevelPdf() || !!document.querySelector(EMBED_SEL);
    return { isPdf, active: !!document.getElementById(STYLE_ID) };
  }

  self.__pdfdm = { apply, probe };
})();
