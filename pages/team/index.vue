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
    { name: 'theme-color', content: '#0A0E13' },
    { name: 'viewport',    content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap' },
    // display=block keeps the fallback text invisible while the icon font
    // downloads (swap would paint "person", "qr_code_scanner", … immediately).
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block' },
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

// ─── Live status pill ─────────────────────────────────────────────────────────
const liveState = computed<{ label: string; color: string; bg: string; pulse: boolean }>(() => {
  if (isPageLoading.value) return { label: 'Memuat', color: '#FCD34D', bg: '#2B2008', pulse: false };
  if (isSyncing.value)     return { label: 'Live',   color: '#6EE7B7', bg: '#0F2A22', pulse: true };
  return { label: 'Offline', color: '#FCA5A5', bg: '#2B1414', pulse: false };
});

// ─── Icon font readiness (skeletons hide the raw ligature text) ──────────────
const iconsReady = ref(false);

async function waitForIconFont(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    iconsReady.value = true;
    return;
  }

  const spec = '24px "Material Symbols Outlined"';
  const fastPollUntil = Date.now() + 10000;   // poll quickly for the first 10s
  const giveUpAt      = Date.now() + 60000;   // last resort, don't hide the page forever

  // Poll until Google Fonts has registered the face AND its file has finished
  // downloading. Until then the skeletons cover the cards and the raw ligature
  // strings ("local_shipping", "qr_code_scanner", …) stay hidden.
  while (Date.now() < giveUpAt) {
    try {
      const faces = await document.fonts.load(spec, 'person');
      if (faces.length > 0) {
        await document.fonts.ready;
        break;
      }
    } catch { /* stylesheet not parsed yet — try again */ }
    const fast = Date.now() < fastPollUntil;
    await new Promise((resolve) => setTimeout(resolve, fast ? 100 : 500));
  }

  // Let the browser paint the real glyphs for two frames before the skeleton
  // fades, otherwise the first frame can still show fallback text.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  iconsReady.value = true;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  void waitForIconFont();

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
function goToLogin() { router.push('/team/login') }
</script>

<template>
  <!--
    Root: locked to the viewport. The padded column keeps the 390px canvas
    proportions on wider screens; <main> is the only scrolling region.
  -->
  <div class="team-root" :class="{ 'icons-pending': !iconsReady }">
    <div class="mx-auto flex h-full w-full max-w-[430px] flex-col px-5 pt-5">

      <!-- ── HEADER ──────────────────────────────────────────────────────── -->
      <header class="relative flex h-[80px] shrink-0 items-center gap-3.5 overflow-hidden rounded-[28px] bg-[#11171E] p-3.5">

        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3.5 text-left"
          :class="operatorName ? 'cursor-default' : 'cursor-pointer active:opacity-80'"
          :tabindex="operatorName ? -1 : 0"
          :aria-label="operatorName ? 'Operator aktif' : 'Masuk sebagai operator'"
          @click="!operatorName && goToLogin()"
        >
          <span class="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#34D399]">
            <span
              class="material-symbols-outlined text-[24px] text-[#052E22]"
              style="font-variation-settings:'FILL' 0,'wght' 500;"
            >person</span>
          </span>

          <span class="flex min-w-0 flex-col gap-1.5">
            <span class="truncate text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em] text-[#7D8A99]">
              Operator <span v-if="operatorName" class="text-[#4E5A68]">· {{ operatorId }}</span>
            </span>
            <span class="team-display truncate text-[19px] font-extrabold leading-[1.2] text-white">
              {{ operatorName || 'Jamaah' }}
            </span>
          </span>
        </button>

        <span
          class="flex h-[35px] shrink-0 items-center gap-1.5 rounded-full px-2.5"
          :style="{ background: liveState.bg }"
          aria-live="polite"
        >
          <span
            class="h-2 w-2 rounded-full"
            :class="{ 'pulse-ring': liveState.pulse }"
            :style="{ background: liveState.color }"
          ></span>
          <span class="text-[12px] font-bold" :style="{ color: liveState.color }">{{ liveState.label }}</span>
        </span>

        <!-- Skeleton until the icon font is ready -->
        <span class="sk-cover" :class="{ 'sk-cover--done': iconsReady }" aria-hidden="true">
          <span class="sk-circle"></span>
          <span class="sk-stack">
            <span class="sk-bar sk-bar--xs"></span>
            <span class="sk-bar sk-bar--md"></span>
          </span>
          <span class="sk-bar sk-bar--pill"></span>
        </span>
      </header>

      <!-- ── SCROLLING CONTENT ───────────────────────────────────────────── -->
      <main class="hide-scrollbar mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">

        <!-- KPI matrix -->
        <section class="flex flex-col gap-4">
          <h2 class="text-[12px] font-bold uppercase leading-[1.25] tracking-[0.1em] text-[#7D8A99]">Live Dashboard</h2>

          <div class="grid grid-cols-3 gap-2.5">
            <div class="kpi-card h-[120px] rounded-[24px] bg-[#10253C] p-3.5">
              <span class="kpi-label text-[#93C5FD]">Kedatangan<br />Diterima</span>
              <span class="kpi-value">{{ kpiKedatangan }}</span>
            </div>

            <div class="kpi-card h-[120px] rounded-[24px] bg-[#0F2D25] p-3.5">
              <span class="kpi-label text-[#6EE7B7]">Antrean<br />Sembelih</span>
              <span class="kpi-value">{{ kpiAntreanSembelih }}</span>
            </div>

            <div class="kpi-card h-[120px] rounded-[24px] bg-[#33260C] p-3.5">
              <span class="kpi-label text-[#FCD34D]">Proses<br />Kulit</span>
              <span class="kpi-value">{{ kpiProsesKulit }}</span>
            </div>
          </div>
        </section>

        <!-- Operational areas -->
        <section class="flex flex-col gap-4">
          <h2 class="text-[12px] font-bold uppercase leading-[1.25] tracking-[0.1em] text-[#7D8A99]">Area Operasional</h2>

          <div class="flex flex-col gap-2.5">

            <!-- Kedatangan -->
            <button type="button" class="area-card" @click="goToKedatangan">
              <span class="area-icon bg-[#10253C] text-[#93C5FD]">
                <span class="material-symbols-outlined text-[22px]">local_shipping</span>
              </span>
              <span class="area-text">
                <span class="area-title">Pos Logistik Kedatangan</span>
                <span class="area-sub">Penerimaan &amp; Verifikasi</span>
              </span>
              <span class="material-symbols-outlined shrink-0 text-[20px] text-[#5B6776]">chevron_right</span>
              <span class="sk-cover" :class="{ 'sk-cover--done': iconsReady }" aria-hidden="true">
                <span class="sk-tile"></span>
                <span class="sk-stack sk-stack--tight">
                  <span class="sk-bar sk-bar--title"></span>
                  <span class="sk-bar sk-bar--sub"></span>
                </span>
                <span class="sk-chev"></span>
              </span>
            </button>

            <!-- Sembelihan -->
            <button type="button" class="area-card" @click="goToSembelihan">
              <span class="area-icon bg-[#0F2D25] text-[#6EE7B7]">
                <span class="material-symbols-outlined text-[22px]">content_cut</span>
              </span>
              <span class="area-text">
                <span class="area-title">Pos Area Penyembelihan</span>
                <span class="area-sub">Eksekusi &amp; Pencatatan</span>
              </span>
              <span class="material-symbols-outlined shrink-0 text-[20px] text-[#5B6776]">chevron_right</span>
              <span class="sk-cover" :class="{ 'sk-cover--done': iconsReady }" aria-hidden="true">
                <span class="sk-tile"></span>
                <span class="sk-stack sk-stack--tight">
                  <span class="sk-bar sk-bar--title"></span>
                  <span class="sk-bar sk-bar--sub"></span>
                </span>
                <span class="sk-chev"></span>
              </span>
            </button>

            <!-- Pengulitan -->
            <button type="button" class="area-card" @click="goToPengulitan">
              <span class="area-icon bg-[#33260C] text-[#FCD34D]">
                <span class="material-symbols-outlined text-[22px]">deployed_code</span>
              </span>
              <span class="area-text">
                <span class="area-title">Pos Area Pengulitan</span>
                <span class="area-sub">Pemisahan &amp; Penimbangan</span>
              </span>
              <span class="material-symbols-outlined shrink-0 text-[20px] text-[#5B6776]">chevron_right</span>
              <span class="sk-cover" :class="{ 'sk-cover--done': iconsReady }" aria-hidden="true">
                <span class="sk-tile"></span>
                <span class="sk-stack sk-stack--tight">
                  <span class="sk-bar sk-bar--title"></span>
                  <span class="sk-bar sk-bar--sub"></span>
                </span>
                <span class="sk-chev"></span>
              </span>
            </button>

            <!-- Pemantauan -->
            <button type="button" class="area-card" @click="goToPemantauan">
              <span class="area-icon bg-[#271F45] text-[#C4B5FD]">
                <span class="material-symbols-outlined text-[22px]">desktop_windows</span>
              </span>
              <span class="area-text">
                <span class="area-title">Pos Area Pemantauan</span>
                <span class="area-sub">Live Monitoring &amp; Laporan</span>
              </span>
              <span class="material-symbols-outlined shrink-0 text-[20px] text-[#5B6776]">chevron_right</span>
              <span class="sk-cover" :class="{ 'sk-cover--done': iconsReady }" aria-hidden="true">
                <span class="sk-tile"></span>
                <span class="sk-stack sk-stack--tight">
                  <span class="sk-bar sk-bar--title"></span>
                  <span class="sk-bar sk-bar--sub"></span>
                </span>
                <span class="sk-chev"></span>
              </span>
            </button>

          </div>
        </section>

      </main>

      <!-- ── FIXED CTA ───────────────────────────────────────────────────── -->
      <div class="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" class="cta-btn" @click="goToScan">
          <span class="material-symbols-outlined text-[22px]">qr_code_scanner</span>
          <span class="team-display text-[14px] font-extrabold uppercase">Buka Kamera Scan QR</span>
          <span class="sk-cover sk-cover--cta" :class="{ 'sk-cover--done': iconsReady }" aria-hidden="true">
            <span class="sk-bar sk-bar--cta"></span>
          </span>
        </button>
      </div>

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
  font-variation-settings: 'wght' 500;
}

