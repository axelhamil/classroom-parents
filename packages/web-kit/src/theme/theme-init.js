(() => {
  let stored = null;

  try {
    stored = window.localStorage.getItem("theme");
  } catch {
    stored = null;
  }

  const dark =
    stored === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : stored === "dark";

  document.documentElement.classList.toggle("dark", dark);

  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", dark ? "#1b1612" : "#fbf5eb");
  }
})();
