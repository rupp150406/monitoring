<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQurbanRealtime } from '@/composables/useQurbanEngine'
import type { GrupHewan } from '@/composables/useQurbanEngine'

definePageMeta({ layout: 'lapangan' })

useHead({
  title: 'Pemantauan Qurban | Live Monitor',
  meta: [
    { name: 'theme-color', content: '#f6fafe' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
  ],
})

const router   = useRouter()
const supabase = useSupabaseClient()

const LS_ACTOR_NAME = 'qurban_actor_name'
const operatorName  = ref('Panitia')

function loadOperatorFromStorage() {
  if (typeof window === 'undefined') return
  try { operatorName.value = window.localStorage.getItem(LS_ACTOR_NAME) ?? 'Panitia' } catch {}
}

// ─── Per-phase timestamps ─────────────────────────────────────────────────────
// Keyed by id_grup. Each slot holds the ISO string of the MOST RECENT
// log entry for that phase transition — so resets + re-triggers always
// show the latest event, never a stale one.
interface PhaseTimestamps {
  kedatangan_at: string | null  // latest: fase=kedatangan, status_baru=Diterima
  sembelihan_at: string | null  // latest: fase=sembelihan, status_baru=Selesai
  pengulitan_at: string | null  // latest: fase=pengulitan, status_baru=Selesai
  pengemasan_at: string | null  // latest: fase=pengemasan, status_baru=Selesai
}

const phaseTimestampMap = ref<Record<string, PhaseTimestamps>>({})

async function loadPhaseTimestamps(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('id_grup, fase, status_baru, created_at')
      .in('fase', ['kedatangan', 'sembelihan', 'pengulitan', 'pengemasan'])
      .order('created_at', { ascending: false }) // latest first → first match = most recent

    if (error) {
      console.error('[Pemantauan] loadPhaseTimestamps error:', error)
      return
    }

    const map: Record<string, PhaseTimestamps> = {}

    for (const row of data ?? []) {
      if (!row.id_grup) continue

      if (!map[row.id_grup]) {
        map[row.id_grup] = {
          kedatangan_at: null,
          sembelihan_at: null,
          pengulitan_at: null,
          pengemasan_at: null,
        }
      }

      const entry = map[row.id_grup]

      // First match per fase is always the most recent — skip once filled
      if (row.fase === 'kedatangan' && row.status_baru === 'Diterima' && !entry.kedatangan_at)
        entry.kedatangan_at = row.created_at

      if (row.fase === 'sembelihan' && row.status_baru === 'Selesai' && !entry.sembelihan_at)
        entry.sembelihan_at = row.created_at

      if (row.fase === 'pengulitan' && row.status_baru === 'Selesai' && !entry.pengulitan_at)
        entry.pengulitan_at = row.created_at

      if (row.fase === 'pengemasan' && row.status_baru === 'Selesai' && !entry.pengemasan_at)
        entry.pengemasan_at = row.created_at
    }

    phaseTimestampMap.value = map
  } catch (err) {
    console.error('[Pemantauan] loadPhaseTimestamps unexpected error:', err)
  }
}

// ─── Main data ────────────────────────────────────────────────────────────────
const isPageLoading = ref(true)
const fetchError    = ref('')
const grupList      = ref<GrupHewan[]>([])

async function loadGrup() {
  isPageLoading.value = true
  fetchError.value    = ''
  try {
    // Both fetches run in parallel — no sequential latency penalty
    const [grupResult] = await Promise.all([
      supabase
        .from('grup_hewan')
        .select('*, sohibul_qurban(*)')
        .order('id_grup', { ascending: true }),
      loadPhaseTimestamps(),
    ])

    if (grupResult.error) throw new Error(grupResult.error.message)
    grupList.value = (grupResult.data ?? []) as GrupHewan[]
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'Gagal memuat data.'
  } finally {
    isPageLoading.value = false
  }
}

// ─── Realtime ─────────────────────────────────────────────────────────────────
const { connect: connectRealtime, disconnect: disconnectRealtime, isSyncing } =
  useQurbanRealtime(grupList, {
    channelSuffix:    'pemantauan',
    onInsert:         () => { loadGrup() },
    onConnectionLost: () => { loadGrup() },
  })

const POLL_INTERVAL_MS = 20_000
let pollTimer: ReturnType<typeof setInterval> | null = null

