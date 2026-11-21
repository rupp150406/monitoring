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
    { name: 'theme-color', content: '#0A0E13' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap' }
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

// ── Boot skeleton — held for at least 1s, even when the fetch is faster ──────
// After the first load it never returns, so the 20s poll and re-syncs do not
// flash the list back to placeholders.
const SKELETON_MS = 1000
const skeletonElapsed = ref(false)
const hasBooted       = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | null = null

const showSkeleton = computed(() => !skeletonElapsed.value || !hasBooted.value)

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
    hasBooted.value = true
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
  skeletonTimer = setTimeout(() => { skeletonElapsed.value = true }, SKELETON_MS)
  loadOperatorFromStorage()
  await loadGrupSembelihan()
  connectRealtime()

  pollTimer = setInterval(loadGrupSembelihan, POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', handleOnline)
})
onUnmounted(() => {
  if (skeletonTimer !== null) clearTimeout(skeletonTimer)
  disconnectRealtime()
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('online', handleOnline)
})
</script>

<template>
  <div class="sbh-root">
    <div class="mx-auto flex h-full w-full max-w-[430px] flex-col px-5 pt-5">

      <!-- ── TOPBAR ──────────────────────────────────────────────────────── -->
      <header class="flex h-[29px] shrink-0 items-center gap-2.5">
        <h1 class="sbh-display text-[24px] font-black leading-none tracking-[-0.01em] text-white">
          SEMBELIHAN
        </h1>
        <span class="relative flex h-2.5 w-2.5 items-center justify-center" :aria-label="isSyncing ? 'Live' : 'Offline'">
          <span v-if="isSyncing" class="live-ping"></span>
          <span class="live-dot" :class="{ 'live-dot--off': !isSyncing }"></span>
        </span>
      </header>

      <!-- ── SCROLLING CONTENT ───────────────────────────────────────────── -->
      <main class="hide-scrollbar mt-3.5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">

        <!-- QR scan -->
        <button type="button" class="qr-btn" @click="openQrScanner">
          <span class="material-symbols-outlined text-[22px]">qr_code_scanner</span>
          <span class="sbh-display text-[14px] font-extrabold uppercase leading-none">Buka Kamera QR Scan</span>
        </button>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-2.5">
          <div class="stat-card bg-[#33260C]">
            <span class="stat-label text-[#FCD34D]">Antrian</span>
            <span class="stat-value">{{ grupBelum.length }}</span>
          </div>
          <div class="stat-card bg-[#0F2D25]">
            <span class="stat-label text-[#6EE7B7]">Selesai</span>
            <span class="stat-value">{{ grupSelesai.length }}</span>
          </div>
          <div class="stat-card bg-[#1B2530]">
            <span class="stat-label text-[#9AA7B5]">Total</span>
            <span class="stat-value">{{ grupEligible.length }}</span>
          </div>
        </div>

        <!-- Error -->
        <Transition name="fade">
          <div v-if="fetchError" class="flex items-start gap-2 rounded-[18px] bg-[#2A1218] p-3">
            <span class="material-symbols-outlined mt-0.5 text-[18px] text-[#FDA4AF]">error</span>
            <span class="min-w-0 flex-1 text-[12px] font-semibold leading-[1.4] text-[#FDA4AF]">{{ fetchError }}</span>
            <button
              type="button"
              class="shrink-0 text-[10px] font-extrabold tracking-[0.06em] text-[#FDA4AF]/80 transition-colors hover:text-[#FDA4AF]"
              @click="fetchError = ''"
            >TUTUP</button>
          </div>
        </Transition>

        <!-- Skeleton -->
        <div v-if="showSkeleton" class="flex flex-col gap-3" aria-hidden="true">
          <div
            v-for="n in 3" :key="`skel-${n}`"
            class="flex flex-col gap-2.5 rounded-[24px] bg-[#11171E] p-4"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <span class="qc-skel h-[33px] w-[51px] rounded-xl bg-white/5"></span>
                <span class="qc-skel h-[21px] w-[70px] rounded bg-white/5"></span>
              </div>
              <span class="qc-skel h-7 w-[86px] rounded-full bg-white/5"></span>
            </div>
            <span class="qc-skel h-4 w-[200px] rounded bg-white/5"></span>
            <span class="qc-skel h-[15px] w-[140px] rounded bg-white/5"></span>
          </div>
        </div>

        <!-- Empty -->
        <div
          v-else-if="grupEligible.length === 0"
          class="flex flex-col items-center justify-center gap-2 rounded-[24px] bg-[#11171E] px-6 py-12 text-center"
        >
          <span class="material-symbols-outlined text-[28px] text-[#3C4A59]">inbox</span>
          <span class="sbh-display text-[13px] font-extrabold tracking-[0.06em] text-[#9AA7B5]">BELUM ADA DATA</span>
          <span class="text-[12px] leading-[1.5] text-[#5B6776]">Belum ada hewan dengan status Kedatangan = Diterima.</span>
        </div>

        <template v-else>

          <!-- ── ANTRIAN ──────────────────────────────────────────────── -->
          <section v-if="grupBelum.length > 0" class="flex flex-col gap-3">
            <div class="flex h-[27px] items-center gap-2.5">
              <span class="text-[12px] font-bold leading-[1.25] text-[#7D8A99]">ANTRIAN</span>
              <span class="count-chip bg-[#33260C] text-[#FCD34D]">{{ grupBelum.length }}</span>
            </div>

            <article
              v-for="grup in grupBelum"
              :key="grup.id_grup"
              class="flex flex-col gap-2.5 rounded-[24px] bg-[#11171E] p-4"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2.5">
                  <span class="id-chip">{{ grup.id_grup }}</span>
                  <span class="sbh-display truncate text-[17px] font-extrabold leading-[21px] text-white">
                    {{ grup.jenis_hewan ?? '—' }}
                  </span>
                </div>

                <div class="flex shrink-0 flex-col items-end gap-1.5">
                  <span class="status-badge bg-[#33260C] text-[#FCD34D]">MENUNGGU</span>
                  <span v-if="grup.is_timer_active" class="timer-chip">
                    <span class="material-symbols-outlined text-[13px]">timer</span>
                    TIMER
                  </span>
                </div>
              </div>

              <p class="text-[13px] leading-[16px] text-[#9AA7B5]">Sohibul: {{ sohibulNames(grup) }}</p>
              <p v-if="grup.label_tampilan" class="text-[12px] font-bold leading-[15px] text-[#5B6776]">
                {{ grup.label_tampilan }}
              </p>
            </article>
          </section>

          <!-- ── SELESAI ──────────────────────────────────────────────── -->
          <section v-if="grupSelesai.length > 0" class="flex flex-col gap-3">
            <div class="flex h-[27px] items-center gap-2.5">
              <span class="text-[12px] font-bold leading-[1.25] text-[#7D8A99]">SELESAI</span>
              <span class="count-chip bg-[#0F2D25] text-[#6EE7B7]">{{ grupSelesai.length }}</span>
            </div>

            <article
              v-for="grup in grupSelesai"
              :key="grup.id_grup"
              class="flex flex-col gap-2.5 rounded-[24px] bg-[#11171E] p-4"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2.5">
                  <span class="id-chip">{{ grup.id_grup }}</span>
                  <span class="sbh-display truncate text-[17px] font-extrabold leading-[21px] text-white">
                    {{ grup.jenis_hewan ?? '—' }}
                  </span>
                </div>
                <span class="status-badge shrink-0 bg-[#0F2D25] text-[#6EE7B7]">SELESAI</span>
              </div>

              <p class="text-[13px] leading-[16px] text-[#9AA7B5]">Sohibul: {{ sohibulNames(grup) }}</p>
              <p class="text-[12px] font-bold leading-[15px] text-[#5B6776]">
                Selesai: {{ formatTime(grup.sembelih_selesai_at) }}
              </p>
            </article>
          </section>

        </template>
      </main>

      <!-- ── FOOTER ──────────────────────────────────────────────────────── -->
      <footer class="mt-3.5 flex h-[69px] shrink-0 items-center justify-between gap-3 rounded-[28px] bg-[#11171E] px-3.5">
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[10px] font-bold uppercase leading-[12px] text-[#7D8A99]">Operator</span>
          <span class="sbh-display truncate text-[16px] font-extrabold leading-[20px] text-white">
            {{ operatorNameInput || 'Petugas' }}
          </span>
        </div>
        <button type="button" class="back-btn" @click="Index">
          <span class="sbh-display text-[12px] font-extrabold leading-none text-white">KEMBALI</span>
        </button>
      </footer>

    </div>
  </div>
</template>

<style>
/* ── Material Symbols ────────────────────────────────────────────────────────── */
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  display: inline-flex;
  align-items: center;
  line-height: 1;
  text-transform: none;
  letter-spacing: normal;
  word-wrap: normal;
  white-space: nowrap;
  direction: ltr;
  font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
  user-select: none;
}

