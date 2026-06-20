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
    { name: 'theme-color', content: '#ffffff' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
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
      <div class="sbh-brand">
        <h2 class="sbh-brand-title">{{ PHASE_TITLE }}</h2>
        <span class="sbh-live-dot" :class="{ 'sbh-live-dot--offline': !isSyncing }">
          <span class="sbh-live-dot-ping"></span>
          <span class="sbh-live-dot-core"></span>
        </span>
      </div>
      <div class="sbh-operator-chip">
        <span class="material-symbols-outlined sbh-operator-icon">badge</span>
      <span class="chip-text">{{ operatorName }}</span>
      </div>
    </header>

    <!-- QUICK ACTION -->
    <div class="sbh-qr-section">
      <button class="sbh-qr-btn" @click="openQrScanner">
        <span class="material-symbols-outlined sbh-qr-icon">qr_code_scanner</span>
        BUKA KAMERA QR SCAN
      </button>
    </div>

    <!-- TACTICAL STATS -->
    <div class="sbh-stats">
      <div class="sbh-stat-card">
        <span class="sbh-stat-label">ANTRIAN</span>
        <span class="sbh-stat-value stat--antrian">{{ antrianCount }}</span>
      </div>
      <div class="sbh-stat-card">
        <span class="sbh-stat-label">SELESAI</span>
        <span class="sbh-stat-value stat--selesai">{{ grupSelesai.length }}</span>
      </div>
      <div class="sbh-stat-card">
        <span class="sbh-stat-label">TOTAL</span>
        <span class="sbh-stat-value stat--total">{{ grupEligible.length }}</span>
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
          <div class="sbh-section-heading heading--proses">
            SEDANG DIPROSES
            <span class="sbh-section-count">{{ grupProses.length }}</span>
          </div>

          <div
            v-for="grup in grupProses"
            :key="grup.id_grup"
            class="sbh-card"
          >
            <div class="sbh-card-accent accent--proses"></div>
            <div class="sbh-card-row">
              <div class="sbh-card-identity">
                <span class="sbh-id-chip">{{ grup.id_grup }}</span>
                <span class="sbh-jenis">{{ grup.jenis_hewan ?? '—' }}</span>
              </div>
              <span class="sbh-status-badge badge--proses">{{ statusLabel('Proses') }}</span>
            </div>
            <p class="sbh-sohibul">Sohibul: {{ sohibulNames(grup) }}</p>
            <p v-if="grup.label_tampilan" class="sbh-label-tampilan">{{ grup.label_tampilan }}</p>
          </div>
        </div>

        <!-- ── BELUM section ──────────────────────────────────────────── -->
        <div v-if="grupBelum.length > 0" class="sbh-section">
          <div class="sbh-section-heading">
            MENUNGGU MULAI
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
              <span class="sbh-status-badge badge--belum">{{ statusLabel('Belum') }}</span>
            </div>
            <p class="sbh-sohibul">Sohibul: {{ sohibulNames(grup) }}</p>
            <p v-if="grup.label_tampilan" class="sbh-label-tampilan">{{ grup.label_tampilan }}</p>
          </div>
        </div>

        <!-- ── SELESAI section ──────────────────────────────────────── -->
        <div v-if="grupSelesai.length > 0" class="sbh-section">
          <div class="sbh-section-heading heading--done">
            SELESAI
            <span class="sbh-section-count">{{ grupSelesai.length }}</span>
          </div>

          <div v-for="grup in grupSelesai" :key="grup.id_grup" class="sbh-card card--done">
            <div class="sbh-card-accent accent--selesai"></div>
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
      <button class="flex items-center gap-1 text-secondary hover:bg-secondary/5 px-3 py-1.5 rounded-lg transition-colors active:scale-95" @click="Index">
        <span class="material-symbols-outlined text-[10px] sbh-footer-name">chevron_left</span>
        <span class="sbh-footer-name">KEMBALI</span>
      </button>
    </footer>
  </div>
</template>

<style>
html, body {
  width: 100% !important; height: 100% !important;
  margin: 0 !important; padding: 0 !important;
  overflow: hidden !important;
  overscroll-behavior-y: none; touch-action: manipulation;
  background: #f6fafe !important;
}
</style>

<style scoped>
/* ============================================================
   PENGULITAN PWA — "Emerald Governance" Light Theme
   ============================================================ */

.sbh-root {
  --c-primary: #003527;
  --c-on-primary: #ffffff;
  --c-primary-container: #064e3b;
  --c-on-primary-container: #80bea6;
  --c-secondary: #006a61;
  --c-on-secondary: #ffffff;
  --c-secondary-container: #86f2e4;
  --c-on-secondary-container: #006f66;
  --c-background: #f6fafe;
  --c-surface: #f6fafe;
  --c-on-surface: #171c1f;
  --c-surface-variant: #dfe3e7;
  --c-on-surface-variant: #404944;
  --c-surface-container-lowest: #ffffff;
  --c-surface-container-low: #f0f4f8;
  --c-surface-container: #eaeef2;
  --c-surface-container-high: #e4e9ed;
  --c-surface-container-highest: #dfe3e7;
  --c-outline: #707974;
  --c-outline-variant: #bfc9c3;
  --c-border-subtle: #e2e8f0;
  --c-status-completed: #16a34a;
  --c-status-completed-bg: #dcfce7;
  --c-status-pending: #f59e0b;
  --c-status-unpaid: #ef4444;
  --c-error: #ba1a1a;
  --c-error-container: #ffdad6;
  --c-on-error-container: #93000a;

  display: flex; flex-direction: column; height: 100dvh; overflow: hidden;
  background-color: var(--c-surface-container-low); color: var(--c-on-surface);
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.sbh-header {
  display: flex; align-items: center; justify-content: space-between;
  background-color: var(--c-surface-container-lowest);
  border-bottom: 1px solid var(--c-border-subtle);
  padding: 12px 24px; flex-shrink: 0; gap: 12px;
}
.sbh-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.sbh-brand-title {
  font-size: 18px; line-height: 28px; font-weight: 600;
  color: var(--c-primary); letter-spacing: -0.01em; margin: 0;
}
.sbh-live-dot { position: relative; display: inline-flex; height: 8px; width: 8px; }
.sbh-live-dot-ping {
  position: absolute; display: inline-flex; height: 100%; width: 100%;
  border-radius: 9999px; background: var(--c-status-completed); opacity: 0.75;
  animation: sbh-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.sbh-live-dot-core { position: relative; display: inline-flex; border-radius: 9999px; height: 8px; width: 8px; background: var(--c-status-completed); }
@keyframes sbh-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
.sbh-live-dot--offline .sbh-live-dot-ping { animation: none; opacity: 0; }
.sbh-live-dot--offline .sbh-live-dot-core { background: var(--c-outline-variant); }

.sbh-operator-chip {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 4px 8px; background: var(--c-surface-container); border: 1px solid var(--c-outline-variant);
  border-radius: 0.25rem;
}
.sbh-operator-icon { font-size: 16px; color: var(--c-outline); }
.sbh-operator-input {
  background: transparent; border: none; outline: none;
  color: var(--c-primary); font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 700; letter-spacing: -0.01em;
  width: 96px; padding: 0;
}
.sbh-operator-input::placeholder { color: var(--c-outline); opacity: 0.7; font-weight: 500; }

/* ── Quick action ──────────────────────────────────────────────────────── */
.sbh-qr-section { padding: 16px; flex-shrink: 0; }
.sbh-qr-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--c-primary); color: var(--c-on-primary);
  border: none; border-radius: 0.25rem; cursor: pointer;
  padding: 12px 14px; font-family: 'Inter', sans-serif;
  font-size: 14px; font-weight: 600; letter-spacing: 0.05em;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  transition: filter 0.12s, transform 0.08s;
}
.sbh-qr-btn:active { transform: scale(0.985); filter: brightness(0.92); }
.sbh-qr-icon { font-size: 20px; font-variation-settings: 'FILL' 1; }

/* ── Stats ─────────────────────────────────────────────────────────────── */
.sbh-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 0 16px 16px; flex-shrink: 0; }
.sbh-stat-card {
  display: flex; flex-direction: column; align-items: center;
  background: var(--c-surface-container-lowest); border: 1px solid var(--c-border-subtle);
  border-radius: 0.5rem; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.sbh-stat-label { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--c-on-surface-variant); }
