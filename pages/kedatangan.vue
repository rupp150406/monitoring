<script setup lang="ts">
// ─── kedatangan.vue ─────────────────────────────────────────────────────────────────────
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQurbanRealtime } from '@/composables/useQurbanEngine'
import type { GrupHewan } from '@/composables/useQurbanEngine'

definePageMeta({ layout: 'lapangan' })

useHead({
  title: 'Kedatangan Terminal',
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

// ── Operator identity ────────────────────────────────────────────────────────
// Uses the same localStorage keys as useStateLock / scan page so identity
// is shared across the whole app — no separate flag needed.
const operatorNameInput = ref('Jamaah')
const LS_ACTOR_NAME     = 'qurban_actor_name'
const LS_ACTOR_ID       = 'qurban_actor_id'
const LS_ACTOR_ROLE     = 'qurban_actor_role'
const operatorId        = ref('anonymous')
const actorRole         = ref<string>('')

// Any recognised role grants confirm access. Guests (no role) cannot confirm.
const VALID_ROLES = ['sembelihan', 'pengulitan', 'ketua'] as const
type ValidRole = typeof VALID_ROLES[number]
const isAdmin = computed(() => VALID_ROLES.includes(actorRole.value as ValidRole))

function loadOperatorFromStorage() {
  if (typeof window === 'undefined') return
  try {
    operatorNameInput.value = window.localStorage.getItem(LS_ACTOR_NAME) ?? 'Jamaah'
    operatorId.value        = window.localStorage.getItem(LS_ACTOR_ID)   ?? 'anonymous'
    actorRole.value         = window.localStorage.getItem(LS_ACTOR_ROLE) ?? ''
  } catch {}
}

// ── Search ────────────────────────────────────────────────────────────────────
const searchQuery = ref('')

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

async function loadGrupKedatangan() {
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

// ── Realtime ──────────────────────────────────────────────────────────────────
const { connect: connectRealtime, disconnect: disconnectRealtime, isSyncing } = useQurbanRealtime(grupList, {
  channelSuffix: 'kedatangan',
  onInsert: () => { loadGrupKedatangan() },
  onConnectionLost: () => { loadGrupKedatangan() },
})

// ── Resilience nets ──────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 20_000
let pollTimer: ReturnType<typeof setInterval> | null = null

async function resyncChannel() {
  await disconnectRealtime()
  connectRealtime()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadGrupKedatangan()
    resyncChannel()
  }
}

function handleOnline() {
  loadGrupKedatangan()
  resyncChannel()
}

// ── Confirm action ────────────────────────────────────────────────────────────
const confirmingId = ref<string | null>(null)

async function confirmKedatangan(grup: GrupHewan) {
  if (confirmingId.value) return
  confirmingId.value = grup.id_grup
  try {
    const { error } = await supabase
      .from('grup_hewan')
      .update({
        status_kedatangan: 'Diterima',
        updated_by: operatorNameInput.value || 'Admin',
      })
      .eq('id_grup', grup.id_grup)
    if (error) throw new Error(error.message)
    await loadGrupKedatangan()
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'Gagal konfirmasi.'
  } finally {
    confirmingId.value = null
  }
}

// ── Computed ──────────────────────────────────────────────────────────────────
function matchesSearch(grup: GrupHewan): boolean {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return true
  const names = (grup.sohibul_qurban ?? []).map((s) => s.nama?.toLowerCase() ?? '')
  return (
    grup.id_grup?.toLowerCase().includes(q) ||
    (grup.jenis_hewan ?? '').toLowerCase().includes(q) ||
    (grup.label_tampilan ?? '').toLowerCase().includes(q) ||
    names.some((n) => n.includes(q))
  )
}

const filteredList = computed(() => grupList.value.filter(matchesSearch))

// StatusKedatanganEnum from the engine: 'Belum' | 'Diterima'
const grupBelum    = computed(() => filteredList.value.filter((g) => !g.status_kedatangan || g.status_kedatangan === 'Belum'))
const grupDiterima = computed(() => filteredList.value.filter((g) => g.status_kedatangan === 'Diterima'))

// ── Navigation ────────────────────────────────────────────────────────────────
function openQrScanner() {
  router.push('/scan?fase=kedatangan')
}

function goBack() {
  router.push('/team')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sohibulNames(grup: GrupHewan): string {
  const names = (grup.sohibul_qurban ?? []).map((s) => s.nama).filter(Boolean)
  return names.length > 0 ? names.slice(0, 2).join(', ') + (names.length > 2 ? '...' : '') : '—'
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  skeletonTimer = setTimeout(() => { skeletonElapsed.value = true }, SKELETON_MS)
  loadOperatorFromStorage()
  await loadGrupKedatangan()
  connectRealtime()

  pollTimer = setInterval(loadGrupKedatangan, POLL_INTERVAL_MS)
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
  <div class="ked-root">
    <div class="mx-auto flex h-full w-full max-w-[430px] flex-col px-5 pt-5">

      <!-- ── TOPBAR ──────────────────────────────────────────────────────── -->
      <header class="flex h-[29px] shrink-0 items-center gap-2.5">
        <h1 class="team-display text-[24px] font-black leading-none tracking-[-0.01em] text-white">
          KEDATANGAN
        </h1>
        <span class="relative flex h-2.5 w-2.5 items-center justify-center" :aria-label="isSyncing ? 'Live' : 'Offline'">
          <span v-if="isSyncing" class="live-ping"></span>
          <span class="live-dot" :class="{ 'live-dot--off': !isSyncing }"></span>
        </span>
      </header>

      <!-- ── SEARCH ──────────────────────────────────────────────────────── -->
      <div class="mt-3.5 flex h-12 shrink-0 items-center gap-3 rounded-[20px] bg-[#11171E] px-[15px]">
        <span class="material-symbols-outlined text-[18px] text-[#7D8A99]">search</span>
        <input
          v-model="searchQuery"
          class="search-input min-w-0 flex-1 bg-transparent text-[14px] text-[#E6EDF3] outline-none placeholder:text-[#5B6776]"
          type="search"
          placeholder="Cari ID, hewan, atau nama sohibul…"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7D8A99] transition-colors hover:bg-white/5 hover:text-[#E6EDF3]"
          aria-label="Hapus pencarian"
          @click="searchQuery = ''"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- ── SCROLLING CONTENT ───────────────────────────────────────────── -->
      <main class="hide-scrollbar mt-3.5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">

        <!-- QR scan -->
        <button type="button" class="qr-btn" @click="openQrScanner">
          <span class="material-symbols-outlined text-[22px]">qr_code_scanner</span>
          <span class="team-display text-[14px] font-extrabold uppercase leading-none">Buka Kamera QR Scan</span>
        </button>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-2.5">
          <div class="stat-card bg-[#2A1218]">
            <span class="stat-label text-[#FDA4AF]">Belum</span>
            <span class="stat-value">{{ grupBelum.length }}</span>
          </div>
          <div class="stat-card bg-[#0F2D25]">
            <span class="stat-label text-[#6EE7B7]">Diterima</span>
            <span class="stat-value">{{ grupDiterima.length }}</span>
          </div>
          <div class="stat-card bg-[#1B2530]">
            <span class="stat-label text-[#9AA7B5]">Total</span>
            <span class="stat-value">{{ filteredList.length }}</span>
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
                <span class="qc-skel h-[33px] w-[47px] rounded-xl bg-white/5"></span>
                <span class="qc-skel h-[21px] w-[70px] rounded bg-white/5"></span>
              </div>
              <span class="qc-skel h-7 w-[58px] rounded-full bg-white/5"></span>
            </div>
            <span class="qc-skel h-4 w-[200px] rounded bg-white/5"></span>
            <span class="qc-skel h-[41px] w-full rounded-[18px] bg-white/5"></span>
          </div>
        </div>

        <!-- Empty -->
        <div
          v-else-if="grupList.length === 0"
          class="flex flex-col items-center justify-center gap-2 rounded-[24px] bg-[#11171E] px-6 py-12 text-center"
        >
          <span class="material-symbols-outlined text-[28px] text-[#3C4A59]">inbox</span>
          <span class="team-display text-[13px] font-extrabold tracking-[0.06em] text-[#9AA7B5]">BELUM ADA DATA</span>
          <span class="text-[12px] text-[#5B6776]">Belum ada data hewan yang tercatat.</span>
        </div>

        <div
          v-else-if="filteredList.length === 0"
          class="flex flex-col items-center justify-center gap-2 rounded-[24px] bg-[#11171E] px-6 py-12 text-center"
        >
          <span class="material-symbols-outlined text-[28px] text-[#3C4A59]">search_off</span>
          <span class="team-display text-[13px] font-extrabold tracking-[0.06em] text-[#9AA7B5]">TIDAK DITEMUKAN</span>
          <span class="text-[12px] text-[#5B6776]">Tidak ada data yang cocok dengan "{{ searchQuery }}".</span>
        </div>

        <template v-else>

          <!-- ── BELUM TIBA ──────────────────────────────────────────── -->
          <section v-if="grupBelum.length > 0" class="flex flex-col gap-3">
            <div class="flex h-[27px] items-center gap-2.5">
              <span class="text-[12px] font-bold leading-[1.25] text-[#7D8A99]">BELUM TIBA</span>
              <span class="count-chip bg-[#2A1218] text-[#FDA4AF]">{{ grupBelum.length }}</span>
            </div>

            <article
              v-for="grup in grupBelum"
              :key="grup.id_grup"
              class="flex flex-col gap-2.5 rounded-[24px] bg-[#11171E] p-4"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2.5">
                  <span class="id-chip">{{ grup.id_grup }}</span>
                  <span class="team-display truncate text-[17px] font-extrabold leading-[21px] text-white">
                    {{ grup.jenis_hewan ?? '—' }}
                  </span>
                </div>
                <span class="status-badge shrink-0 bg-[#2A1218] text-[#FDA4AF]">BELUM</span>
              </div>

              <p class="text-[13px] leading-[16px] text-[#9AA7B5]">Sohibul: {{ sohibulNames(grup) }}</p>
              <p v-if="grup.label_tampilan" class="text-[12px] font-bold leading-[15px] text-[#5B6776]">
                {{ grup.label_tampilan }}
              </p>

              <button
                v-if="isAdmin"
                type="button"
                class="confirm-btn"
                :disabled="!!confirmingId"
                @click="confirmKedatangan(grup)"
                aria-label="Konfirmasi kedatangan"
              >
                <span
                  v-if="confirmingId === grup.id_grup"
                  class="material-symbols-outlined confirm-spinner text-[15px]"
                >progress_activity</span>
                <span v-else class="material-symbols-outlined text-[18px]">check</span>
                <span class="team-display text-[12px] font-extrabold">KONFIRMASI</span>
              </button>
            </article>
          </section>

          <!-- ── DITERIMA ────────────────────────────────────────────── -->
          <section v-if="grupDiterima.length > 0" class="flex flex-col gap-3">
            <div class="flex h-[27px] items-center gap-2.5">
              <span class="text-[12px] font-bold leading-[1.25] text-[#7D8A99]">DITERIMA</span>
              <span class="count-chip bg-[#0F2D25] text-[#6EE7B7]">{{ grupDiterima.length }}</span>
            </div>

            <article
              v-for="grup in grupDiterima"
              :key="grup.id_grup"
              class="flex flex-col gap-2.5 rounded-[24px] bg-[#11171E] p-4"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2.5">
                  <span class="id-chip">{{ grup.id_grup }}</span>
                  <span class="team-display truncate text-[17px] font-extrabold leading-[21px] text-white">
                    {{ grup.jenis_hewan ?? '—' }}
                  </span>
                </div>
                <span class="status-badge shrink-0 bg-[#0F2D25] text-[#6EE7B7]">DITERIMA</span>
              </div>

              <p class="text-[13px] leading-[16px] text-[#9AA7B5]">Sohibul: {{ sohibulNames(grup) }}</p>
            </article>
          </section>

        </template>
      </main>

      <!-- ── FOOTER ──────────────────────────────────────────────────────── -->
      <footer class="mt-3.5 flex h-[69px] shrink-0 items-center justify-between gap-3 rounded-[28px] bg-[#11171E] px-3.5">
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[10px] font-bold uppercase leading-[12px] text-[#7D8A99]">Operator</span>
          <span class="team-display truncate text-[16px] font-extrabold leading-[20px] text-white">
            {{ operatorNameInput || 'Petugas' }}
          </span>
        </div>
        <button type="button" class="back-btn" @click="goBack">
          <span class="team-display text-[12px] font-extrabold leading-none text-white">KEMBALI</span>
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
@keyframes qc-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
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
.ked-root {
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

.team-display {
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
   SEARCH
   ══════════════════════════════════════════════════════════════════════════════ */
.search-input::-webkit-search-cancel-button,
.search-input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

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
   GROUP CARDS
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

.confirm-btn {
  display: flex;
  width: 100%;
  height: 41px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: 18px;
  background: #14402F;
  color: #6EE7B7;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.confirm-btn:hover  { background: #18503A; }
.confirm-btn:active { transform: scale(0.99); }
.confirm-btn:disabled { opacity: 0.55; cursor: default; }
.confirm-spinner { animation: qc-spin 0.9s linear infinite; }

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
