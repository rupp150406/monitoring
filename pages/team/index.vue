<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQurbanRealtime } from '@/composables/useQurbanEngine';
import type { GrupHewan, Database } from '@/composables/useQurbanEngine';

// ─── Page meta ────────────────────────────────────────────────────────────────
definePageMeta({ layout: false });

useHead({
  title: 'Dashboard Tim | Qurban Monitor V2',
  meta: [
    { name: 'theme-color', content: '#003527' },
    { name: 'viewport',    content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' },
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
  ],
});

// ─── Router + Supabase ───────────────────────────────────────────────────────
const router   = useRouter();
const supabase = useSupabaseClient<Database>();

// ─── Operator identity ────────────────────────────────────────────────────────
const LS_ACTOR_NAME = 'qurban_actor_name';
const LS_ACTOR_ID   = 'qurban_actor_id';
const operatorName  = ref<string>('');
const operatorId    = ref('Jamaah');

// ─── Data ─────────────────────────────────────────────────────────────────────
const rawData       = ref<GrupHewan[]>([]);
const isPageLoading = ref(true);
const fetchError    = ref('');

async function fetchData(): Promise<void> {
  isPageLoading.value = true;
  fetchError.value    = '';
  try {
    const { data, error } = await supabase
      .from('grup_hewan')
      .select('id_grup, status_kedatangan, status_sembelihan, status_pengulitan, status_pengemasan');
    if (error) throw new Error(error.message);
    rawData.value = (data ?? []) as GrupHewan[];
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : 'Gagal memuat data.';
    console.error('[Dashboard] fetchData:', fetchError.value);
  } finally {
    isPageLoading.value = false;
  }
}

// ─── Realtime ─────────────────────────────────────────────────────────────────
const { connect: connectRealtime, disconnect: disconnectRealtime, isSyncing } =
  useQurbanRealtime(rawData, {
    channelSuffix:    'team-dashboard',
    onInsert:         () => fetchData(),
    onConnectionLost: () => fetchData(),
  });

// ─── KPIs ─────────────────────────────────────────────────────────────────────
const grupList = computed<GrupHewan[]>(() => rawData.value);

const kpiKedatangan = computed<number>(() =>
  grupList.value.filter((g) => g.status_kedatangan === 'Diterima').length
);

const kpiAntreanSembelih = computed<number>(() =>
  grupList.value.filter(
    (g) => g.status_kedatangan === 'Diterima' && g.status_sembelihan === 'Belum'
  ).length
);

const kpiProsesKulit = computed<number>(() =>
  grupList.value.filter((g) => g.status_pengulitan === 'Proses').length
);

// ─── Live status label ────────────────────────────────────────────────────────
const lastUpdated = computed<string>(() => {
  if (isPageLoading.value) return 'Memuat...';
  if (isSyncing.value)     return 'Live';
  return 'Updated just now';
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  const name     = (window.localStorage.getItem(LS_ACTOR_NAME) ?? '').trim();
  const storedId = window.localStorage.getItem(LS_ACTOR_ID) ?? '';

  if (name) {
    operatorName.value = name;
    if (storedId && storedId !== 'anonymous') {
      operatorId.value = `OP-${storedId.slice(0, 4).toUpperCase()}`;
    } else {
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
      operatorId.value = `OP-${String(hash % 10000).padStart(4, '0')}`;
    }
  }

  await fetchData();
  connectRealtime();
});

onUnmounted(() => { disconnectRealtime(); });

// ─── Navigation ───────────────────────────────────────────────────────────────
function goToKedatangan()  { router.push('/kedatangan'); }
function goToSembelihan()  { router.push('/sembelihan'); }
function goToPengulitan()  { router.push('/pengulitan'); }
function goToPemantauan()  { router.push('/pemantauan'); }
function goToScan()        { router.push('/scan'); }
</script>

<template>
  <!--
    Root: fixed to viewport, flex column, overflow hidden.
    The <main> inside is the only thing that scrolls.
  -->
  <div class="page-root">

    <!-- ── 1. STICKY HEADER ─────────────────────────────────────────────── -->
    <header class="page-header">

      <!-- Profile pill -->
      <div class="flex items-center gap-2 bg-[#f0f4f8] rounded-full pl-1 pr-4 py-1 border border-[#E2E8F0]">
        <div class="w-8 h-8 rounded-full bg-[#003527] flex items-center justify-center overflow-hidden flex-shrink-0">
          <span class="material-symbols-outlined text-white text-[18px]" style="font-variation-settings:'FILL' 1;">person</span>
        </div>
        <div class="flex flex-col">
          <template v-if="operatorName">
            <span class="text-[10px] text-[#404944] font-medium leading-none uppercase tracking-wider mb-0.5">Operator</span>
            <span class="text-xs font-semibold text-[#171c1f] leading-none">{{ operatorName }}</span>
          </template>
          <template v-else>
            <span class="text-sm font-semibold text-[#171c1f] leading-none">Jamaah</span>
          </template>
        </div>
      </div>

      <!-- OP badge -->
      <div class="flex items-center gap-2 px-2 py-1 bg-[#eaeef2] rounded border border-[#bfc9c3]">
        <span class="material-symbols-outlined text-[#707974] text-[16px]">badge</span>
        <span class="text-[12px] font-bold text-[#003527] tracking-[-0.01em]">{{ operatorId }}</span>
      </div>

    </header>

    <!-- ── 2. SCROLLABLE MAIN ────────────────────────────────────────────── -->
    <!--
      flex-1 + min-h-0: allows this child to shrink below its content height
      so overflow-y-auto actually kicks in instead of the whole page growing.
      pb-28: clearance for the fixed CTA bar at the bottom.
    -->
    <main class="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-4 pt-6 pb-28 flex flex-col gap-8">

      <!-- ── KPI MATRIX ─────────────────────────────────────────────────── -->
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between mb-1 px-1">
          <h2 class="text-xs font-bold text-[#404944] uppercase tracking-widest">Live Dashboard</h2>
          <span class="flex items-center gap-1.5 text-[10px] text-[#404944]">
            <span :class="['w-1.5 h-1.5 rounded-full inline-block', isSyncing ? 'bg-[#F59E0B]' : 'bg-[#16A34A] pulse-ring']"></span>
            {{ lastUpdated }}
          </span>
        </div>

        <div class="grid grid-cols-3 gap-2">

          <!-- Kedatangan -->
          <div class="kpi-card">
            <div class="kpi-glow" style="background:rgba(23,28,31,0.05)"></div>
            <span class="kpi-label text-[#404944]">Kedatangan</span>
            <span class="kpi-value text-[#171c1f]">{{ kpiKedatangan }}</span>
          </div>

          <!-- Antrean Sembelih -->
          <div class="kpi-card">
            <div class="kpi-glow" style="background:rgba(22,163,74,0.10)"></div>
            <span class="kpi-label text-[#16A34A]">Antrean<br>Sembelih</span>
            <span class="kpi-value text-[#16A34A]">{{ kpiAntreanSembelih }}</span>
          </div>

          <!-- Proses Kulit -->
          <div class="kpi-card">
            <div class="kpi-glow" style="background:rgba(245,158,11,0.10)"></div>
            <span class="kpi-label text-[#F59E0B]">Proses<br>Kulit</span>
            <span class="kpi-value text-[#F59E0B]">{{ kpiProsesKulit }}</span>
          </div>

        </div>
      </section>

      <!-- ── AREA OPERASIONAL ───────────────────────────────────────────── -->
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between mb-1 px-1">
          <h2 class="text-xs font-bold text-[#404944] uppercase tracking-widest">Area Operasional</h2>
        </div>

        <div class="flex flex-col gap-2">

          <!-- Kedatangan -->
          <button class="area-btn" @click="goToKedatangan">
            <div class="area-icon-wrap bg-[#f0f4f8] text-[#404944]">
              <span class="material-symbols-outlined text-[20px]">local_shipping</span>
            </div>
            <div class="area-text">
              <span class="area-title">Pos Logistik Kedatangan</span>
              <span class="area-sub">Penerimaan &amp; Verifikasi</span>
            </div>
            <span class="material-symbols-outlined text-[#707974]">chevron_right</span>
          </button>

          <!-- Sembelihan -->
          <button class="area-btn" @click="goToSembelihan">
            <div class="area-icon-wrap bg-[#16A34A]/10 text-[#16A34A]">
              <span class="material-symbols-outlined text-[20px]" style="font-variation-settings:'FILL' 1;">cut</span>
            </div>
            <div class="area-text">
              <span class="area-title">Pos Area Penyembelihan</span>
              <span class="area-sub">Eksekusi &amp; Pencatatan</span>
            </div>
            <span class="material-symbols-outlined text-[#707974]">chevron_right</span>
          </button>

          <!-- Pengulitan -->
          <button class="area-btn" @click="goToPengulitan">
            <div class="area-icon-wrap bg-[#F59E0B]/10 text-[#F59E0B]">
              <span class="material-symbols-outlined text-[20px]">inventory_2</span>
            </div>
            <div class="area-text">
              <span class="area-title">Pos Area Pengulitan</span>
              <span class="area-sub">Pemisahan &amp; Penimbangan</span>
            </div>
            <span class="material-symbols-outlined text-[#707974]">chevron_right</span>
          </button>

          <!-- Pemantauan -->
          <button class="area-btn" @click="goToPemantauan">
            <div class="area-icon-wrap bg-[#f0f4f8] text-[#404944]">
              <span class="material-symbols-outlined text-[20px]">monitor</span>
            </div>
            <div class="area-text">
              <span class="area-title">Pos Area Pemantauan</span>
              <span class="area-sub">Live Monitoring &amp; Laporan</span>
            </div>
            <span class="material-symbols-outlined text-[#707974]">chevron_right</span>
          </button>

        </div>
      </section>

    </main>

    <!-- ── 3. FIXED BOTTOM CTA ───────────────────────────────────────────── -->
    <div class="cta-bar">
      <button class="cta-btn" @click="goToScan">
        <span class="material-symbols-outlined text-white" style="font-variation-settings:'FILL' 1;">qr_code_scanner</span>
        <span class="text-sm uppercase tracking-wider font-extrabold">Buka Kamera Scan QR</span>
      </button>
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
  display: inline-block;
  line-height: 1;
  text-transform: none;
  letter-spacing: normal;
  word-wrap: normal;
  white-space: nowrap;
  direction: ltr;
}

