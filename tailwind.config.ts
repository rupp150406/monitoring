import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.ts',
    './app.vue',
  ],

  theme: {
    extend: {
      colors: {
        // ── CRT phosphor green palette ──────────────────────────────────────
        'crt-black':   '#020502',   // page background
        'crt-surface': '#0A0D0A',   // card / panel background
        'crt-primary': '#4AFF8A',   // main text, active borders
        'crt-dimmed':  '#2D8F4E',   // inactive text, subtle borders
        'crt-amber':   '#FFB84A',   // ALL admin action buttons, timer badges

        // ── Status pill colors ──────────────────────────────────────────────
        'status-selesai': '#86EFAC',  // green — Selesai / Diterima
        'status-proses':  '#FCD34D',  // yellow — Proses
        'status-belum':   '#FCA5A5',  // red — Belum

        // ── Semantic aliases ────────────────────────────────────────────────
        'action-blue':   '#60A5FA',  // Konfirmasi Kedatangan
        'action-green':  '#4ADE80',  // Konfirmasi Sembelihan
        'action-orange': '#FB923C',  // Manual override pengulitan
        'action-purple': '#C084FC',  // Manual override pengemasan
      },

      fontFamily: {
        display: ['"VT323"', 'monospace'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },

      // ── Animation helpers ─────────────────────────────────────────────────
      keyframes: {
        scanlineSweep: {
          '0%':   { top: '-5px', opacity: '0.6' },
          '100%': { top: '100%', opacity: '0.0' },
        },
        rowShimmer: {
          '0%':   { backgroundColor: 'rgba(74,255,138,0.12)' },
          '100%': { backgroundColor: 'transparent' },
        },
        rippleExpand: {
          to: { transform: 'scale(2.5)', opacity: '0' },
        },
        phosphorBlink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
      animation: {
        'scanline-sweep': 'scanlineSweep 5s linear infinite',
        'row-shimmer':    'rowShimmer 1.2s ease-out forwards',
        'ripple-expand':  'rippleExpand 0.52s ease-out forwards',
        'phosphor-blink': 'phosphorBlink 1s step-end infinite',
      },

      // ── Box shadows: CRT glow effects ─────────────────────────────────────
      boxShadow: {
        'crt-primary': '0 0 8px rgba(74,255,138,0.4), 0 0 20px rgba(74,255,138,0.2)',
        'crt-amber':   '0 0 8px rgba(255,184,74,0.5), 0 0 20px rgba(255,184,74,0.25)',
        'crt-dimmed':  '0 0 4px rgba(45,143,78,0.3)',
      },
    },
  },

  plugins: [],
} satisfies Config