/* While the icon font downloads, hide the raw ligature text completely so a
   slow CDN can never paint "local_shipping", "qr_code_scanner", … */
.icons-pending .material-symbols-outlined { visibility: hidden; }

/* ── Live dot pulse ─────────────────────────────────────────────────────────── */
@keyframes pulse-ring {
  0%   { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(52,211,153,0.65); }
  70%  { transform: scale(1);   box-shadow: 0 0 0 6px rgba(52,211,153,0); }
  100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(52,211,153,0); }
}
.pulse-ring { animation: pulse-ring 2s cubic-bezier(0.215,0.61,0.355,1) infinite; }

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
   ROOT — locked to the viewport, dark canvas
   ══════════════════════════════════════════════════════════════════════════════ */
.team-root {
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
}

/* Montserrat carries every display face in the canvas */
.team-display {
  font-family: 'Montserrat', 'Inter', sans-serif;
}

/* ══════════════════════════════════════════════════════════════════════════════
   KPI CARDS — 110×120 in the canvas, label top / number bottom
   ══════════════════════════════════════════════════════════════════════════════ */
.kpi-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.kpi-label {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-transform: uppercase;
}

.kpi-value {
  margin-top: auto;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: clamp(36px, 11.4vw, 44px);
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: #FFFFFF;
}

