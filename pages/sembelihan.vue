<script setup lang="ts">
// ─── sembelihan.vue ─────────────────────────────────────────────────────────────────────
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQurbanRealtime } from '@/composables/useQurbanEngine'
import type { GrupHewan } from '@/composables/useQurbanEngine'

definePageMeta({ layout: 'lapangan' })

useHead({
  title: 'Sembelihan Terminal',
  meta: [
    { name: 'theme-color', content: '#f0f4f8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' }
  ]
})

const router   = useRouter()
const supabase = useSupabaseClient()

// ── Operator identity (display only) ────────────────────────────────────────
const operatorNameInput = ref('Jamaah')
const LS_ACTOR_NAME     = 'qurban_actor_name'
const LS_ACTOR_ID       = 'qurban_actor_id'
const operatorId        = ref('anonymous')

function loadOperatorFromStorage() {
  if (typeof window === 'undefined') return
  try {
    operatorNameInput.value = window.localStorage.getItem(LS_ACTOR_NAME) ?? 'Jamaah'
    operatorId.value        = window.localStorage.getItem(LS_ACTOR_ID)   ?? 'anonymous'
  } catch {}
}

function commitOperator() {
  const name = operatorNameInput.value.trim() || 'Jamaah'
  operatorNameInput.value = name
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_ACTOR_NAME, name)
      window.localStorage.setItem(LS_ACTOR_ID, operatorId.value)
    } catch {}
  }
}

// ── Data fetching ─────────────────────────────────────────────────────────────
const isPageLoading = ref(true)
const fetchError    = ref('')
const grupList      = ref<GrupHewan[]>([])

async function loadGrupSembelihan() {
  isPageLoading.value = true
  fetchError.value = ''
  try {
    const { data, error } = await supabase
      .from('grup_hewan')
      .select('*, sohibul_qurban(*)')
      .order('id_grup', { ascending: true })
    if (error) throw new Error(error.message)
    grupList.value = (data ?? []) as GrupHewan[]
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'Gagal memuat data.'
  } finally {
    isPageLoading.value = false
  }
}

// ── Realtime (display-only sync via the shared engine composable) ────────────
// Mirrors the pattern used in pages/team/index.vue:
//   • UPDATE  → applyUpdate() patches grupList in-place, no refetch needed.
//   • INSERT  → can't be merged by id yet, so refetch the full list.
//   • CHANNEL_ERROR / TIMED_OUT → refetch to recover any changes that landed
//     while the channel was down.
const { connect: connectRealtime, disconnect: disconnectRealtime, isSyncing } = useQurbanRealtime(grupList, {
  channelSuffix: 'sembelihan',
  onInsert: () => { loadGrupSembelihan() },
  onConnectionLost: () => { loadGrupSembelihan() },
})

// ── Resilience nets ──────────────────────────────────────────────────────────
// Field tablets sleep, lose signal, and get backgrounded — situations where a
// websocket can die silently without ever firing CHANNEL_ERROR/TIMED_OUT (the
// only signals useQurbanRealtime listens for). These three nets catch that:
//
// 1. A slow background poll as a last-resort safety net independent of the
//    socket entirely — if Realtime is ever misconfigured on the Supabase
//    project (replication not enabled for grup_hewan, or RLS blocking SELECT
//    for this role), this is what keeps the page from going permanently stale.
// 2. Refetch + force a fresh channel the instant the tab becomes visible again.
// 3. Refetch + force a fresh channel the instant the browser reports back online.
const POLL_INTERVAL_MS = 20_000
let pollTimer: ReturnType<typeof setInterval> | null = null

async function resyncChannel() {
  await disconnectRealtime()
  connectRealtime()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadGrupSembelihan()
    resyncChannel()
  }
}

function handleOnline() {
  loadGrupSembelihan()
  resyncChannel()
}

// ── Computed ──────────────────────────────────────────────────────────────────
// grupList now holds the FULL table (see loadGrupSembelihan above), so the
// upstream gate (animal must already be checked in / "Diterima") happens here,
// client-side, instead of in the query. This is what lets realtime UPDATEs
// work correctly: applyUpdate() can only patch rows already in the local
// array, so a row that just became eligible (status_kedatangan just flipped
// to 'Diterima') has to already be present locally — a server-side .eq()
// filter would have excluded it, and the UPDATE event would've been dropped.
const grupEligible = computed(() => grupList.value.filter((g) => g.status_kedatangan === 'Diterima'))
const grupBelum    = computed(() => grupEligible.value.filter((g) => g.status_sembelihan === 'Belum'))
const grupSelesai  = computed(() => grupEligible.value.filter((g) => g.status_sembelihan === 'Selesai'))

