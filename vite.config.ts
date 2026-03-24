import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Multi-page app: `/` is the static home; `/disc-flight-tool/` is the React app.
 * For GitHub project pages (`/repo/` base), set: BASE_PATH=/repo/ npm run build
 */
function basePath(): string {
  const raw = process.env.BASE_PATH?.trim()
  if (!raw || raw === '/') return '/'
  const withSlash = raw.endsWith('/') ? raw : `${raw}/`
  return withSlash.startsWith('/') ? withSlash : `/${withSlash}`
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : basePath(),
  build: {
    outDir: 'docs',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'disc-flight-tool': resolve(__dirname, 'disc-flight-tool/index.html'),
        'text-as-image': resolve(__dirname, 'text-as-image/index.html'),
      },
    },
  },
}))