.sbh-stat-value { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.01em; }
.stat--antrian { color: var(--c-status-pending); }
.stat--selesai { color: var(--c-status-completed); }
.stat--total   { color: var(--c-primary); }

/* ── Error banner ──────────────────────────────────────────────────────── */
.sbh-banner {
  display: flex; align-items: center; gap: 10px;
  margin: 0 16px 12px; padding: 10px 12px;
  background: var(--c-error-container); border: 1px solid rgba(186,26,26,0.3);
  border-radius: 0.375rem; flex-shrink: 0;
}
.sbh-banner-icon { font-size: 18px; color: var(--c-error); flex-shrink: 0; }
.sbh-banner-msg { font-size: 12px; color: var(--c-on-error-container); flex: 1; line-height: 1.4; font-weight: 500; }
.sbh-banner-dismiss {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 700;
  color: var(--c-error); border: 1px solid rgba(186,26,26,0.35); background: transparent;
  padding: 4px 10px; cursor: pointer; flex-shrink: 0; border-radius: 0.25rem;
}
.sbh-banner-enter-active, .sbh-banner-leave-active { transition: all 0.2s ease; }
.sbh-banner-enter-from, .sbh-banner-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Body / list ───────────────────────────────────────────────────────── */
.sbh-body {
  flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 80px;
  display: flex; flex-direction: column; gap: 12px;
  -webkit-overflow-scrolling: touch;
}
.sbh-list-header {
  position: sticky; top: 0; z-index: 10;
  display: flex; justify-content: space-between; align-items: center;
  background: var(--c-surface-container-low); padding: 8px 0; margin-bottom: -4px;
}
.sbh-list-title {
  font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--c-on-surface-variant);
}
.sbh-list-status {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  color: var(--c-status-completed);
}
.sbh-list-status--offline { color: var(--c-on-surface-variant); }

