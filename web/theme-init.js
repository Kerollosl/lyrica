// Loaded as a blocking classic script (not inline) so the CSP can keep script-src 'self'.
// Apply a chosen theme before first paint; IndexedDB settings load later.
try {
  const theme = localStorage.getItem("lyrica-theme");
  if (theme === "light" || theme === "dark")
    document.documentElement.dataset.theme = theme;
  // Match the browser bar to the canvas (#f6f6f9 / #0b0b0d) before first paint; app.mjs keeps it in sync.
  const dark = theme
    ? theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelector('meta[name="theme-color"]').content = dark
    ? "#0b0b0d"
    : "#f6f6f9";
} catch {}
