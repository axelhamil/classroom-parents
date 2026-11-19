(() => {
  const BACKGROUNDS = {
    paper: ["#f5f5f1", "#13161d"],
    slate: ["#eaf4fb", "#111c1b"],
    contrast: ["#ffffff", "#000000"],
    ocean: ["#e5f6ff", "#041525"],
    forest: ["#eaf7e7", "#08180e"],
    coral: ["#ffece4", "#20120e"],
    mustard: ["#fdf3cd", "#1b1508"],
    rose: ["#ffedef", "#1e1216"],
    mint: ["#e1f9ed", "#091a15"],
    sand: ["#fff0dd", "#1c140c"],
    night: ["#eff1ff", "#090c21"],
    abyss: ["#e0f8fa", "#001419"],
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
