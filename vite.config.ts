import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js alone is ~700 KB minified; a single chunk is expected here.
    chunkSizeWarningLimit: 2000,
  },
})