/* ══════════════════════════════════════════════════════════════════════════════
   AREA CARDS — 350×76, icon tile 48, chevron on the right
   ══════════════════════════════════════════════════════════════════════════════ */
.area-card {
  position: relative;
  overflow: hidden;
  display: flex;
  width: 100%;
  height: 76px;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: none;
  border-radius: 24px;
  background: #11171E;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.area-card:hover  { background: #151D26; }
.area-card:active { transform: scale(0.99); background: #161F29; }

.area-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.area-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.area-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  color: #E6EDF3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.area-sub {
  font-size: 12px;
  line-height: 1.25;
  color: #7D8A99;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ══════════════════════════════════════════════════════════════════════════════
   CTA — 350×62 pill, mint fill with dark ink
   ══════════════════════════════════════════════════════════════════════════════ */
.cta-btn {
  position: relative;
  overflow: hidden;
  display: flex;
  width: 100%;
  height: 62px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: none;
  border-radius: 28px;
  background: #34D399;
  color: #052E22;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(52, 211, 153, 0.16);
  transition: transform 0.1s, box-shadow 0.2s, background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.cta-btn:hover  { background: #3EE0A5; }
.cta-btn:active {
  transform: scale(0.985);
  box-shadow: 0 4px 14px rgba(52, 211, 153, 0.12);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ICON-FONT SKELETONS — cover a whole card until Material Symbols is loaded
   ══════════════════════════════════════════════════════════════════════════════ */
.sk-cover {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: inherit;
  background: #11171E;
  pointer-events: none;
  transition: opacity 0.28s ease, visibility 0.28s ease;
}

.sk-cover--done {
  opacity: 0;
  visibility: hidden;
}

.sk-cover--cta {
  justify-content: center;
  padding: 0 18px;
  background: #34D399;
}

.sk-circle,
.sk-tile,
.sk-chev {
  display: block;
  flex: 0 0 auto;
  background-color: #1B2530;
}

.sk-circle { width: 52px; height: 52px; border-radius: 50%; }
.sk-tile   { width: 48px; height: 48px; border-radius: 16px; }
.sk-chev   { width: 20px; height: 20px; border-radius: 6px; }

.sk-stack {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.sk-stack--tight { gap: 6px; }

.sk-bar {
  display: block;
  height: 12px;
  border-radius: 999px;
  background-image: linear-gradient(90deg, #1B2530 20%, #2A3745 50%, #1B2530 80%);
  background-size: 250% 100%;
  animation: sk-shimmer 1.5s ease-in-out infinite;
}

.sk-bar--xs    { height: 9px;  width: 44%; }
.sk-bar--md    { height: 19px; width: 68%; }
.sk-bar--title { height: 15px; width: 70%; }
.sk-bar--sub   { height: 12px; width: 46%; }
.sk-bar--pill  { flex: 0 0 auto; width: 72px; height: 28px; margin-left: auto; }
.sk-bar--cta   {
  width: 208px;
  height: 14px;
  background-image: linear-gradient(
    90deg,
    rgba(5, 46, 34, 0.14) 20%,
    rgba(5, 46, 34, 0.32) 50%,
    rgba(5, 46, 34, 0.14) 80%
  );
}

@keyframes sk-shimmer {
  0%   { background-position: 125% 0; }
  100% { background-position: -125% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .sk-bar { animation: none; }
}
</style>