/* ── Skeleton ──────────────────────────────────────────────────────────── */
.sbh-skeleton-list { display: flex; flex-direction: column; gap: 10px; }
.sbh-skeleton-card {
  background: var(--c-surface-container-lowest); border: 1px solid var(--c-border-subtle);
  border-radius: 0.5rem; padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.sbh-skel-line {
  background: linear-gradient(90deg, var(--c-surface-container) 25%, var(--c-surface-container-highest) 50%, var(--c-surface-container) 75%);
  background-size: 200% 100%; animation: sbh-shimmer 1.4s infinite ease-in-out; border-radius: 0.25rem;
}
.sbh-skel-line--h { height: 16px; }
.sbh-skel-line--s { height: 10px; }
@keyframes sbh-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── Empty ─────────────────────────────────────────────────────────────── */
.sbh-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; gap: 10px; text-align: center;
}
.sbh-empty-icon { font-size: 40px; color: var(--c-outline-variant); }
.sbh-empty-title { font-size: 13px; font-weight: 700; color: var(--c-on-surface-variant); letter-spacing: 0.08em; text-transform: uppercase; }
.sbh-empty-sub { font-size: 12px; color: var(--c-outline); line-height: 1.5; max-width: 260px; }

/* ── Section ───────────────────────────────────────────────────────────── */
.sbh-section { display: flex; flex-direction: column; gap: 8px; }
.sbh-section-heading {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 700; color: var(--c-on-surface-variant);
  letter-spacing: 0.08em; text-transform: uppercase;
  padding-bottom: 4px; border-bottom: 1px solid var(--c-border-subtle);
}
.heading--proses { color: var(--c-status-pending); border-bottom-color: rgba(245,158,11,0.25); }
.heading--done   { opacity: 0.7; }
.sbh-section-count { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--c-outline); }

/* ── Card ──────────────────────────────────────────────────────────────── */
.sbh-card {
  background: var(--c-surface-container-lowest); border: 1px solid var(--c-border-subtle);
  border-radius: 0.5rem; padding: 14px 14px 14px 18px; position: relative; overflow: hidden;
  display: flex; flex-direction: column; gap: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sbh-card-accent { position: absolute; top: 0; left: 0; width: 4px; height: 100%; }
.accent--belum   { background: var(--c-outline-variant); }
.accent--proses  { background: var(--c-status-pending); }
.accent--selesai { background: var(--c-status-completed); }

.card--done     { opacity: 0.85; }

.sbh-card-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.sbh-card-identity { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }

.sbh-id-chip {
  background: rgba(245,158,11,0.1); color: var(--c-status-pending);
  padding: 2px 8px; border-radius: 0.25rem; font-size: 12px; font-weight: 700;
  font-family: 'Inter', sans-serif; letter-spacing: -0.01em; white-space: nowrap;
}
.sbh-jenis { font-size: 14px; font-weight: 700; color: var(--c-on-surface); }

.sbh-status-badge {
  padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
}
.badge--belum   { background: rgba(245,158,11,0.12); color: var(--c-status-pending); }
.badge--proses  { background: var(--c-secondary-container); color: var(--c-on-secondary-container); }
.badge--selesai { background: var(--c-status-completed-bg); color: var(--c-status-completed); }

.sbh-sohibul { font-size: 13px; line-height: 18px; color: var(--c-on-surface-variant); margin: 0; }
.sbh-label-tampilan { font-size: 11px; color: var(--c-outline); margin: 0; }
.sbh-ts { font-size: 11px; font-family: 'Inter', sans-serif; color: var(--c-outline); margin: 4px 0 0; }

/* ── Footer ────────────────────────────────────────────────────────────── */
.sbh-footer {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--c-surface-container-lowest); border-top: 1px solid var(--c-border-subtle);
  padding: 12px 24px; flex-shrink: 0;
}
.sbh-footer-block { display: flex; flex-direction: column; gap: 1px; }
.sbh-footer-block--right { align-items: flex-end; }
.sbh-footer-label { font-size: 10px; font-weight: 700; color: var(--c-outline); text-transform: uppercase; }
.sbh-footer-name  { font-size: 13px; font-weight: 700; color: var(--c-primary); }
.sbh-footer-version { font-size: 10px; color: var(--c-outline); letter-spacing: 0.04em; }
</style>