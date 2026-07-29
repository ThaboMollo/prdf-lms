import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single copy of React (and the other stateful singletons) into
    // the bundle regardless of where an import gets resolved from.
    //
    // packages/ui-kit and packages/client-core are consumed as source via
    // relative paths, so their `import ... from 'react'` resolves to the
    // nearest node_modules — theirs, not this app's, if one exists there.
    // npm >=7 auto-installs peerDependencies, so a plain `npm install` inside
    // those packages was enough to materialise a second React and break every
    // hook at runtime ("null is not an object (evaluating 'useState')"),
    // while still building cleanly. Their peers are now marked optional so
    // npm stops doing that; this is the backstop so it cannot come back
    // silently.
    // Must list EVERY bare specifier imported by packages/* that are consumed
    // as source (ui-kit, client-core, domain, tenant-config). Those packages
    // deliberately have no node_modules of their own — installing deps there is
    // what produced a duplicate React — so Vite has nothing to resolve against
    // when walking up from their directory. `dedupe` forces resolution from
    // this app's root, which fixes resolution AND guarantees a single copy.
    //
    // Omitting one is not a subtle bug: the build fails outright with
    // "Could not resolve <pkg> imported by ui-kit". Keep in sync with:
    //   grep -rhoE "from '[^.'][^']*'" packages/ui-kit packages/client-core \
    //     packages/domain packages/tenant-config --include='*.ts*' | sort -u
    dedupe: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@sentry/react',
      '@supabase/supabase-js',
      'zod',
    ],
  },
  server: {
    fs: {
      // Allow serving packages/tenant-config, which lives outside this
      // project's root — plain relative imports, not a workspace package
      // yet. See the note at the top of packages/tenant-config/schema.ts.
      allow: ['..'],
    },
  },
})