// ── Navigation ────────────────────────────────────────────────────────────────
function openQrScanner() {
  router.push('/scan?fase=sembelihan')
}

function Index() {
  router.push('/team')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sohibulNames(grup: GrupHewan): string {
  const names = (grup.sohibul_qurban ?? []).map((s) => s.nama).filter(Boolean)
  return names.length > 0 ? names.slice(0, 2).join(', ') + (names.length > 2 ? '...' : '') : '—'
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('id-ID', { hour12: true, hour: '2-digit', minute: '2-digit' })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
// Fetch first, then connect — same ordering as pages/team/index.vue.
onMounted(async () => {
  loadOperatorFromStorage()
  await loadGrupSembelihan()
  connectRealtime()

  pollTimer = setInterval(loadGrupSembelihan, POLL_INTERVAL_MS)
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

    <!-- ── HEADER ──────────────────────────────────────────────────────────── -->
    <header class="topbar">
      <div class="topbar-left">
        <h2 class="topbar-title">SEMBELIHAN</h2>
        <div class="live-dot-wrap" :class="{ 'live-dot-wrap--offline': !isSyncing }">
          <span class="live-dot-ping"></span>
          <span class="live-dot"></span>
        </div>
      </div>
      <div class="operator-chip">
        <span class="material-symbols-outlined chip-icon">badge</span>
      <span class="chip-text">{{ operatorNameInput }}</span>
      </div>
    </header>

    <!-- ── MAIN CANVAS ─────────────────────────────────────────────────────── -->
    <main class="canvas">

      <!-- Actions & Stats -->
      <div class="actions-block">
        <!-- QR Scan button -->
        <button class="qr-btn" @click="openQrScanner">
          <span class="material-symbols-outlined" style="font-size:24px">qr_code_scanner</span>
          <span class="qr-btn-label">BUKA KAMERA QR SCAN</span>
        </button>
        

        <!-- Stats row -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Antrian</span>
            <div class="stat-value stat-value--pending">{{ grupBelum.length }}</div>
          </div>
          <div class="stat-card">
            <span class="stat-label">Selesai</span>
            <div class="stat-value stat-value--completed">{{ grupSelesai.length }}</div>
          </div>
          <div class="stat-card">
            <span class="stat-label">TOTAL</span>
            <div class="stat-value stat-value--total">{{ grupEligible.length }}</div>
          </div>
        </div>
      </div>

      <!-- Error banner -->
      <Transition name="slide-down">
        <div v-if="fetchError" class="error-banner">
          <span class="material-symbols-outlined" style="font-size:18px;color:#ba1a1a">error</span>
          <span class="error-text">{{ fetchError }}</span>
          <button class="error-dismiss" @click="fetchError = ''">TUTUP</button>
        </div>
      </Transition>

      <!-- Data section (ported from pengulitan.vue's "Emerald Governance" data UI) -->
      <div class="data-section">

        <!-- Section header -->
        <div class="sbh-list-header">
          <span class="sbh-list-title">Data Sembelihan</span>
          <span class="sbh-list-status" :class="{ 'sbh-list-status--offline': !isSyncing }">
            {{ isSyncing ? 'LIVE' : 'MENYAMBUNGKAN...' }}
          </span>
        </div>

        <!-- Skeleton -->
        <div v-if="isPageLoading" class="sbh-skeleton-list">
          <div v-for="n in 3" :key="n" class="sbh-skeleton-card">
            <div class="sbh-skel-line sbh-skel-line--h" :style="{ width: (40 + n * 11) + '%' }"></div>
            <div class="sbh-skel-line sbh-skel-line--s" :style="{ width: (55 + n * 5) + '%' }"></div>
          </div>
        </div>

        <!-- Empty -->
        <div v-else-if="grupEligible.length === 0" class="sbh-empty">
          <span class="material-symbols-outlined sbh-empty-icon">inbox</span>
          <span class="sbh-empty-title">BELUM ADA DATA</span>
          <span class="sbh-empty-sub">Belum ada hewan dengan status Kedatangan = Diterima.</span>
        </div>

        <template v-else>

          <!-- ── ANTRIAN (Belum) ─────────────────────────────── -->
          <div v-if="grupBelum.length > 0" class="sbh-section">
            <div class="sbh-section-heading">
              ANTRIAN
              <span class="sbh-section-count">{{ grupBelum.length }}</span>
            </div>

            <div
              v-for="grup in grupBelum"
              :key="grup.id_grup"
              class="sbh-card"
            >
              <div class="sbh-card-accent accent--belum"></div>
              <div class="sbh-card-row">
                <div class="sbh-card-identity">
                  <span class="sbh-id-chip">{{ grup.id_grup }}</span>
                  <span class="sbh-jenis">{{ grup.jenis_hewan ?? '—' }}</span>
                </div>
                <div class="sbh-card-right">
                  <span class="sbh-status-badge badge--belum">MENUNGGU</span>
                  <span v-if="grup.sembelih_selesai_at" class="sbh-time-label">{{ formatTime(grup.sembelih_selesai_at) }}</span>
                  <span v-if="grup.is_timer_active" class="sbh-timer-chip">
                    <span class="material-symbols-outlined" style="font-size:11px">timer</span>
                    TIMER
                  </span>
                </div>
              </div>
              <p class="sbh-sohibul">Sohibul: {{ sohibulNames(grup) }}</p>
              <p v-if="grup.label_tampilan" class="sbh-label-tampilan">{{ grup.label_tampilan }}</p>
            </div>
          </div>

          <!-- ── SELESAI ─────────────────────────────────────── -->
          <div v-if="grupSelesai.length > 0" class="sbh-section">
            <div class="sbh-section-heading heading--done">
              SELESAI
              <span class="sbh-section-count">{{ grupSelesai.length }}</span>
            </div>

            <div
              v-for="grup in grupSelesai"
              :key="grup.id_grup"
              class="sbh-card card--done"
            >
              <div class="sbh-card-accent accent--selesai"></div>
              <div class="sbh-card-row">
                <div class="sbh-card-identity">
                  <span class="sbh-id-chip">{{ grup.id_grup }}</span>
                  <span class="sbh-jenis">{{ grup.jenis_hewan ?? '—' }}</span>
                </div>
                <span class="sbh-status-badge badge--selesai">SELESAI</span>
              </div>
              <p class="sbh-sohibul">Sohibul: {{ sohibulNames(grup) }}</p>
              <p class="sbh-ts">Selesai: {{ formatTime(grup.sembelih_selesai_at) }}</p>
            </div>
          </div>

        </template>
      </div>
    </main>

    <!-- ── FOOTER ──────────────────────────────────────────────────────────── -->
    <footer class="page-footer">
      <div class="footer-operator">
        <span class="footer-label">Operator</span>
        <span class="footer-name">{{ operatorNameInput || 'Petugas' }}</span>
      </div>
      <button class="flex items-center gap-1 text-secondary hover:bg-secondary/5 px-3 py-1.5 rounded-lg transition-colors active:scale-95" @click="Index">
        <span class="material-symbols-outlined text-[10px] footer-name">chevron_left</span>
        <span class="footer-name">KEMBALI</span>
      </button>
    </footer>

  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  overflow: hidden;
  background: #f0f4f8;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  color: #171c1f;
  -webkit-font-smoothing: antialiased;
}

.material-symbols-outlined {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  font-family: 'Material Symbols Outlined';
  display: inline-flex;
  align-items: center;
  user-select: none;
}

@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
</style>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.page-root {
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f0f4f8;
  color: #171c1f;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

/* ── Topbar ──────────────────────────────────────────────────────────────── */
.topbar {
  background: #ffffff;
  border-bottom: 1px solid #E2E8F0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  flex-shrink: 0;
  z-index: 40;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.topbar-title {
  font-size: 18px;
  font-weight: 700;
  color: #003527;
  letter-spacing: -0.01em;
  line-height: 28px;
}
.live-dot-wrap {
  position: relative;
  width: 8px;
  height: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.live-dot-ping {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #16A34A;
  opacity: 0.75;
  animation: ping 1.4s cubic-bezier(0,0,0.2,1) infinite;
}
.live-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #16A34A;
  display: inline-block;
}
.live-dot-wrap--offline .live-dot-ping { animation: none; opacity: 0; }
.live-dot-wrap--offline .live-dot { background: #bfc9c3; }

/* Operator chip */
.operator-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #eaeef2;
  border: 1px solid #bfc9c3;
  border-radius: 0.5rem;
}
.chip-icon {
  font-size: 16px !important;
  color: #707974;
}
.chip-input {
  border: none;
  background: transparent;
  outline: none;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: #003527;
  letter-spacing: -0.01em;
  width: 120px;
}
.chip-input::placeholder { color: #707974; }

/* ── Main canvas ─────────────────────────────────────────────────────────── */
.canvas {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 24px;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Actions block ───────────────────────────────────────────────────────── */
.actions-block {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* QR button */
.qr-btn {
  width: 100%;
  height: 56px;
  background: #003527;
  color: #ffffff;
  border: none;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,53,39,0.25);
  transition: transform 0.08s, box-shadow 0.12s;
  -webkit-tap-highlight-color: transparent;
}
.qr-btn:active { transform: scale(0.98); box-shadow: 0 2px 6px rgba(0,53,39,0.2); }
.qr-btn-label {
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.stat-card {
  background: #ffffff;
  border: 1px solid #E2E8F0;
  border-radius: 0.25rem;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-label {
  font-size: 10px;
  font-weight: 700;
  color: #707974;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 32px;
  letter-spacing: -0.01em;
}
.stat-value--pending   { color: #F59E0B; }
.stat-value--completed { color: #16A34A; }
.stat-value--total     { color: #006a61; }

/* ── Error banner ────────────────────────────────────────────────────────── */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #ffdad6;
  border: 1px solid #ba1a1a;
  border-radius: 0.25rem;
}
.error-text  { font-size: 13px; color: #ba1a1a; flex: 1; font-weight: 500; }
.error-dismiss {
  font-size: 11px; font-weight: 700; color: #ba1a1a;
  background: transparent; border: 1px solid #ba1a1a;
  padding: 3px 10px; border-radius: 0.25rem; cursor: pointer;
  font-family: 'Inter', sans-serif;
}
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.2s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Data section — "Emerald Governance" style ported from pengulitan.vue ── */
.data-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sbh-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}
.sbh-list-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #707974;
}
.sbh-list-status {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #16A34A;
}
.sbh-list-status--offline { color: #707974; }

/* ── Skeleton ────────────────────────────────────────────────────────────── */
.sbh-skeleton-list { display: flex; flex-direction: column; gap: 10px; }
.sbh-skeleton-card {
  background: #ffffff;
  border: 1px solid #E2E8F0;
  border-radius: 0.5rem;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sbh-skel-line {
  background: linear-gradient(90deg, #eaeef2 25%, #f0f4f8 50%, #eaeef2 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 0.25rem;
}
.sbh-skel-line--h { height: 16px; }
.sbh-skel-line--s { height: 10px; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── Empty ───────────────────────────────────────────────────────────────── */
.sbh-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 20px; gap: 10px; text-align: center;
}
.sbh-empty-icon { font-size: 40px !important; color: #bfc9c3; }
.sbh-empty-title { font-size: 13px; font-weight: 700; color: #707974; letter-spacing: 0.08em; text-transform: uppercase; }
.sbh-empty-sub { font-size: 12px; color: #707974; line-height: 1.5; max-width: 260px; }

/* ── Section ─────────────────────────────────────────────────────────────── */
.sbh-section { display: flex; flex-direction: column; gap: 8px; }
.sbh-section-heading {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 700; color: #707974;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding-bottom: 4px; border-bottom: 1px solid #E2E8F0;
}
.heading--done { opacity: 0.7; }
.sbh-section-count { margin-left: auto; font-size: 11px; font-weight: 600; color: #707974; }

/* ── Card ────────────────────────────────────────────────────────────────── */
.sbh-card {
  background: #ffffff;
  border: 1px solid #E2E8F0;
  border-radius: 0.5rem;
  padding: 14px 14px 14px 18px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sbh-card-accent { position: absolute; top: 0; left: 0; width: 4px; height: 100%; }
.accent--belum   { background: #F59E0B; }
.accent--selesai { background: #16A34A; }

.card--done { opacity: 0.85; }

.sbh-card-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.sbh-card-identity { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }

.sbh-id-chip {
  background: rgba(0,53,39,0.05);
  border: 1px solid rgba(0,53,39,0.1);
  color: #003527;
  padding: 2px 8px;
  border-radius: 0.25rem;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.sbh-jenis { font-size: 14px; font-weight: 700; color: #171c1f; }

.sbh-card-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.sbh-status-badge {
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}
.badge--belum   { background: rgba(245,158,11,0.12); color: #F59E0B; }
.badge--selesai { background: rgba(22,163,74,0.12);  color: #16A34A; }

.sbh-time-label { font-size: 12px; color: #707974; white-space: nowrap; }
.sbh-timer-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #F59E0B;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 2px 8px;
  border-radius: 9999px;
}

.sbh-sohibul { font-size: 13px; line-height: 18px; color: #404944; margin: 0; }
.sbh-label-tampilan { font-size: 11px; color: #707974; margin: 0; letter-spacing: 0.03em; }
.sbh-ts { font-size: 11px; font-family: 'Inter', sans-serif; color: #707974; margin: 4px 0 0; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.page-footer {
  background: #ffffff;
  border-top: 1px solid #E2E8F0;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.footer-operator { display: flex; flex-direction: column; gap: 2px; }
.footer-label {
  font-size: 10px;
  font-weight: 700;
  color: #707974;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.footer-name {
  font-size: 13px;
  font-weight: 700;
  color: #003527;
}
.footer-version { font-size: 10px; color: #707974; }
</style>