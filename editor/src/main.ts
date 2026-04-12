import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import { loadCommonJs } from './lib/commonJsLoader'
import App from './App.vue'
import { getCustomFontsList, loadCustomFont, getGoogleFontsList, loadGoogleFont } from '@shared/googleFonts'
import '@shared/animations.css'

function getRoute(): 'overlay' | 'editor' {
  const hash = window.location.hash.slice(1).toLowerCase() || '/'
  if (hash === '/editor' || hash === 'editor') return 'editor'
  return 'overlay'
}

async function init(): Promise<void> {
  await loadCommonJs()

  const route = getRoute()
  if (route === 'overlay') {
    document.body.classList.add('is-overlay-mode')
    // Load custom fonts for overlay mode
    const customFonts = getCustomFontsList()
    for (const f of customFonts) {
      loadCustomFont(f.name)
    }
    // Also load all Google fonts for overlay mode
    const googleFonts = getGoogleFontsList()
    for (const f of googleFonts) {
      loadGoogleFont(f.name)
    }
  }

  const app = createApp(App)
  app.use(createPinia())
  app.mount('#app')
}

init().catch(e => console.error('[Editor] init failed:', e))