@keyframes qc-ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}

/* ── Scrollbar hide ─────────────────────────────────────────────────────────── */
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

body {
  overscroll-behavior-y: none;
  background-color: #0A0E13;
  color: #E6EDF3;
  margin: 0;
  padding: 0;
}
</style>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════════
   ROOT
   ══════════════════════════════════════════════════════════════════════════════ */
.sbh-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #0A0E13;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #E6EDF3;
  padding-top: env(safe-area-inset-top);
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

.sbh-display {
  font-family: 'Montserrat', 'Inter', sans-serif;
}

/* ══════════════════════════════════════════════════════════════════════════════
   LIVE DOT
   ══════════════════════════════════════════════════════════════════════════════ */
.live-ping {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #34D399;
  opacity: 0.7;
  animation: qc-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.live-dot {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: #34D399;
}
.live-dot--off { background: #5B6776; }

/* ══════════════════════════════════════════════════════════════════════════════
   QR BUTTON
   ══════════════════════════════════════════════════════════════════════════════ */
.qr-btn {
  display: flex;
  width: 100%;
  height: 58px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: none;
  border-radius: 24px;
  background: #34D399;
  color: #052E22;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.qr-btn:hover  { background: #3EE0A5; }
.qr-btn:active { transform: scale(0.99); }

/* ══════════════════════════════════════════════════════════════════════════════
   STATS
   ══════════════════════════════════════════════════════════════════════════════ */
.stat-card {
  display: flex;
  height: 95px;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
  border-radius: 24px;
  padding: 14px;
}

.stat-label {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 800;
  line-height: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.stat-value {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: clamp(34px, 10.5vw, 40px);
  font-weight: 900;
  line-height: 1.22;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: #FFFFFF;
}

.count-chip {
  display: inline-flex;
  height: 27px;
  align-items: center;
  border-radius: 9999px;
  padding: 0 7px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

/* ══════════════════════════════════════════════════════════════════════════════
   CARDS
   ══════════════════════════════════════════════════════════════════════════════ */
.id-chip {
  display: inline-flex;
  height: 33px;
  flex-shrink: 0;
  align-items: center;
  border-radius: 12px;
  background: #1B2530;
  padding: 0 8px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 900;
  line-height: 17px;
  color: #FFFFFF;
}

.status-badge {
  display: inline-flex;
  height: 28px;
  align-items: center;
  border-radius: 9999px;
  padding: 0 8px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.timer-chip {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 5px;
  border-radius: 9999px;
  background: #271F45;
  padding: 0 7px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  color: #C4B5FD;
}

/* ══════════════════════════════════════════════════════════════════════════════
   FOOTER
   ══════════════════════════════════════════════════════════════════════════════ */
.back-btn {
  display: flex;
  height: 41px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 20px;
  background: #1B2530;
  padding: 0 13px;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.back-btn:hover  { background: #223040; }
.back-btn:active { transform: scale(0.98); }

/* ══════════════════════════════════════════════════════════════════════════════
   TRANSITIONS + SKELETON
   ══════════════════════════════════════════════════════════════════════════════ */
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.qc-skel { position: relative; overflow: hidden; }
.qc-skel::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%);
  animation: qc-skel-sweep 1s ease-in-out infinite;
}
@keyframes qc-skel-sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .qc-skel::after { animation: none; }
}
</style>
