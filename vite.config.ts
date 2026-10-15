import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/skrafl-pwa/',
  build: { outDir: 'dist' },
  plugins: [
    {
      name: 'require-dictionary',
      apply: 'build',
      buildStart() {
        if (!existsSync(fileURLToPath(new URL('./public/dict/dict-manifest.json', import.meta.url)))) {
          this.error('Missing dictionary. Run npm run build:dict before building the application.');
        }
      },
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Skraflhjálp',
        short_name: 'Skraflhjálp',
        lang: 'is',
        display: 'standalone',
        start_url: '/skrafl-pwa/',
        scope: '/skrafl-pwa/',
        theme_color: '#174c3c',
        background_color: '#f7f8f4',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'dict/*'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/\/dict\//],
      },
    }),
  ],
});
