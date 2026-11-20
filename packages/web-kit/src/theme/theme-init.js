(() => {
  const BACKGROUNDS = {
    paper: ["#f5f5f1", "#13161d"],
    slate: ["#dde5ef", "#111c1b"],
    contrast: ["#ffffff", "#000000"],
    ocean: ["#d9f5ff", "#041525"],
    forest: ["#e0f6db", "#08180e"],
    coral: ["#ffe4d8", "#20120e"],
    mustard: ["#fbedb8", "#1b1508"],
    rose: ["#ffe9ec", "#1e1216"],
    mint: ["#dbfcec", "#091a15"],
    sand: ["#fbe7ce", "#1c140c"],
    night: ["#e6e9ff", "#090c21"],
    abyss: ["#cbfcfb", "#001419"],
  };

  const read = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const stored = read("theme");
  const storedPalette = read("palette");
  const palette = Object.hasOwn(BACKGROUNDS, storedPalette) ? storedPalette : "paper";

  const dark =
    stored === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : stored === "dark";

  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-palette", palette);

  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", BACKGROUNDS[palette][dark ? 1 : 0]);
  }
})();
