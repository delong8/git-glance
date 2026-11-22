/* Applies the cached appearance before first paint to avoid a theme flash. */
(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('gitglance.theme');
  } catch (error) {
    stored = null;
  }
  var mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
  var resolved = mode;
  if (mode === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  var root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  root.style.colorScheme = resolved;

  var language = null;
  try {
    language = window.localStorage.getItem('gitglance.language');
  } catch (error) {
    language = null;
  }
  language = language === 'zh-CN' ? 'zh-CN' : 'en';
  root.lang = language;
  root.dataset.language = language;
})();