async function resyncChannel() {
  await disconnectRealtime()
  connectRealtime()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') { loadGrup(); resyncChannel() }
}
function handleOnline() { loadGrup(); resyncChannel() }

// ─── Search & filter ──────────────────────────────────────────────────────────
const searchQuery  = ref('')
const FILTER_CYCLE = ['all', 'proses', 'belum', 'selesai'] as const
type FilterValue   = typeof FILTER_CYCLE[number]
const statusFilter = ref<FilterValue>('all')

function cycleFilter() {
  const idx = FILTER_CYCLE.indexOf(statusFilter.value)
  statusFilter.value = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length]
}

const filterLabel = computed(() => {
  const map: Record<FilterValue, string> = {
    all:     'Filter',
    proses:  'Proses',
    belum:   'Belum',
    selesai: 'Selesai',
  }
  return map[statusFilter.value]
})
const isFiltered = computed(() => statusFilter.value !== 'all')

// ─── Status helpers ───────────────────────────────────────────────────────────
function overallStatus(g: GrupHewan): 'SELESAI' | 'PROSES' | 'BELUM' {
  if (g.status_pengemasan === 'Selesai') return 'SELESAI'
  if (
    g.status_kedatangan === 'Diterima' ||
    g.status_sembelihan !== 'Belum'    ||
    g.status_pengulitan !== 'Belum'    ||
    g.status_pengemasan !== 'Belum'
  ) return 'PROSES'
  return 'BELUM'
}

type NodeState = 'done' | 'active' | 'transit' | 'pending'
type LineState = 'done' | 'active' | 'pending'

function getPipeline(g: GrupHewan) {
  const ts = phaseTimestampMap.value[g.id_grup] ?? null

  const k  = g.status_kedatangan === 'Diterima'
  const s  = g.status_sembelihan === 'Selesai'
  const sA = g.status_sembelihan === 'Proses'
  const p  = g.status_pengulitan === 'Selesai'
  const pA = g.status_pengulitan === 'Proses'
  const d  = g.status_pengemasan === 'Selesai'
  const dA = g.status_pengemasan === 'Proses'

  const nodes: { label: string; state: NodeState; timestamp: string | null }[] = [
    {
      label:     k ? 'Datang' : 'Transpor',
      state:     k ? 'done' : 'transit',
      // Only show time if animal has actually arrived
      timestamp: k ? formatTime(ts?.kedatangan_at) : null,
    },
    {
      label:     'Sembelih',
      state:     s ? 'done' : sA ? 'active' : 'pending',
      // Log entry beats column — reset+redo produces a new log row
      timestamp: s || sA
        ? formatTime(ts?.sembelihan_at ?? g.sembelih_selesai_at)
        : null,
    },
    {
      label:     'Cacah',
      state:     p ? 'done' : pA ? 'active' : 'pending',
      // Same priority: log first, column as fallback
      timestamp: p || pA
        ? formatTime(ts?.pengulitan_at ?? g.pengulitan_selesai_at)
        : null,
    },
    {
      label:     'Dikemas',
      state:     d ? 'done' : dA ? 'active' : 'pending',
      timestamp: d || dA
        ? formatTime(ts?.pengemasan_at)
        : null,
    },
  ]

  const lines: LineState[] = []
  for (let i = 0; i < 3; i++) {
    const curr = nodes[i]
    const next = nodes[i + 1]
    if (next.state === 'done') lines.push('done')
    else if (curr.state === 'done' && next.state === 'active') lines.push('active')
    else lines.push('pending')
  }

  return { nodes, lines }
}

// ─── Timestamp formatting ─────────────────────────────────────────────────────
function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour12:  false,
    hour:    '2-digit',
    minute:  '2-digit',
  })
}

