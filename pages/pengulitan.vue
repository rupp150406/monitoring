<script setup lang="ts">
// ─── pengulitan.vue ─────────────────────────────────────────────────────────────────────
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQurbanRealtime } from '@/composables/useQurbanEngine';
import type { GrupHewan } from '@/composables/useQurbanEngine';
import { useRouter } from 'vue-router';

// ─── Phase config ─────────────────────────────────────────────────────────────
// PENGULITAN is the third phase: it only applies once SEMBELIHAN is done, and
// (unlike sembelihan) genuinely has a "Proses" mid-state, hence the 3 sections.
const PHASE_FIELD         = 'status_pengulitan' as const;
const PHASE_FASE          = 'pengulitan'         as const;
const PHASE_TITLE         = 'PENGULITAN';
const PHASE_DONE_TS_FIELD = 'pengulitan_selesai_at' as const;

definePageMeta({ layout: 'lapangan' });

useHead({
  title: `${PHASE_TITLE} | PWA Lapangan`,
  meta: [
    { name: 'theme-color', content: '#0A0E13' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
  ],
});

const router   = useRouter();
const supabase = useSupabaseClient();

// ─── Operator identity (display only) ─────────────────────────────────────────
const LS_ACTOR_NAME = 'qurban_actor_name';
const LS_ACTOR_ID   = 'qurban_actor_id';
const operatorName  = ref<string>('');
const operatorId    = ref('anonymous');

function loadOperatorFromStorage() {
  if (typeof window === 'undefined') return;
  try {
    operatorName.value = window.localStorage.getItem(LS_ACTOR_NAME) ?? 'Jamaah';
    operatorId.value   = window.localStorage.getItem(LS_ACTOR_ID)   ?? 'anonymous';
  } catch {}
}

function commitOperator() {
  const name = operatorName.value.trim() || 'Jamaah';
  operatorName.value = name;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_ACTOR_NAME, name);
      window.localStorage.setItem(LS_ACTOR_ID, operatorId.value);
    } catch {}
  }
}

// Short badge shown in the header chip, e.g. "OP-4092" style tag derived from the operator id.
const operatorBadge = computed(() => {
  const raw = operatorId.value && operatorId.value !== 'anonymous' ? operatorId.value : operatorName.value;
  return raw.replace(/\s+/g, '').slice(0, 8).toUpperCase();
});

// ─── Data ─────────────────────────────────────────────────────────────────────
const isPageLoading = ref(true);
const fetchError    = ref('');
const grupList      = ref<GrupHewan[]>([]);

async function loadGrup() {
  isPageLoading.value = true;
  fetchError.value = '';
  try {
    const { data, error } = await supabase
      .from('grup_hewan')
      .select('*, sohibul_qurban(*)')
      .order('id_grup', { ascending: true });
    if (error) throw new Error(error.message);
    grupList.value = (data ?? []) as GrupHewan[];
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'Gagal memuat data.';
  } finally {
    isPageLoading.value = false;
  }
}

// ─── Realtime (display-only sync via the shared engine composable) ────────────
const { connect: connectRealtime, disconnect: disconnectRealtime, isSyncing } = useQurbanRealtime(grupList, {
  channelSuffix: PHASE_FASE,
  onInsert: () => { loadGrup(); },
  onConnectionLost: () => { loadGrup(); },
});

// ─── Resilience nets ────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 20_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function resyncChannel() {
  await disconnectRealtime();
  connectRealtime();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadGrup();
    resyncChannel();
  }
}

function handleOnline() {
  loadGrup();
  resyncChannel();
}

// ─── Derived lists ────────────────────────────────────────────────────────────
const grupEligible = computed(() => grupList.value.filter((g) => g.status_sembelihan === 'Selesai'));
const grupBelum    = computed(() => grupEligible.value.filter((g) => g[PHASE_FIELD] === 'Belum'));
const grupProses   = computed(() => grupEligible.value.filter((g) => g[PHASE_FIELD] === 'Proses'));
const grupSelesai  = computed(() => grupEligible.value.filter((g) => g[PHASE_FIELD] === 'Selesai'));
const antrianCount = computed(() => grupBelum.value.length + grupProses.value.length);

