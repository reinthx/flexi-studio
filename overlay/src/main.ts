import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useLiveDataStore } from '@shared/index'
import { loadCommonJs } from './commonJsLoader'
import { loadGoogleFont, isGoogleFont, loadAllConfiguredFonts, getCustomFontsList, loadCustomFont } from '@shared/googleFonts'
import '@shared/animations.css'

export { loadGoogleFont, isGoogleFont, loadCustomFont }

async function init(): Promise<void> {
  const customFonts = getCustomFontsList()
  for (const f of customFonts) {
    loadCustomFont(f.name)
  }

  await loadCommonJs()
  await new Promise(resolve => setTimeout(resolve, 50))

  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)

  try {
    const store = useLiveDataStore()
    store.start()
  } catch (e) {
    console.error('[Overlay] Error starting store:', e)
  }

  app.mount('#app')
}

init().catch(e => console.error('[Overlay] init failed:', e))
