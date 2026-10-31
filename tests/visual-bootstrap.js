/* Capture the DSH module factory instead of booting the real shell. */
window.__moduleRegistration = null
window.__ModuleLoader__ = {
  load(entry) {
    window.__moduleRegistration = entry
  },
}
