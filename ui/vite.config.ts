import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The helper serves ui/dist on :4817 and proxies Ollama, so the UI is always
// built rather than served by Vite's dev server: one origin, one port.
export default defineConfig({
  plugins: [react()],
  // Types, the curated library and the Modelfile reader live with the helper and are shared, not copied.
  resolve: { alias: { '@shared': fileURLToPath(new URL('../helper/src/shared', import.meta.url)) } },
  // A local tool loaded from localhost: one bundle (mostly xterm + React) is fine.
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 800 },
})
