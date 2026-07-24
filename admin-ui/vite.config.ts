import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow serving packages/tenant-config, which lives outside this
      // project's root — plain relative imports, not a workspace package
      // yet. See the note at the top of packages/tenant-config/schema.ts.
      allow: ['..'],
    },
  },
})
