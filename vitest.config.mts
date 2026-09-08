import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Un solo fork: los specs comparten la MISMA base de datos y cada uno
    // crea sus fixtures de tenant/usuario al arrancar — en paralelo se
    // pisan (Not Found intermitentes). Mismo criterio que Playwright
    // (workers: 1, "database race conditions on seeded records").
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
