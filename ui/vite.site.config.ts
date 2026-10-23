import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The Start map, built on its own for the website (site/map/), from the app's own component.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../helper/src/shared', import.meta.url)) } },
  define: { 'process.env.NODE_ENV': '"production"' },
  publicDir: false,
  build: {
    outDir: '../site/map',
    minify: true,
    emptyOutDir: true,
    // a library build keeps whitespace unless the bundler is told to squeeze it too
    rolldownOptions: { output: { minify: true } },
    lib: { entry: fileURLToPath(new URL('src/site/map.tsx', import.meta.url)), formats: ['es'], fileName: () => 'map.js', cssFileName: 'map' },
  },
})
