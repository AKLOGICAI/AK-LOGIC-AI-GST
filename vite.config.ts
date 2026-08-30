import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins: any[] = [
    react(),
    tailwindcss(),
    {
      name: 'inject-sw-version',
      writeBundle() {
        const swPath = path.resolve(__dirname, 'dist/sw.js');
        if (fs.existsSync(swPath)) {
          let swContent = fs.readFileSync(swPath, 'utf-8');
          swContent = swContent.replace('__CACHE_VERSION__', Date.now().toString());
          fs.writeFileSync(swPath, swContent);
        }
      }
    }
  ];
  try {
    // @ts-expect-error optional file, not part of the repo/type graph
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {
    // optional dev-only module; safe to ignore if absent
  }

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  const isProd = mode === 'production';
  // esbuild's `drop` option needs a plain mutable string-literal array —
  // conditionally spreading it (rather than assigning `undefined` when not
  // prod) keeps the return type stable across the ternary branches, which
  // is what defineConfig's async-function overload needs to type-check.
  const dropInProd: ('console' | 'debugger')[] = isProd ? ['console', 'debugger'] : [];

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
    build: {
      target: 'es2020' as const,
      // esbuild minifier (bundled with Vite, no extra dependency needed).
      minify: 'esbuild' as const,
      cssMinify: true,
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Split rarely-changing, heavy third-party code into its own
          // long-lived vendor chunks so a normal app deploy only
          // invalidates the small app chunk in returning visitors'
          // browser cache, instead of one giant bundle that must be
          // re-downloaded in full on every release.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('qrcode')) return 'vendor-qrcode';
            if (id.includes('react-router')) return 'vendor-router';
            if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
            // Anything else from node_modules is left unassigned so Rollup
            // groups it wherever it's actually used, instead of forcing it
            // into a single catch-all chunk that can end up circularly
            // importing the chunks above.
            return undefined;
          },
        },
      },
    },
    server: {
      port: 4173,
      proxy: {
        '/api': {
          target: 'https://gst-v1p5.onrender.com',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: 'https://gst-v1p5.onrender.com',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    // Strips console.*/debugger calls from the production bundle only —
    // dev builds keep them so debugging still works locally.
    esbuild: { drop: dropInProd },
  };
});
