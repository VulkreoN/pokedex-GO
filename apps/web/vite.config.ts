import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'MyDexPoGo',
        short_name: 'MyDexPoGo',
        description: 'Listes de Pokémon GO à partager entre amis',
        lang: 'fr',
        theme_color: '#f1f5f2',
        background_color: '#f1f5f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/ScrapedDuck/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'live', networkTimeoutSeconds: 6, expiration: { maxEntries: 8 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'cdn.leekduck.com' || url.hostname === 'leekduck.com',
            handler: 'CacheFirst',
            options: { cacheName: 'leekduck', expiration: { maxEntries: 1000, maxAgeSeconds: 14 * 86400 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/data/') && !url.pathname.endsWith('/status'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'dataset', expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'raw.githubusercontent.com' || (url.hostname === 'trade.pokemongopro.com' && url.pathname.startsWith('/assets/')),
            handler: 'CacheFirst',
            options: { cacheName: 'sprites', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 86400 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  // API_URL lets the test suite point the dev server or the production preview at a throwaway API.
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', changeOrigin: false } },
  },
});