// ─── Per-phase timestamp resolver ─────────────────────────────────────────────
// Priority logic per card status:
//
//   SELESAI → pengemasan_at (log) → pengulitan_at (log) → pengulitan_selesai_at (column)
//             → sembelihan_at (log) → sembelih_selesai_at (column)
//
//   PROSES  → pengulitan_at (log) → pengulitan_selesai_at (column)
//             → sembelihan_at (log) → sembelih_selesai_at (column)
//             → kedatangan_at (log)
//
//   BELUM   → label_tampilan text, no timestamp
//
// Log entries always beat column values because a reset + redo produces a new
// log row (latest-first query picks it up) while the column may or may not
// have been cleared by the reset operation.
function cardTimeInfo(g: GrupHewan, status: 'SELESAI' | 'PROSES' | 'BELUM'): string {
  const ts = phaseTimestampMap.value[g.id_grup] ?? null

  if (status === 'SELESAI') {
    const t =
      ts?.pengemasan_at       ??
      ts?.pengulitan_at       ??
      g.pengulitan_selesai_at ??
      ts?.sembelihan_at       ??
      g.sembelih_selesai_at
    return t ? `Selesai ${formatTime(t)}` : 'Selesai'
  }

  if (status === 'PROSES') {
    const t =
      ts?.pengulitan_at       ??
      g.pengulitan_selesai_at ??
      ts?.sembelihan_at       ??
      g.sembelih_selesai_at   ??
      ts?.kedatangan_at
    return t ? `Mulai ${formatTime(t)}` : 'Berjalan'
  }

  // BELUM — no meaningful timestamp yet
  return g.label_tampilan ?? 'Menunggu'
}