/* ── Pulse animation for live dot ───────────────────────────────────────────── */
@keyframes pulse-ring {
  0%   { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(22,163,74,0.7); }
  70%  { transform: scale(1);   box-shadow: 0 0 0 6px rgba(22,163,74,0); }
  100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(22,163,74,0); }
}
.pulse-ring { animation: pulse-ring 2s cubic-bezier(0.215,0.61,0.355,1) infinite; }

/* ── Scrollbar hide ─────────────────────────────────────────────────────────── */
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* ── Body: no min-height forcing — let the flex root handle height ──────────── */
body {
  overscroll-behavior-y: none;
  background-color: #f6fafe;
  color: #171c1f;
  margin: 0;
  padding: 0;
}
</style>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════════
   ROOT — fixed to viewport, no body growth
   ══════════════════════════════════════════════════════════════════════════════ */
.page-root {
  position: fixed;           /* lock to viewport — no page-level scroll */
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f6fafe;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #171c1f;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* ══════════════════════════════════════════════════════════════════════════════
   HEADER — flex-none so it never shrinks
   ══════════════════════════════════════════════════════════════════════════════ */
.page-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #f6fafe;
  border-bottom: 1px solid #E2E8F0;
  z-index: 10;
}

/* ══════════════════════════════════════════════════════════════════════════════
   KPI CARDS
   ══════════════════════════════════════════════════════════════════════════════ */
