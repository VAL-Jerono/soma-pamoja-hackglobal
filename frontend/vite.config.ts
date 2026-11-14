import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE || ''
  return {
    plugins: [
      react(),
      {
        name: 'validate-public-config',
        transformIndexHtml(html: string) {
          if (mode === 'production' && (!apiBase || !apiBase.startsWith('https://'))) {
            throw new Error('VITE_API_BASE must be an HTTPS URL for production builds')
          }
          if (mode === 'production' && env.VITE_MOCK === '1') {
            throw new Error('VITE_MOCK=1 is development-only and cannot be deployed')
          }
          const origin = apiBase ? new URL(apiBase).origin : "'none'"
          return html.replace('<!-- CSP_INJECT -->', `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self' ${origin}; base-uri 'none'; form-action 'none">`)
        }
      }
    ],
    define: { __BUILD_SHA__: JSON.stringify(env.VERCEL_GIT_COMMIT_SHA || 'local') },
    server: { port: 5173 },
    build: { target: 'es2020', sourcemap: false },
    esbuild: { legalComments: 'none' }
  }
})
