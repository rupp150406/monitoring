// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'
import mkcert from 'vite-plugin-mkcert'

export default defineNuxtConfig({
  devtools: { enabled: true },

  // ── Modules ────────────────────────────────────────────────────────────────
  modules: [
    '@nuxtjs/supabase',
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt',
  ],

  // ── CSS ────────────────────────────────────────────────────────────────────

  // ── Supabase ───────────────────────────────────────────────────────────────
  supabase: {
    // Reads SUPABASE_URL and SUPABASE_KEY from .env automatically.
    // Disable redirect so admin.vue controls its own auth state.
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    types: undefined, 
    redirect: false,
  },

  // ── PWA ────────────────────────────────────────────────────────────────────
  pwa: {
    // Only the /lapangan/ scope is installed as a PWA.
    // The monitor (/) and admin (/admin) pages are regular web routes.
    scope: '/lapangan/',
    base: '/lapangan/',

    manifest: {
      name: 'AhsanTV Qurban Lapangan',
      short_name: 'Qurban Scan',
      description: 'Field QR scanner for Eid al-Adha sacrifice logistics',
      theme_color: '#0F4C3A',
      background_color: '#020502',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/lapangan/scan',
      scope: '/lapangan/',
      icons: [
        {
          src: '/pwa-icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/pwa-icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: '/pwa-icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },

    workbox: {
      // Cache the lapangan pages and their assets for offline use.
      navigateFallback: '/lapangan/scan',
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      runtimeCaching: [
        {
          // Supabase REST API — network-first, fall back to cache
          urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'supabase-rest',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 50, maxAgeSeconds: 60 },
          },
        },
      ],
    },

    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600, // Re-check for updates every hour
    },

    devOptions: {
      enabled: false, // Set true briefly to test PWA in dev
      type: 'module',
    },
  },

  // ── App head ───────────────────────────────────────────────────────────────
  app: {
    head: {
      charset: 'utf-8',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#020502' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        // VT323 — display / terminal headers
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;600&display=swap',
        },
      ],
    },
  },

  // ── Runtime config ─────────────────────────────────────────────────────────
  runtimeConfig: {
    public: {
      appVersion: '2.0.0',
    },
  },

  // ── TypeScript ─────────────────────────────────────────────────────────────
  typescript: {
    strict: true,
    typeCheck: false, // Enable in CI, not dev (too slow)
  },

  // ── Compat ─────────────────────────────────────────────────────────────────
  compatibilityDate: '2024-11-01',

    vite: {
    optimizeDeps: {
      include: [
        '@supabase/supabase-js',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'html5-qrcode',
        'xlsx',
      ]
    },
    plugins: [mkcert()]
  },
  devServer: {
    https: true // Aktifkan server HTTPS bawaan Nuxt
  },
})