// ─── Sohibul formatter ────────────────────────────────────────────────────────
function formatSohibul(g: GrupHewan): string {
  const names = (g.sohibul_qurban ?? []).map(s => s.nama).filter(Boolean)
  if (names.length === 0) return 'Belum ada data'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names[0]} & ${names.length - 1} Orang lainnya`
}

// ─── Sort & display list ──────────────────────────────────────────────────────
const SORT_PRI: Record<string, number> = { PROSES: 0, BELUM: 1, SELESAI: 2 }

const displayList = computed(() => {
  let list = grupList.value
  const q  = searchQuery.value.trim().toLowerCase()

  if (q) {
    list = list.filter(g =>
      g.id_grup?.toLowerCase().includes(q) ||
      g.jenis_hewan?.toLowerCase().includes(q) ||
      (g.sohibul_qurban ?? []).some(s => s.nama?.toLowerCase().includes(q))
    )
  }

  if (statusFilter.value !== 'all') {
    const target = statusFilter.value.toUpperCase()
    list = list.filter(g => overallStatus(g) === target)
  }

  return [...list]
    .sort((a, b) => (SORT_PRI[overallStatus(a)] ?? 9) - (SORT_PRI[overallStatus(b)] ?? 9))
    .map(grup => {
      const status = overallStatus(grup)
      return {
        grup,
        status,
        pipeline: getPipeline(grup),
        timeInfo: cardTimeInfo(grup, status),
        sohibul:  formatSohibul(grup),
      }
    })
})

const countProses  = computed(() => grupList.value.filter(g => overallStatus(g) === 'PROSES').length)
const countBelum   = computed(() => grupList.value.filter(g => overallStatus(g) === 'BELUM').length)
const countSelesai = computed(() => grupList.value.filter(g => overallStatus(g) === 'SELESAI').length)

function goBack() { router.push('/team') }

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  loadOperatorFromStorage()
  await loadGrup()
  connectRealtime()
  pollTimer = setInterval(loadGrup, POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', handleOnline)
})

onUnmounted(() => {
  disconnectRealtime()
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('online', handleOnline)
})
</script>

<template>
  <div class="page-root">

    <header class="pm-header">
      <div class="pm-header-row1">
        <h1 class="pm-title">
          PEMANTAUAN
          <span class="pm-live-dot-wrap">
            <span class="pm-live-dot-ping" :class="{ 'is-syncing': isSyncing }"></span>
            <span class="pm-live-dot-core" :class="isSyncing ? 'is-syncing' : 'is-idle'"></span>
          </span>
        </h1>
        <div class="pm-op-chip">
          <span class="material-symbols-outlined" style="font-size:15px;color:#707974">badge</span>
          <span class="pm-op-name">{{ operatorName }}</span>
        </div>
      </div>

      <div class="pm-search-bar">
        <div class="pm-search-inner">
          <span class="material-symbols-outlined" style="font-size:20px">search</span>
          <input
            v-model="searchQuery"
            class="pm-search-input"
            placeholder="Cari ID, Jenis, atau Sohibul..."
            type="text"
          >
          <button v-if="searchQuery" class="pm-search-clear" type="button" @click="searchQuery = ''">
            <span class="material-symbols-outlined" style="font-size:18px">close</span>
          </button>
        </div>
        <button
          class="pm-filter-btn"
          :class="isFiltered ? 'is-active' : ''"
          type="button"
          @click="cycleFilter"
        >
          <span class="material-symbols-outlined" style="font-size:16px">filter_list</span>
          {{ filterLabel }}
        </button>
      </div>
    </header>

    <div class="pm-subheader">
      <span class="pm-subheader-label">ANTRIAN BERJALAN</span>
      <div class="pm-subheader-counts">
        <span class="count-active">{{ countProses }} aktif</span>
        <span class="count-sep">·</span>
        <span class="count-shown">{{ displayList.length }} tampil</span>
      </div>
    </div>

    <main class="pm-main">

      <Transition name="banner-fade">
        <div v-if="fetchError" class="pm-error-banner">
          <span class="material-symbols-outlined pm-error-icon" style="font-size:18px">error</span>
          <span class="pm-error-msg">{{ fetchError }}</span>
          <button class="pm-error-retry" type="button" @click="loadGrup">COBA LAGI</button>
        </div>
      </Transition>

      <template v-if="isPageLoading">
        <div v-for="n in 4" :key="n" class="card card--skeleton">
          <div class="skel-top">
            <div class="skel-col">
              <div class="shimmer-bg skel-id"></div>
              <div class="shimmer-bg skel-sub"></div>
            </div>
            <div class="shimmer-bg skel-badge"></div>
          </div>
          <div class="skel-pipeline">
            <div class="shimmer-bg skel-node"></div>
            <div class="shimmer-bg skel-line"></div>
            <div class="shimmer-bg skel-node"></div>
            <div class="shimmer-bg skel-line"></div>
            <div class="shimmer-bg skel-node"></div>
            <div class="shimmer-bg skel-line"></div>
            <div class="shimmer-bg skel-node"></div>
          </div>
          <div class="skel-footer">
            <div class="shimmer-bg skel-sohibul"></div>
          </div>
        </div>
      </template>

      <div v-else-if="displayList.length === 0" class="pm-empty">
        <span class="material-symbols-outlined pm-empty-icon">inbox</span>
        <p class="pm-empty-title">
          {{ searchQuery || isFiltered ? 'Tidak Ada Hasil' : 'Belum Ada Data' }}
        </p>
        <p class="pm-empty-desc">
          {{ searchQuery
              ? 'Tidak ada yang cocok dengan pencarian.'
              : isFiltered
                ? `Tidak ada grup dengan status ${filterLabel}.`
                : 'Belum ada data hewan tercatat.' }}
        </p>
      </div>

      <template v-else>
        <div
          v-for="item in displayList"
          :key="item.grup.id_grup"
          class="card"
          :class="item.status === 'PROSES' ? 'card--proses' : 'card--default'"
        >
<div class="card-top">
  <div class="card-id-col">
    <span class="card-id" :class="item.status === 'BELUM' ? 'is-dim' : ''">{{ item.grup.id_grup }}</span>
    <div class="card-meta">
      <span class="card-jenis" :class="item.status === 'BELUM' ? 'is-dim' : ''">{{ item.grup.jenis_hewan ?? '—' }}</span>
      <!-- Overall card time now reflects the CURRENT active phase only -->
      <span class="card-time" :class="item.status === 'BELUM' ? 'is-dim' : ''">{{ item.timeInfo }}</span>
    </div>
  </div>
  <span v-if="item.status === 'SELESAI'" class="badge badge--selesai">SELESAI</span>
  <span v-else-if="item.status === 'PROSES'" class="badge badge--proses">PROSES</span>
  <span v-else class="badge badge--belum">BELUM</span>
</div>

<div class="pipeline">
  <template v-for="(node, i) in item.pipeline.nodes" :key="i">
    <div class="pipeline-node">
      <div
        class="node-circle"
        :class="
          node.state === 'done'    ? 'node--done'    :
          (node.state === 'active' || node.state === 'transit') ? 'node--active' :
          'node--pending'
        "
      >
        <span v-if="node.state === 'done'"    class="material-symbols-outlined node-icon">check</span>
        <span v-else-if="node.state === 'active'"  class="material-symbols-outlined node-icon spin">sync</span>
        <span v-else-if="node.state === 'transit'" class="material-symbols-outlined node-icon">local_shipping</span>
      </div>
      <span
        class="node-label"
        :class="
          node.state === 'done'    ? 'label--done'   :
          (node.state === 'active' || node.state === 'transit') ? 'label--active' :
          'label--pending'
        "
      >{{ node.label }}</span>
      <!-- Per-phase timestamp sits directly under each node label -->
      <span
        v-if="node.timestamp"
        class="node-time"
        :class="node.state === 'done' ? 'node-time--done' : 'node-time--active'"
      >{{ node.timestamp }}</span>
    </div>
    <div
      v-if="i < item.pipeline.lines.length"
      class="pipeline-line"
      :class="item.pipeline.lines[i] === 'done' ? 'line--done' : 'line--pending'"
    >
      <div v-if="item.pipeline.lines[i] === 'active'" class="shimmer-line"></div>
    </div>
  </template>
</div>

          <div class="card-sohibul">
            <span class="material-symbols-outlined" style="font-size:14px">person</span>
            <span class="sohibul-name">{{ item.sohibul }}</span>
          </div>
        </div>
      </template>

      <div style="height:8px;flex-shrink:0"></div>
    </main>

    <footer class="pm-footer">
      <div class="footer-op">
        <span class="footer-op-label">Operator</span>
        <span class="footer-op-name">{{ operatorName }}</span>
      </div>
      <div class="footer-right">
        <div class="footer-counts">
          <span class="count-active">{{ countProses }} proses</span>
          <span class="count-sep">·</span>
          <span class="count-selesai">{{ countSelesai }} selesai</span>
          <span class="count-sep">·</span>
          <span class="count-shown">{{ countBelum }} menunggu</span>
        </div>
        <button class="footer-back-btn" type="button" @click="goBack">
          <span class="material-symbols-outlined" style="font-size:20px">chevron_left</span>
          <span class="footer-back-label">KEMBALI</span>
        </button>
      </div>
    </footer>

  </div>
</template>

<style>
html, body {
  height: 100%;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}
.material-symbols-outlined {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  font-family: 'Material Symbols Outlined';
  display: inline-flex;
  align-items: center;
  user-select: none;
}
</style>

<style scoped>
.page-root {
  --c-primary:           #003527;
  --c-on-primary:        #ffffff;
  --c-primary-fixed-dim: #95d3ba;
  --c-primary-container: #064e3b;
  --c-surface:           #f6fafe;
  --c-surface-low:       #f0f4f8;
  --c-surface-container: #eaeef2;
  --c-surface-lowest:    #ffffff;
  --c-surface-variant:   #dfe3e7;
  --c-on-surface:        #171c1f;
  --c-on-surface-var:    #404944;
  --c-outline:           #707974;
  --c-outline-var:       #bfc9c3;
  --c-border:            #E2E8F0;
  --c-secondary:         #006a61;
  --c-on-secondary:      #ffffff;
  --c-done:              #16A34A;
  --c-pending:           #D97706;
  --c-error:             #ba1a1a;
  --c-error-container:   #ffdad6;
  --c-on-error-container:#93000a;

  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--c-surface);
  color: var(--c-on-surface);
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Header */
.pm-header {
  position: sticky; top: 0; z-index: 50;
  background: rgba(246,250,254,0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--c-border);
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  flex-shrink: 0;
}
.pm-header-row1 { display: flex; justify-content: space-between; align-items: center; }
.pm-title {
  font-size: 18px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--c-primary); display: flex; align-items: center; gap: 8px; line-height: 1; margin: 0;
}
.pm-live-dot-wrap { position: relative; display: inline-flex; height: 8px; width: 8px; }
.pm-live-dot-ping { position: absolute; inset: 0; border-radius: 9999px; opacity: 0.75; }
.pm-live-dot-ping.is-syncing { background: var(--c-done); animation: ping 1s cubic-bezier(0,0,0.2,1) infinite; }
.pm-live-dot-core { position: relative; display: inline-flex; border-radius: 9999px; height: 8px; width: 8px; }
.pm-live-dot-core.is-syncing { background: var(--c-done); }
.pm-live-dot-core.is-idle    { background: var(--c-outline-var); }

.pm-op-chip {
  display: flex; align-items: center; gap: 6px;
  background: var(--c-surface-container); border: 1px solid var(--c-outline-var);
  border-radius: 8px; padding: 6px 10px;
}
.pm-op-name { font-size: 12px; font-weight: 700; color: var(--c-primary); }

.pm-search-bar {
  background: var(--c-surface-low); border: 1px solid var(--c-border);
  border-radius: 9999px; padding: 4px; display: flex; align-items: center; gap: 4px;
}
.pm-search-inner {
  flex: 1; display: flex; align-items: center; padding: 0 12px;
  gap: 8px; color: var(--c-on-surface-var); min-width: 0;
}
.pm-search-input {
  width: 100%; background: transparent; border: none; outline: none;
  font-size: 13px; color: var(--c-on-surface); font-family: inherit; padding: 4px 0;
}
.pm-search-input::placeholder { color: var(--c-outline); }
.pm-search-clear {
  flex-shrink: 0; background: none; border: none; cursor: pointer;
  color: var(--c-outline); display: flex; align-items: center; transition: color 0.15s;
}
.pm-search-clear:hover { color: var(--c-on-surface); }
.pm-filter-btn {
  border-radius: 9999px; padding: 4px 12px; font-size: 11px; font-weight: 600;
  display: flex; align-items: center; gap: 4px; border: none; cursor: pointer;
  flex-shrink: 0; background: var(--c-primary); color: var(--c-on-primary);
  transition: background 0.15s; font-family: inherit;
}
.pm-filter-btn.is-active { background: var(--c-secondary); color: var(--c-on-secondary); }

/* Sub-header */
.pm-subheader {
  background: var(--c-surface); padding: 8px 20px;
  border-bottom: 1px solid var(--c-border); flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
}
.pm-subheader-label { font-size: 12px; font-weight: 700; color: var(--c-on-surface-var); letter-spacing: 0.08em; text-transform: uppercase; }
.pm-subheader-counts { display: flex; align-items: center; gap: 8px; font-size: 11px; }

/* Main */
.pm-main {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.pm-main::-webkit-scrollbar { display: none; }
.pm-main { -ms-overflow-style: none; scrollbar-width: none; }

/* Error */
.pm-error-banner {
  display: flex; align-items: flex-start; gap: 8px; padding: 12px 16px;
  background: var(--c-error-container); border: 1px solid rgba(186,26,26,0.3); border-radius: 8px;
}
.pm-error-icon  { color: var(--c-error); flex-shrink: 0; margin-top: 2px; }
.pm-error-msg   { font-size: 12px; color: var(--c-on-error-container); flex: 1; line-height: 1.5; }
.pm-error-retry {
  font-size: 11px; font-weight: 700; color: var(--c-on-error-container);
  border: 1px solid rgba(147,0,10,0.4); border-radius: 4px; padding: 4px 8px;
  flex-shrink: 0; background: none; cursor: pointer; font-family: inherit;
}

/* Empty */
.pm-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 0; gap: 12px; text-align: center; }
.pm-empty-icon  { font-size: 48px; color: var(--c-outline-var); }
.pm-empty-title { font-size: 13px; font-weight: 700; color: var(--c-outline); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.pm-empty-desc  { font-size: 12px; color: var(--c-outline); max-width: 220px; line-height: 1.5; margin: 0; }

/* Cards */
.card {
  background: var(--c-surface-lowest); border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 16px; width: 100%;
  transition: box-shadow 0.15s, transform 0.1s;
}
.card:active { transform: scale(0.98); }
.card--default  { border: 1px solid var(--c-border); box-shadow: 0 1px 3px 0 rgba(0,0,0,0.05); }
.card--proses   { border: 1px solid #80bea6; box-shadow: 0 4px 15px rgba(22,163,74,0.08); }
.card--skeleton { border: 1px solid var(--c-border); box-shadow: none; }

.card-top { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; gap: 8px; }
.card-id-col { display: flex; flex-direction: column; min-width: 0; }
.card-id { font-size: 18px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-on-surface); }
.card-id.is-dim { opacity: 0.5; }
.card-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.card-jenis { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; background: var(--c-primary-container); color: var(--c-primary-fixed-dim); }
.card-jenis.is-dim { background: var(--c-surface-variant); color: var(--c-on-surface-var); }
.card-time { font-size: 11px; color: var(--c-on-surface-var); }
.card-time.is-dim { opacity: 0.6; }

.badge { font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 9999px; white-space: nowrap; flex-shrink: 0; }
.badge--selesai { color: #16A34A; border: 1px solid rgba(22,163,74,0.2); background: #DCFCE7; }
.badge--proses  { color: #D97706; border: 1px solid rgba(217,119,6,0.2); background: #FEF3C7; animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }
.badge--belum   { color: #EF4444; border: 1px solid rgba(239,68,68,0.2); background: #FEE2E2; }

/* Pipeline */
.pipeline { display: flex; align-items: center; justify-content: space-between; padding: 0 8px; width: 100%; }
.pipeline-node { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.node-circle { width: 32px; height: 32px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; }
.node--done    { background: #16A34A; box-shadow: 0 2px 6px rgba(22,163,74,0.3); }
.node--active  { border: 2px solid #D97706; background: white; }
.node--pending { border: 2px solid var(--c-surface-variant); background: transparent; }
.node-icon { font-size: 16px; color: white; }
.node--active .node-icon  { color: #D97706; }
.node--pending .node-icon { color: var(--c-on-surface-var); }

.node-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.label--done    { color: var(--c-on-surface-var); }
.label--active  { color: #D97706; }
.label--pending { color: rgba(64,73,68,0.4); }

.pipeline-line { flex: 1; height: 2px; margin: 0 4px; overflow: hidden; }
.line--done    { background: #16A34A; }
.line--pending { background: var(--c-surface-container); }
.shimmer-line  { height: 100%; background: #D97706; width: 50%; animation: shimmer-progress 2s cubic-bezier(0.4,0,0.2,1) infinite; }

.card-sohibul { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--c-border); font-size: 12px; color: var(--c-on-surface-var); width: 100%; }
.sohibul-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Skeleton */
.skel-top      { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.skel-col      { display: flex; flex-direction: column; gap: 8px; }
.skel-id       { height: 24px; width: 96px; border-radius: 4px; }
.skel-sub      { height: 16px; width: 144px; border-radius: 4px; }
.skel-badge    { height: 24px; width: 64px; border-radius: 9999px; }
.skel-pipeline { display: flex; align-items: center; padding: 0 8px; }
.skel-node     { width: 32px; height: 32px; border-radius: 9999px; flex-shrink: 0; }
.skel-line     { flex: 1; height: 2px; margin: 0 4px; }
.skel-footer   { padding-top: 12px; border-top: 1px solid var(--c-border); }
.skel-sohibul  { height: 16px; width: 75%; border-radius: 4px; }
.shimmer-bg { background: #eaeef2; position: relative; overflow: hidden; }
.shimmer-bg::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.65) 50%, transparent 75%);
  background-size: 200% 100%;
  animation: shimmer-sweep 1.4s infinite ease-in-out;
}

/* Footer */
.pm-footer { background: var(--c-surface-lowest); border-top: 1px solid var(--c-border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.footer-op       { display: flex; flex-direction: column; gap: 2px; }
.footer-op-label { font-size: 10px; font-weight: 700; color: var(--c-outline); text-transform: uppercase; letter-spacing: 0.05em; }
.footer-op-name  { font-size: 13px; font-weight: 700; color: var(--c-primary); }
.footer-right    { display: flex; align-items: center; gap: 12px; }
.footer-counts   { display: none; align-items: center; gap: 8px; font-size: 11px; }

.count-active  { color: #D97706; font-weight: 600; }
.count-selesai { color: #16A34A; font-weight: 600; }
.count-sep     { color: var(--c-outline); }
.count-shown   { color: var(--c-outline); font-weight: 600; }

.footer-back-btn {
  display: flex; align-items: center; gap: 4px; background: none; border: none;
  cursor: pointer; padding: 6px 12px; border-radius: 8px; transition: background 0.15s, transform 0.1s;
  color: var(--c-secondary); font-family: inherit;
}
.footer-back-btn:hover  { background: rgba(0,106,97,0.05); }
.footer-back-btn:active { transform: scale(0.95); }
.footer-back-label { font-size: 12px; font-weight: 700; color: var(--c-primary); }

/* Animations */
.spin { animation: spin 1s linear infinite; }

@keyframes ping            { 75%, 100% { transform: scale(2); opacity: 0; } }
@keyframes pulse           { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes spin            { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes shimmer-sweep   { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes shimmer-progress{ 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }

/* Transitions */
.banner-fade-enter-active, .banner-fade-leave-active { transition: all 0.2s ease; }
.banner-fade-enter-from, .banner-fade-leave-to       { opacity: 0; transform: translateY(-6px); }

@media (min-width: 640px) { .footer-counts { display: flex; } }
</style>