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

  var languageMode = null;
  try {
    languageMode = window.localStorage.getItem('gitglance.language');
  } catch (error) {
    languageMode = null;
  }
  languageMode = languageMode === 'zh-CN' || languageMode === 'system' ? languageMode : 'en';
  var language = languageMode;
  if (languageMode === 'system') {
    var preferred = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    language = String(preferred).toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : 'en';
  }
  root.lang = language;
  root.dataset.language = language;
  root.dataset.languageMode = languageMode;
})();
