import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// When this build was made, for the About page.
process.env.VITE_BUILD_DATE ??= new Date().toISOString();

const noop = fileURLToPath(new URL('./src/lib/noop.ts', import.meta.url));

export default defineConfig({
  resolve: {
    // jsPDF declares optional html/svg rendering deps we never invoke in pdf.ts.
    alias: { html2canvas: noop, canvg: noop, dompurify: noop },
  },
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
        theme_color: '#158296',
        background_color: '#e9f4ea',
        display: 'standalone',
        start_url: '/',
        // A long press on the app's icon (Android, Chrome and Edge on computers; iOS has none).
        shortcuts: [
          { name: 'Ma dernière collection', short_name: 'Collection', url: '/lists/last', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Chercher un Pokémon', short_name: 'Chercher', url: '/dex?focus=search', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Raids du moment', short_name: 'Raids', url: '/game?tab=raids', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Mon code ami', short_name: 'Code ami', url: '/friends?qr=1', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/jspdf*.js', '**/jsQR*.js', '**/AdminPage*.js', '**/ReviewPage*.js'],
        navigateFallbackDenylist: [/^\/api\//, /^\/assets\//],
        importScripts: ['push-sw.js'],
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
            // Network first: a manager's correction shows on the next page load (the ETag makes it a cheap 304);
            // the cached copy keeps the app working offline or on a slow network.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/data/') && !url.pathname.endsWith('/status'),
            handler: 'NetworkFirst',
            options: { cacheName: 'dataset', networkTimeoutSeconds: 4, expiration: { maxEntries: 4 } },
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
