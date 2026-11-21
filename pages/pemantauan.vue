<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQurbanRealtime } from '@/composables/useQurbanEngine'
import type { GrupHewan } from '@/composables/useQurbanEngine'

definePageMeta({ layout: 'lapangan' })

useHead({
  title: 'Pemantauan Qurban | Live Monitor',
  meta: [
    { name: 'theme-color', content: '#0A0E13' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap' },
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
      <h1 class="pm-title">
        PEMANTAUAN
        <span class="pm-live-dot-wrap">
          <span class="pm-live-dot-ping" :class="{ 'is-syncing': isSyncing }"></span>
          <span class="pm-live-dot-core" :class="isSyncing ? 'is-syncing' : 'is-idle'"></span>
        </span>
      </h1>
    </header>

    <div class="pm-search-bar">
      <div class="pm-search-inner">
        <span class="material-symbols-outlined pm-search-icon">search</span>
        <input
          v-model="searchQuery"
          class="pm-search-input"
          placeholder="Cari ID, Jenis, atau Sohibul..."
          type="text"
        >
        <button v-if="searchQuery" class="pm-search-clear" type="button" @click="searchQuery = ''">
          <span class="material-symbols-outlined pm-search-clear-icon">close</span>
        </button>
      </div>
      <button
        class="pm-filter-btn"
        :class="isFiltered ? 'is-active' : ''"
        type="button"
        @click="cycleFilter"
      >
        <span class="material-symbols-outlined pm-filter-icon">filter_list</span>
        <span class="pm-filter-label">{{ filterLabel }}</span>
      </button>
    </div>

    <div class="pm-subheader">
      <span class="pm-subheader-label">ANTRIAN BERJALAN</span>
      <div class="pm-subheader-counts">
        <span class="count-chip count-chip--active">{{ countProses }} aktif</span>
        <span class="count-chip count-chip--shown">{{ displayList.length }} tampil</span>
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
        >
          <div class="card-row">
            <div class="card-identity">
              <span class="card-id-chip">
                <span class="card-id">{{ item.grup.id_grup }}</span>
              </span>
              <span class="card-jenis" :class="item.status === 'BELUM' ? 'is-dim' : ''">{{ item.grup.jenis_hewan ?? '—' }}</span>
            </div>
            <span v-if="item.status === 'SELESAI'" class="badge badge--selesai">SELESAI</span>
            <span v-else-if="item.status === 'PROSES'" class="badge badge--proses">
              <span class="badge-dot"></span>PROSES
            </span>
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
            <div class="sohibul-left">
              <span class="material-symbols-outlined sohibul-icon">person</span>
              <span class="sohibul-name">{{ item.sohibul }}</span>
            </div>
            <!-- Overall card time now reflects the CURRENT active phase only -->
            <span class="card-time" :class="item.status === 'BELUM' ? 'is-dim' : ''">{{ item.timeInfo }}</span>
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
      <button class="footer-back-btn" type="button" @click="goBack">
        <span class="footer-back-label">KEMBALI</span>
      </button>
    </footer>

  </div>
</template>

<style>
html, body {
  margin: 0; padding: 0;
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
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  padding-top: max(20px, env(safe-area-inset-top));
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  background: #0A0E13;
  color: #E6EDF3;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Header */
.pm-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 29px;
}
.pm-title {
  display: flex; align-items: center; gap: 10px; margin: 0;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 24px; font-weight: 900; line-height: 29px;
  letter-spacing: -0.01em; color: #FFFFFF; white-space: nowrap;
}
.pm-live-dot-wrap { position: relative; display: inline-flex; height: 10px; width: 10px; }
.pm-live-dot-ping { position: absolute; inset: 0; border-radius: 9999px; opacity: 0; }
.pm-live-dot-ping.is-syncing { background: #34D399; animation: ping 1.4s cubic-bezier(0,0,0.2,1) infinite; }
.pm-live-dot-core { position: relative; display: inline-flex; border-radius: 9999px; height: 10px; width: 10px; }
.pm-live-dot-core.is-syncing { background: #34D399; }
.pm-live-dot-core.is-idle    { background: #5B6776; }

.pm-search-bar {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  height: 47px; padding: 6px 6px 6px 16px;
  border-radius: 24px; background: #11171E;
}
.pm-search-inner {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px;
}
.pm-search-icon { font-size: 18px; color: #7D8A99; }
.pm-search-input {
  flex: 1; min-width: 0; padding: 0;
  background: transparent; border: none; outline: none;
  font-family: 'Inter', sans-serif; font-size: 14px; color: #E6EDF3;
}
.pm-search-input::placeholder { color: #5B6776; }
.pm-search-clear {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  background: none; border: none; padding: 0; cursor: pointer; color: #7D8A99;
}
.pm-search-clear-icon { font-size: 18px; }
.pm-filter-btn {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 6px;
  height: 35px; padding: 0 14px;
  border: none; border-radius: 9999px;
  background: #271F45; color: #C4B5FD;
  cursor: pointer; font-family: inherit;
}
.pm-filter-btn.is-active { background: #271F45; color: #C4B5FD; }
.pm-filter-icon { font-size: 15px; color: #C4B5FD; }
.pm-filter-label {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 11px; font-weight: 800; line-height: 1;
  letter-spacing: 0.06em; text-transform: uppercase;
}

.pm-search-icon,
.pm-filter-icon,
.sohibul-icon,
.node-icon {
  font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

/* Sub-header */
.pm-subheader {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: 24px;
}
.pm-subheader-label {
  font-size: 12px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: #7D8A99;
}
.pm-subheader-counts { display: flex; align-items: center; gap: 6px; }
.count-chip {
  display: inline-flex; align-items: center; height: 24px; padding: 0 10px;
  border-radius: 9999px; white-space: nowrap;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px; font-weight: 800; line-height: 1;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.count-chip--active { background: #33260C; color: #FCD34D; }
.count-chip--shown  { background: #1B2530; color: #9AA7B5; }

/* Main */
.pm-main {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 14px; padding-bottom: 8px;
}
.pm-main::-webkit-scrollbar { display: none; }
.pm-main { -ms-overflow-style: none; scrollbar-width: none; }

/* Error */
.pm-error-banner {
  display: flex; align-items: flex-start; gap: 8px; padding: 12px;
  background: #2A1218; border-radius: 18px;
}
.pm-error-icon  { font-size: 18px; color: #FDA4AF; flex-shrink: 0; margin-top: 2px; }
.pm-error-msg   { font-size: 12px; font-weight: 600; color: #FDA4AF; flex: 1; line-height: 1.4; }
.pm-error-retry {
  font-size: 10px; font-weight: 800; letter-spacing: 0.06em; color: rgba(253,164,175,0.8);
  border: none; padding: 0; flex-shrink: 0; background: none; cursor: pointer;
  font-family: inherit;
}

/* Empty */
.pm-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 0; gap: 12px; text-align: center; }
.pm-empty-icon  { font-size: 48px; color: #1B2530; }
.pm-empty-title { font-family: 'Montserrat', 'Inter', sans-serif; font-size: 13px; font-weight: 800; color: #9AA7B5; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.pm-empty-desc  { font-size: 12px; color: #7D8A99; max-width: 220px; line-height: 1.5; margin: 0; }

/* Cards */
.card {
  background: #11171E; border-radius: 24px; padding: 16px;
  display: flex; flex-direction: column; gap: 14px; width: 100%;
  transition: transform 0.1s;
}
.card:active { transform: scale(0.99); }
.card--skeleton { background: #11171E; }

.card-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-height: 33px; }
.card-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.card-id-chip { display: inline-flex; align-items: center; padding: 8px; border-radius: 12px; background: #1B2530; flex-shrink: 0; }
.card-id { font-family: 'Montserrat', 'Inter', sans-serif; font-size: 14px; font-weight: 900; line-height: 17px; color: #FFFFFF; white-space: nowrap; }
.card-jenis {
  font-family: 'Montserrat', 'Inter', sans-serif; font-size: 17px; font-weight: 800; line-height: 21px;
  color: #FFFFFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.card-jenis.is-dim { color: #9AA7B5; }
.card-time { flex-shrink: 0; font-size: 12px; font-weight: 700; color: #7D8A99; }
.card-time.is-dim { opacity: 0.6; }

.badge {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px 0 8px; border-radius: 9999px; flex-shrink: 0;
  font-family: 'Montserrat', 'Inter', sans-serif; font-size: 10px; font-weight: 800;
  line-height: 1; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap;
}
.badge--selesai { background: #0F2D25; color: #6EE7B7; padding: 0 8px; }
.badge--proses  { background: #33260C; color: #FCD34D; }
.badge--belum   { background: #2A1218; color: #FDA4AF; padding: 0 8px; }
.badge-dot { width: 6px; height: 6px; border-radius: 9999px; background: #FCD34D; }

/* Pipeline */
.pipeline { display: flex; align-items: flex-start; width: 100%; }
.pipeline-node { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 54px; flex-shrink: 0; }
.node-circle { width: 36px; height: 36px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.node--done    { background: #34D399; }
.node--active,
.node--transit { background: #33260C; }
.node--pending { background: #1B2530; }
.node-icon { font-size: 16px; }
.node--done .node-icon              { color: #052E22; }
.node--active .node-icon,
.node--transit .node-icon           { color: #FCD34D; }

.node-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; line-height: 11px; }
.label--done    { color: #9AA7B5; }
.label--active  { color: #FCD34D; }
.label--pending { color: #5B6776; }

.node-time { font-size: 10px; font-weight: 600; line-height: 12px; }
.node-time--done   { color: #6EE7B7; }
.node-time--active { color: #FCD34D; }

.pipeline-line { flex: 1; min-width: 0; height: 4px; margin-top: 16px; border-radius: 2px; overflow: hidden; }
.line--done    { background: #34D399; }
.line--pending { background: #1B2530; }
.shimmer-line  { height: 100%; width: 50%; border-radius: 2px; background: #FCD34D; animation: shimmer-progress 2s cubic-bezier(0.4,0,0.2,1) infinite; }

.card-sohibul { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
.sohibul-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sohibul-icon { font-size: 12px; color: #7D8A99; flex-shrink: 0; }
.sohibul-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #9AA7B5; }

/* Skeleton */
.skel-top      { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.skel-col      { display: flex; flex-direction: column; gap: 8px; }
.skel-id       { height: 33px; width: 96px; border-radius: 12px; }
.skel-sub      { height: 16px; width: 144px; border-radius: 8px; }
.skel-badge    { height: 28px; width: 77px; border-radius: 9999px; }
.skel-pipeline { display: flex; align-items: flex-start; }
.skel-node     { width: 36px; height: 36px; border-radius: 9999px; flex-shrink: 0; margin: 0 9px; }
.skel-line     { flex: 1; height: 4px; margin-top: 16px; border-radius: 2px; }
.skel-footer   { display: flex; }
.skel-sohibul  { height: 16px; width: 75%; border-radius: 8px; }
.shimmer-bg { background: #1B2530; position: relative; overflow: hidden; }
.shimmer-bg::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.07) 50%, transparent 75%);
  background-size: 200% 100%;
  animation: shimmer-sweep 1.4s infinite ease-in-out;
}

/* Footer */
.pm-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px; border-radius: 28px; background: #11171E;
}
.footer-op       { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.footer-op-label { font-size: 10px; font-weight: 700; color: #7D8A99; text-transform: uppercase; letter-spacing: 0.1em; }
.footer-op-name  { font-family: 'Montserrat', 'Inter', sans-serif; font-size: 16px; font-weight: 800; line-height: 20px; color: #FFFFFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.footer-back-btn {
  flex-shrink: 0; display: flex; align-items: center; height: 41px; padding: 0 13px;
  border: none; border-radius: 18px; background: #1B2530;
  cursor: pointer; font-family: inherit; transition: background 0.15s, transform 0.08s;
}
.footer-back-btn:hover  { background: #223040; }
.footer-back-btn:active { transform: scale(0.98); }
.footer-back-label { font-family: 'Montserrat', 'Inter', sans-serif; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: #FFFFFF; }

/* Animations */
.spin { animation: spin 1s linear infinite; }

@keyframes ping            { 75%, 100% { transform: scale(2); opacity: 0; } }
@keyframes spin            { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes shimmer-sweep   { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes shimmer-progress{ 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }

/* Transitions */
.banner-fade-enter-active, .banner-fade-leave-active { transition: all 0.2s ease; }
.banner-fade-enter-from, .banner-fade-leave-to       { opacity: 0; transform: translateY(-6px); }
</style>