// ─── Navigation ───────────────────────────────────────────────────────────────
function openQrScanner() { router.push('/scan?fase=pengulitan'); }
function Index() { router.push('/team'); }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sohibulNames(grup: GrupHewan): string {
  const names = (grup.sohibul_qurban ?? []).map((s) => s.nama).filter(Boolean);
  return names.length > 0 ? names.join(', ') : '—';
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit' }) + ' WIB';
}

function statusLabel(status: string): string {
  if (status === 'Belum')  return 'MENUNGGU';
  if (status === 'Proses') return 'PROSES';
  return 'SELESAI';
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  loadOperatorFromStorage();
  await loadGrup();
  connectRealtime();

  pollTimer = setInterval(loadGrup, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);
});
onUnmounted(() => {
  disconnectRealtime();
  if (pollTimer) clearInterval(pollTimer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('online', handleOnline);
});

</script>

<template>
  <div class="sbh-root">

    <!-- HEADER -->
    <header class="sbh-header">
      <h2 class="sbh-brand-title">
        {{ PHASE_TITLE }}
        <span class="sbh-live-dot" :class="{ 'sbh-live-dot--offline': !isSyncing }">
          <span class="sbh-live-dot-ping"></span>
          <span class="sbh-live-dot-core"></span>
        </span>
      </h2>
    </header>

    <!-- QUICK ACTION -->
    <button class="sbh-qr-btn" @click="openQrScanner">
      <span class="material-symbols-outlined sbh-qr-icon">qr_code_scanner</span>
      <span class="sbh-qr-label">BUKA KAMERA QR SCAN</span>
    </button>

    <!-- TACTICAL STATS -->
    <div class="sbh-stats">
      <div class="sbh-stat-card sbh-stat-card--antrian">
        <span class="sbh-stat-label">ANTRIAN</span>
        <span class="sbh-stat-value">{{ antrianCount }}</span>
      </div>
      <div class="sbh-stat-card sbh-stat-card--selesai">
        <span class="sbh-stat-label">SELESAI</span>
        <span class="sbh-stat-value">{{ grupSelesai.length }}</span>
      </div>
      <div class="sbh-stat-card sbh-stat-card--total">
        <span class="sbh-stat-label">TOTAL</span>
        <span class="sbh-stat-value">{{ grupEligible.length }}</span>
      </div>
    </div>

    <!-- ERROR BANNER -->
    <Transition name="sbh-banner">
      <div v-if="fetchError" class="sbh-banner">
        <span class="material-symbols-outlined sbh-banner-icon">error</span>
        <span class="sbh-banner-msg">{{ fetchError }}</span>
        <button class="sbh-banner-dismiss" @click="fetchError = ''">TUTUP</button>
      </div>
    </Transition>

    <!-- SCROLLABLE LIST -->
    <div class="sbh-body">
      <div class="sbh-list-header">
        <span class="sbh-list-title">DATA PENGULITAN</span>
        <span class="sbh-list-status" :class="{ 'sbh-list-status--offline': !isSyncing }">
          <span class="sbh-list-status-dot"></span>
          {{ isSyncing ? 'LIVE' : 'MENYAMBUNGKAN...' }}
        </span>
      </div>

      <!-- Skeleton -->
      <div v-if="isPageLoading" class="sbh-skeleton-list">
        <div v-for="n in 4" :key="n" class="sbh-skeleton-card">
          <div class="sbh-skel-line sbh-skel-line--h" :style="{ width: 40 + n * 11 + '%' }" />
          <div class="sbh-skel-line sbh-skel-line--s" :style="{ width: 55 + n * 5  + '%' }" />
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="grupEligible.length === 0" class="sbh-empty">
        <span class="material-symbols-outlined sbh-empty-icon">inventory_2</span>
        <span class="sbh-empty-title">BELUM ADA DATA</span>
        <span class="sbh-empty-sub">Belum ada grup hewan yang siap untuk fase Pengulitan.</span>
      </div>

      <template v-else>

        <!-- ── PROSES section ─────────────────────────────────────────── -->
        <div v-if="grupProses.length > 0" class="sbh-section">
          <div class="sbh-section-heading sbh-section-heading--proses">
            <span class="sbh-section-title">SEDANG DIPROSES</span>
            <span class="sbh-section-count count--amber">{{ grupProses.length }}</span>
          </div>

          <div
            v-for="grup in grupProses"
            :key="grup.id_grup"
            class="sbh-card"
          >
            <div class="sbh-card-row">
              <div class="sbh-card-identity">
                <span class="sbh-id-chip">{{ grup.id_grup }}</span>
                <span class="sbh-jenis">{{ grup.jenis_hewan ?? '—' }}</span>
              </div>
              <span class="sbh-status-badge badge--proses">
                <span class="badge-dot"></span>{{ statusLabel('Proses') }}
              </span>
            </div>
            <p class="sbh-sohibul">Sohibul: {{ sohibulNames(grup) }}</p>
            <p v-if="grup.label_tampilan" class="sbh-label-tampilan">{{ grup.label_tampilan }}</p>
          </div>
        </div>

        <!-- ── BELUM section ──────────────────────────────────────────── -->
        <div v-if="grupBelum.length > 0" class="sbh-section">
          <div class="sbh-section-heading">
            <span class="sbh-section-title">MENUNGGU MULAI</span>
            <span class="sbh-section-count count--amber">{{ grupBelum.length }}</span>
          </div>

          <div
            v-for="grup in grupBelum"
            :key="grup.id_grup"
            class="sbh-card"
          >
            <div class="sbh-card-row">
              <div class="sbh-card-identity">
                <span class="sbh-id-chip">{{ grup.id_grup }}</span>
                <span class="sbh-jenis">{{ grup.jenis_hewan ?? '—' }}</span>
              </div>
              <span class="sbh-status-badge badge--belum">{{ statusLabel('Belum') }}</span>
            </div>
            <p class="sbh-sohibul">Sohibul: {{ sohibulNames(grup) }}</p>
            <p v-if="grup.label_tampilan" class="sbh-label-tampilan">{{ grup.label_tampilan }}</p>
          </div>
        </div>

        <!-- ── SELESAI section ──────────────────────────────────────── -->
        <div v-if="grupSelesai.length > 0" class="sbh-section">
          <div class="sbh-section-heading">
            <span class="sbh-section-title">SELESAI</span>
            <span class="sbh-section-count count--mint">{{ grupSelesai.length }}</span>
          </div>

          <div v-for="grup in grupSelesai" :key="grup.id_grup" class="sbh-card">
            <div class="sbh-card-row">
              <div class="sbh-card-identity">
                <span class="sbh-id-chip">{{ grup.id_grup }}</span>
                <span class="sbh-jenis">{{ grup.jenis_hewan ?? '—' }}</span>
              </div>
              <span class="sbh-status-badge badge--selesai">{{ statusLabel('Selesai') }}</span>
            </div>
            <p class="sbh-sohibul">Sohibul: {{ sohibulNames(grup) }}</p>
            <p class="sbh-ts">Selesai: {{ formatTime(grup[PHASE_DONE_TS_FIELD]) }}</p>
          </div>
        </div>

      </template>
    </div>

    <!-- FOOTER -->
    <footer class="sbh-footer">
      <div class="sbh-footer-block">
        <span class="sbh-footer-label">Operator</span>
        <span class="sbh-footer-name">{{ operatorName || 'Jamaah' }}</span>
      </div>
      <button class="sbh-back-btn" @click="Index">
        <span class="sbh-back-label">KEMBALI</span>
      </button>
    </footer>
  </div>
</template>



<style scoped>
/* ============================================================
   PENGULITAN PWA — Dark "Field Ops" Theme
   ============================================================ */

.sbh-root {
  display: flex; flex-direction: column; height: 100dvh; overflow: hidden;
  gap: 14px; padding: 20px;
  padding-top: max(20px, env(safe-area-inset-top));
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  background-color: #0A0E13; color: #E6EDF3;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.sbh-header {
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; min-height: 29px; gap: 12px;
}
.sbh-brand-title {
  display: flex; align-items: center; gap: 10px; margin: 0;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 24px; line-height: 29px; font-weight: 900;
  color: #FFFFFF; letter-spacing: -0.01em; white-space: nowrap;
}
.sbh-live-dot { position: relative; display: inline-flex; height: 10px; width: 10px; }
.sbh-live-dot-ping {
  position: absolute; display: inline-flex; height: 100%; width: 100%;
  border-radius: 9999px; background: #34D399; opacity: 0.75;
  animation: sbh-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.sbh-live-dot-core { position: relative; display: inline-flex; border-radius: 9999px; height: 10px; width: 10px; background: #34D399; }
@keyframes sbh-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
.sbh-live-dot--offline .sbh-live-dot-ping { animation: none; opacity: 0; }
.sbh-live-dot--offline .sbh-live-dot-core { background: #5B6776; }

/* ── Quick action ──────────────────────────────────────────────────────── */
.sbh-qr-btn {
  flex-shrink: 0;
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px;
  height: 58px; padding: 0 18px;
  background: #34D399; color: #052E22;
  border: none; border-radius: 24px; cursor: pointer;
  font-family: inherit;
  transition: filter 0.12s, transform 0.08s;
}
.sbh-qr-btn:active { transform: scale(0.985); filter: brightness(0.94); }
.sbh-qr-icon {
  font-size: 22px; color: #052E22;
  font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}
.sbh-qr-label {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 14px; font-weight: 800; line-height: 1;
  letter-spacing: 0.04em; color: #052E22; white-space: nowrap;
}

/* ── Stats ─────────────────────────────────────────────────────────────── */
.sbh-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; flex-shrink: 0; }
.sbh-stat-card {
  display: flex; flex-direction: column; gap: 6px;
  border-radius: 24px; padding: 14px;
  min-height: 95px;
}
.sbh-stat-card--antrian { background: #33260C; }
.sbh-stat-card--selesai { background: #0F2D25; }
.sbh-stat-card--total   { background: #1B2530; }
.sbh-stat-label {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px; font-weight: 800; line-height: 12px;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.sbh-stat-card--antrian .sbh-stat-label { color: #FCD34D; }
.sbh-stat-card--selesai .sbh-stat-label { color: #6EE7B7; }
.sbh-stat-card--total   .sbh-stat-label { color: #9AA7B5; }
.sbh-stat-value {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 40px; line-height: 49px; font-weight: 900;
  letter-spacing: 0; color: #FFFFFF;
}

/* ── Error banner ──────────────────────────────────────────────────────── */
.sbh-banner {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 12px; flex-shrink: 0;
  background: #2A1218; border-radius: 18px;
}
.sbh-banner-icon { font-size: 18px; color: #FDA4AF; flex-shrink: 0; margin-top: 2px; }
.sbh-banner-msg { font-size: 12px; color: #FDA4AF; flex: 1; line-height: 1.4; font-weight: 600; }
.sbh-banner-dismiss {
  font-family: inherit; font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
  color: rgba(253,164,175,0.8); border: none; background: transparent;
  padding: 0; cursor: pointer; flex-shrink: 0;
}
.sbh-banner-enter-active, .sbh-banner-leave-active { transition: all 0.2s ease; }
.sbh-banner-enter-from, .sbh-banner-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Body / list ───────────────────────────────────────────────────────── */
.sbh-body {
  flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 8px;
  display: flex; flex-direction: column; gap: 12px;
  -webkit-overflow-scrolling: touch;
}
.sbh-body::-webkit-scrollbar { display: none; }
.sbh-body { -ms-overflow-style: none; scrollbar-width: none; }
.sbh-list-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; flex-shrink: 0;
}
.sbh-list-title {
  font-size: 12px; font-weight: 700; line-height: 15px;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: #7D8A99;
}
.sbh-list-status {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  color: #34D399; text-transform: uppercase;
}
.sbh-list-status-dot { width: 6px; height: 6px; border-radius: 9999px; background: #34D399; }
.sbh-list-status--offline { color: #7D8A99; }
.sbh-list-status--offline .sbh-list-status-dot { background: #5B6776; }

/* ── Skeleton ──────────────────────────────────────────────────────────── */
.sbh-skeleton-list { display: flex; flex-direction: column; gap: 12px; }
.sbh-skeleton-card {
  background: #11171E; border-radius: 24px; padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.sbh-skel-line {
  background: linear-gradient(90deg, #1B2530 25%, #223040 50%, #1B2530 75%);
  background-size: 200% 100%; animation: sbh-shimmer 1.4s infinite ease-in-out; border-radius: 8px;
}
.sbh-skel-line--h { height: 16px; }
.sbh-skel-line--s { height: 10px; }
@keyframes sbh-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── Empty ─────────────────────────────────────────────────────────────── */
.sbh-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; gap: 10px; text-align: center;
}
.sbh-empty-icon { font-size: 40px; color: #1B2530; }
.sbh-empty-title { font-family: 'Montserrat', 'Inter', sans-serif; font-size: 13px; font-weight: 800; color: #9AA7B5; letter-spacing: 0.08em; text-transform: uppercase; }
.sbh-empty-sub { font-size: 12px; color: #7D8A99; line-height: 1.5; max-width: 260px; }

/* ── Section ───────────────────────────────────────────────────────────── */
.sbh-section { display: flex; flex-direction: column; gap: 12px; }
.sbh-section-heading {
  display: flex; align-items: center; gap: 10px;
  flex-shrink: 0;
}
.sbh-section-title {
  font-size: 12px; font-weight: 700; line-height: 15px;
  color: #7D8A99; letter-spacing: 0.1em; text-transform: uppercase;
}
.sbh-section-heading--proses .sbh-section-title { color: #FCD34D; }
.sbh-section-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 27px; height: 27px; padding: 0 7px; border-radius: 9999px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 11px; font-weight: 800; line-height: 1;
}
.count--amber { background: #33260C; color: #FCD34D; }
.count--mint  { background: #0F2D25; color: #6EE7B7; }

/* ── Card ──────────────────────────────────────────────────────────────── */
.sbh-card {
  background: #11171E; border-radius: 24px; padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
  transition: transform 0.1s;
}
.sbh-card:active { transform: scale(0.99); }

.sbh-card-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 33px; }
.sbh-card-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }

.sbh-id-chip {
  display: inline-flex; align-items: center; flex-shrink: 0;
  background: #1B2530; color: #FFFFFF;
  padding: 8px; border-radius: 12px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 14px; font-weight: 900; line-height: 17px;
  white-space: nowrap;
}
.sbh-jenis {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 17px; font-weight: 800; line-height: 21px; color: #FFFFFF;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.sbh-status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px 0 8px; border-radius: 9999px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px; font-weight: 800; line-height: 1;
  letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
}
.badge--belum   { background: #33260C; color: #FCD34D; padding: 0 8px; }
.badge--proses  { background: #33260C; color: #FCD34D; }
.badge--selesai { background: #0F2D25; color: #6EE7B7; padding: 0 8px; }
.badge-dot { width: 6px; height: 6px; border-radius: 9999px; background: #FCD34D; }

.sbh-sohibul { font-size: 13px; line-height: 16px; color: #9AA7B5; margin: 0; }
.sbh-label-tampilan { font-size: 12px; font-weight: 700; line-height: 15px; color: #5B6776; margin: 0; }
.sbh-ts { font-size: 12px; font-weight: 700; line-height: 15px; color: #5B6776; margin: 0; }

/* ── Footer ────────────────────────────────────────────────────────────── */
.sbh-footer {
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; gap: 10px;
  background: #11171E; border-radius: 28px; padding: 14px;
}
.sbh-footer-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sbh-footer-label { font-size: 10px; font-weight: 700; line-height: 12px; letter-spacing: 0.1em; color: #7D8A99; text-transform: uppercase; }
.sbh-footer-name  { font-family: 'Montserrat', 'Inter', sans-serif; font-size: 16px; font-weight: 800; line-height: 20px; color: #FFFFFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sbh-back-btn {
  flex-shrink: 0; display: flex; align-items: center; height: 41px; padding: 0 13px;
  border: none; border-radius: 20px; background: #1B2530;
  cursor: pointer; font-family: inherit; transition: background 0.15s, transform 0.08s;
}
.sbh-back-btn:hover  { background: #223040; }
.sbh-back-btn:active { transform: scale(0.98); }
.sbh-back-label {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 12px; font-weight: 800; line-height: 1;
  letter-spacing: 0.06em; color: #FFFFFF;
}
</style>