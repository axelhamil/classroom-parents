(() => {
  const BACKGROUNDS = {
    paper: ["#f5f5f1", "#13161d"],
    slate: ["#ecf1f4", "#151e1e"],
    sage: ["#eef5ee", "#131a15"],
    ink: ["#f5f4f8", "#16151f"],
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