.kpi-card {
  background: #ffffff;
  border: 1px solid #E2E8F0;
  border-radius: 0.75rem;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  position: relative;
  overflow: hidden;
}
.kpi-glow {
  position: absolute;
  top: 0; right: 0;
  width: 64px; height: 64px;
  border-radius: 9999px;
  filter: blur(20px);
  transform: translate(32px, -32px);
  pointer-events: none;
}
.kpi-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  line-height: 1.3;
}
.kpi-value {
  font-size: 30px;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1;
}

/* ══════════════════════════════════════════════════════════════════════════════
   AREA BUTTONS
   ══════════════════════════════════════════════════════════════════════════════ */
.area-btn {
  width: 100%;
  background: #ffffff;
  border: 1px solid #E2E8F0;
  border-radius: 0.75rem;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
  text-align: left;
}
.area-btn:active { background: #f0f4f8; }

.area-icon-wrap {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
}
.area-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.area-title {
  font-size: 14px;
  font-weight: 700;
  color: #171c1f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.area-sub {
  font-size: 12px;
  color: #404944;
}

/* ══════════════════════════════════════════════════════════════════════════════
   FIXED CTA BAR
   ══════════════════════════════════════════════════════════════════════════════ */
.cta-bar {
  flex: none;
  padding: 12px 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  background: linear-gradient(to top, #f6fafe 80%, transparent);
  z-index: 20;
}
.cta-btn {
  width: 100%;
  background: #003527;
  color: #ffffff;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  border: none;
  border-radius: 0.75rem;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-shadow: 0 4px 14px rgba(0,53,39,0.3);
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.cta-btn:active {
  transform: scale(0.98);
  box-shadow: 0 2px 8px rgba(0,53,39,0.2);
}
</style>