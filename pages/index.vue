<script setup lang="ts">
// ./pages/index.vue
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useQurbanRealtime, use12ValueScore } from '@/composables/useQurbanEngine';
import type { GrupHewan, Database } from '@/composables/useQurbanEngine';

useHead({
  title: 'Monitor Alur Kerja Hewan Qurban',
  link: [
    { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' },
  ],
});

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = useSupabaseClient<Database>();

// ─── Initial data fetch (V2 schema: grup_hewan → sohibul_qurban[]) ──────────
const { data: rawData, refresh } = await useAsyncData('monitor_grup_hewan', async () => {
  const { data, error } = await supabase
    .from('grup_hewan')
    .select('*, sohibul_qurban(*)')
    .order('id_grup', { ascending: true });
  if (error) {
    console.error('[Monitor] Initial fetch error:', error);
    return [] as GrupHewan[];
  }
  return (data ?? []) as GrupHewan[];
});

const grupList = computed(() => rawData.value ?? []);

// ─── V2 Composables ──────────────────────────────────────────────────────────
const { globalPercentage, phaseMetrics, totalScore, maxTotalScore } = use12ValueScore(grupList);
const { connect: connectRealtime, disconnect: disconnectRealtime, isSyncing } = useQurbanRealtime(rawData, {
  channelSuffix: 'monitor',
  onInsert: () => refresh(),
  onConnectionLost: () => refresh(),
});

// ─── Hijri / Clock ───────────────────────────────────────────────────────────
const HIJRI_OVERRIDE = { day: 10, month: 'Dzulhijjah', year: 1447 };
const MASEHI_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const dtMasehi = ref('—');
const dtHijri  = ref('—');
const dtTime   = ref('--:--:-- WIB');

function pad2(n: number) { return String(n).padStart(2, '0'); }

function updateClock() {
  const now  = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const wib  = new Date(utcMs + 7 * 3600000);
  dtTime.value   = `${pad2(wib.getHours())}:${pad2(wib.getMinutes())}:${pad2(wib.getSeconds())} WIB`;
  dtMasehi.value = `${wib.getDate()} ${MASEHI_MONTHS[wib.getMonth()]} ${wib.getFullYear()}`;
  dtHijri.value  = `${HIJRI_OVERRIDE.day} ${HIJRI_OVERRIDE.month} ${HIJRI_OVERRIDE.year}H`;
}

// ─── Pagination & Shimmer ────────────────────────────────────────────────────
const ROWS_PER_PAGE = 10;
const activePage    = ref(1);
const isShimmering  = ref(false);
let shimmerTimeout: ReturnType<typeof setTimeout> | null = null;
const hiddenGroupIds = ref<string[]>([]);

// ─── Derived group list ───────────────────────────────────────────────────────
const visibleGrups = computed(() =>
  grupList.value.filter((g) => !hiddenGroupIds.value.includes(String(g.id_grup ?? '')))
);

function sohibulNames(grup: GrupHewan): string {
  const names = (grup.sohibul_qurban ?? [])
    .map((s: { nama?: string }) => s.nama)
    .filter(Boolean);
  return names.length === 0 ? '—' : names.join(' · ');
}

// ─── Paginated table rows ────────────────────────────────────────────────────
interface TableRow {
  displayIndex: number;
  idGrup: string;
  animalName: string;
  owner: string;
  s1: string; s2: string; s3: string; s4: string;
}

const chunkedGrup = computed<TableRow[][]>(() => {
  if (!visibleGrups.value.length) return [];
  const mapped: TableRow[] = visibleGrups.value.map((grup, index) => ({
    displayIndex: index + 1,
    idGrup:      String(grup.id_grup ?? ''),
    animalName:  grup.jenis_hewan ?? '—',
    owner:       sohibulNames(grup),
    s1: grup.status_kedatangan ?? 'Belum',
    s2: grup.status_sembelihan ?? 'Belum',
    s3: grup.status_pengulitan ?? 'Belum',
    s4: grup.status_pengemasan ?? 'Belum',
  }));
  const pages: TableRow[][] = [];
  for (let i = 0; i < mapped.length; i += ROWS_PER_PAGE) pages.push(mapped.slice(i, i + ROWS_PER_PAGE));
  return pages;
});

const totalPages   = computed(() => chunkedGrup.value.length || 1);
const paginatedData = computed(() => chunkedGrup.value[activePage.value - 1] ?? []);

function clampPage() {
  if (activePage.value > totalPages.value) activePage.value = Math.max(1, totalPages.value);
}

// ─── Phase progress (V2 composable) ─────────────────────────────────────────
const total = computed(() => visibleGrups.value.length || 1);

const progKedatangan = computed(() => {
  const m = phaseMetrics.value?.kedatangan ?? { belum: 0, proses: 0, selesai: 0 };
  return { ...m, pct: Math.round((m.selesai / total.value) * 100), frac: `${m.selesai}/${total.value}` };
});
const progSembelihan = computed(() => {
  const m = phaseMetrics.value?.sembelihan ?? { belum: 0, proses: 0, selesai: 0 };
  return { ...m, pct: Math.round((m.selesai / total.value) * 100), frac: `${m.selesai}/${total.value}` };
});
const progPengulitan = computed(() => {
  const m = phaseMetrics.value?.pengulitan ?? { belum: 0, proses: 0, selesai: 0 };
  return { ...m, pct: Math.round((m.selesai / total.value) * 100), frac: `${m.selesai}/${total.value}` };
});
const progPengemasan = computed(() => {
  const m = phaseMetrics.value?.pengemasan ?? { belum: 0, proses: 0, selesai: 0 };
  return { ...m, pct: Math.round((m.selesai / total.value) * 100), frac: `${m.selesai}/${total.value}` };
});

// ─── Summary counters ─────────────────────────────────────────────────────────
const totalHewan = computed(() => visibleGrups.value.length);
const totalSapi  = computed(() =>
  visibleGrups.value.filter((g) => String(g.jenis_hewan ?? '').toLowerCase() === 'sapi').length
);
const totalKambingDomba = computed(() =>
  visibleGrups.value.filter((g) => {
    const j = String(g.jenis_hewan ?? '').toLowerCase();
    return j === 'kambing' || j === 'domba';
  }).length
);
const summarySelesai = computed(() =>
  visibleGrups.value.filter((g) => g.status_pengemasan === 'Selesai').length
);
const summaryProses = computed(() =>
  visibleGrups.value.filter((g) => {
    const statuses = [
      g.status_kedatangan === 'Diterima' ? 'Selesai' : g.status_kedatangan,
      g.status_sembelihan, g.status_pengulitan, g.status_pengemasan,
    ];
    return statuses.some((s) => s === 'Proses') && g.status_pengemasan !== 'Selesai';
  }).length
);
const summaryBelum = computed(() =>
  visibleGrups.value.filter((g) =>
    g.status_kedatangan === 'Belum' && g.status_sembelihan === 'Belum' &&
    g.status_pengulitan === 'Belum'  && g.status_pengemasan === 'Belum'
  ).length
);

// ─── Status helpers ───────────────────────────────────────────────────────────
type StatusVal = 'Belum' | 'Proses' | 'Selesai' | 'Diterima' | string | null | undefined;

function statusClass(status: StatusVal): string {
  if (status === 'Selesai' || status === 'Diterima') return 'pill-selesai';
  if (status === 'Proses') return 'pill-proses';
  return 'pill-belum';
}

function statusIcon(status: StatusVal): string {
  if (status === 'Selesai') return 'fas fa-check-circle mr-1';
  if (status === 'Proses')  return 'fas fa-spinner fa-spin mr-1';
  if (status === 'Diterima') return 'fas fa-circle-check mr-1';
  return 'fas fa-times-circle mr-1';
}

// ─── Broadcast / page-sync channel ───────────────────────────────────────────
// `let`, not `const` — resyncChannel() below tears this down and rebuilds it,
// which a const binding can't survive.
let pageSyncChannel = supabase.channel('page-sync-channel');

function setupBroadcastListener() {
  pageSyncChannel
    .on('broadcast', { event: 'PAGE_CHANGED' }, (msg) => {
      const targetPage = Number(msg?.payload?.page);
      if (!targetPage || targetPage < 1 || targetPage > totalPages.value) return;
      triggerShimmer(targetPage);
    })
    .on('broadcast', { event: 'MANUAL_PAGE_CHANGE' }, (msg) => {
      const targetPage = Number(msg?.payload?.page);
      if (!targetPage || targetPage < 1 || targetPage > totalPages.value) return;
      triggerShimmer(targetPage);
    })
    .on('broadcast', { event: 'update-hidden-groups' }, (payload) => {
      const ids = payload?.payload?.hiddenIds;
      if (Array.isArray(ids)) {
        hiddenGroupIds.value = ids.map(String);
        nextTick(() => clampPage());
      }
    })
    .on('broadcast', { event: 'remote-reload' }, () => {
      setTimeout(() => { if (typeof window !== 'undefined') window.location.reload(); }, 300);
    })
    .subscribe((status) => { console.log('[Monitor] Supabase Realtime:', status); });
}

function triggerShimmer(targetPage: number) {
  if (shimmerTimeout) clearTimeout(shimmerTimeout);
  isShimmering.value = true;
  activePage.value   = targetPage;
  shimmerTimeout = setTimeout(() => { isShimmering.value = false; shimmerTimeout = null; }, 800);
}

// ─── Resilience nets (ported from pages/sembelihan.vue) ─────────────────────
// This TV monitor runs unattended for hours with nobody ever clicking
// anything on it — unlike admin.vue (every write triggers its own refresh())
// or sembelihan.vue (a tablet that gets backgrounded/reopened constantly and
// was built with these same nets). That makes this page the most exposed to
// a websocket dying silently — network blip, Supabase project idle/resume,
// switch reboot — without ever firing CHANNEL_ERROR/TIMED_OUT, the only
// signals useQurbanRealtime listens for. Three nets catch that:
//
// 1. A slow background poll independent of the socket entirely — the
//    last-resort net that keeps the screen from going permanently stale even
//    if Realtime itself is misconfigured (replication off, RLS blocking).
// 2. Refetch + force a fresh data channel AND a fresh page-sync channel the
//    instant the tab/display regains visibility.
// 3. Same, the instant the browser reports back online.
const POLL_INTERVAL_MS = 20_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function resyncPageSyncChannel(): void {
  supabase.removeChannel(pageSyncChannel);
  pageSyncChannel = supabase.channel('page-sync-channel');
  setupBroadcastListener();
}

async function resyncChannel() {
  await disconnectRealtime();
  connectRealtime();
  resyncPageSyncChannel();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    refresh();
    resyncChannel();
  }
}

function handleOnline() {
  refresh();
  resyncChannel();
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
let timerClock: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    navigateTo('/team');
    return;
  }

  updateClock();
  timerClock = setInterval(updateClock, 1000);
  setupBroadcastListener();
  connectRealtime();

  pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);
});

onUnmounted(() => {
  if (timerClock) clearInterval(timerClock);
  if (shimmerTimeout) clearTimeout(shimmerTimeout);
  if (pollTimer) clearInterval(pollTimer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('online', handleOnline);
  supabase.removeChannel(pageSyncChannel);
  disconnectRealtime();
});
</script>

<template>
  <div id="viewport-wrapper">
    <div class="dashboard-container" id="dashboard">

      <!-- ── HEADER ── -->
      <header class="mon-header">
        <div class="flex items-center w-1/4">
          <div class="logo-img-wrapper">
            <img src="https://ahsan.tv/wp-content/uploads/2026/05/Logo-Ahsan-TV.webp" alt="Logo AhsanTV Qurban" loading="eager" />
          </div>
        </div>
        <div class="text-center w-2/4 pt-1">
          <h2 class="text-xl font-bold tracking-wider mb-1" style="color:#003527">MONITOR ALUR KERJA (WORKFLOW)</h2>
          <h1 class="text-6xl font-extrabold mb-2 drop-shadow-sm" style="color:#003527">HEWAN QURBAN</h1>
          <div class="mon-date-badge">
            <i class="fas fa-calendar-alt"></i>Hari Idul Adha, 10 Dzulhijjah 1447H / 27 Mei 2026
          </div>
        </div>
        <div class="w-1/4 flex justify-end">
          <div id="dt-box">
            <div class="dt-header">TANGGAL &amp; WAKTU</div>
            <div class="dt-body">
              <div class="dt-date-row">
                <i class="far fa-calendar-check"></i>
                <div>
                  <div class="dt-masehi">{{ dtMasehi }}</div>
                  <div class="dt-hijri">{{ dtHijri }}</div>
                </div>
              </div>
              <div class="dt-time-row">
                <i class="far fa-clock"></i>
                <span>{{ dtTime }}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- ── STEP CARDS ── -->
      <div class="mon-step-row">

        <!-- Kedatangan -->
        <div :class="['step-card flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md relative transition-colors duration-500', progKedatangan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']">
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0', progKedatangan.pct === 100 ? 'bg-white' : 'bg-step-blue text-white']" :style="progKedatangan.pct === 100 ? 'color:#064e3b' : ''">
            <i class="fas fa-truck"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progKedatangan.pct === 100 ? 'text-white' : 'text-step-blue']">1. KEDATANGAN</div>
            <div :class="['text-xs font-bold mt-0.5', progKedatangan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Hewan tiba di lokasi</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div class="h-2 rounded-full transition-all duration-700" :class="progKedatangan.pct === 100 ? 'bg-white' : 'bg-step-blue'" :style="{ width: progKedatangan.pct + '%' }"></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progKedatangan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progKedatangan.pct }}% &nbsp;|&nbsp; {{ progKedatangan.frac }} HEWAN
            </div>
          </div>
          <div class="step-arrow"></div>
        </div>

        <!-- Sembelihan -->
        <div :class="['step-card flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md relative ml-3 transition-colors duration-500', progSembelihan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']">
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0', progSembelihan.pct === 100 ? 'bg-white' : 'bg-step-green text-white']" :style="progSembelihan.pct === 100 ? 'color:#064e3b' : ''">
            <i class="fas fa-utensils"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progSembelihan.pct === 100 ? 'text-white' : 'text-step-green']">2. SEMBELIHAN</div>
            <div :class="['text-xs font-bold mt-0.5', progSembelihan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Proses penyembelihan</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div class="h-2 rounded-full transition-all duration-700" :class="progSembelihan.pct === 100 ? 'bg-white' : 'bg-step-green'" :style="{ width: progSembelihan.pct + '%' }"></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progSembelihan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progSembelihan.pct }}% &nbsp;|&nbsp; {{ progSembelihan.frac }} HEWAN
            </div>
          </div>
          <div class="step-arrow"></div>
        </div>

        <!-- Pengulitan -->
        <div :class="['step-card flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md relative ml-3 transition-colors duration-500', progPengulitan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']">
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0', progPengulitan.pct === 100 ? 'bg-white' : 'bg-step-orange text-white']" :style="progPengulitan.pct === 100 ? 'color:#064e3b' : ''">
            <i class="fas fa-scroll"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progPengulitan.pct === 100 ? 'text-white' : 'text-step-orange']">3. PENGULITAN</div>
            <div :class="['text-xs font-bold mt-0.5', progPengulitan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Pembersihan kulit</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div class="h-2 rounded-full transition-all duration-700" :class="progPengulitan.pct === 100 ? 'bg-white' : 'bg-step-orange'" :style="{ width: progPengulitan.pct + '%' }"></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progPengulitan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progPengulitan.pct }}% &nbsp;|&nbsp; {{ progPengulitan.frac }} HEWAN
            </div>
          </div>
          <div class="step-arrow"></div>
        </div>

        <!-- Pengemasan / Distribusi -->
        <div :class="['step-card flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md ml-3 transition-colors duration-500', progPengemasan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']">
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0', progPengemasan.pct === 100 ? 'bg-white' : 'bg-step-purple text-white']" :style="progPengemasan.pct === 100 ? 'color:#064e3b' : ''">
            <i class="fas fa-box-open"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progPengemasan.pct === 100 ? 'text-white' : 'text-step-purple']">4. SIAP DISTRIBUSI</div>
            <div :class="['text-xs font-bold mt-0.5', progPengemasan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Pengemasan daging</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div class="h-2 rounded-full transition-all duration-700" :class="progPengemasan.pct === 100 ? 'bg-white' : 'bg-step-purple'" :style="{ width: progPengemasan.pct + '%' }"></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progPengemasan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progPengemasan.pct }}% &nbsp;|&nbsp; {{ progPengemasan.frac }} HEWAN
            </div>
          </div>
        </div>

      </div>

      <!-- ── TABLE ── -->
      <div class="flex-grow px-6 py-1 overflow-hidden flex flex-col bg-white" style="height: calc(100vh - 420px); min-height: 0;">
        <table class="w-full qurban-table table-fixed h-full">
          <colgroup>
            <col style="width:4%" /><col style="width:10%" /><col style="width:12%" />
            <col style="width:18%" /><col style="width:11%" /><col style="width:11%" />
            <col style="width:11%" /><col style="width:11%" /><col style="width:12%" />
          </colgroup>
          <thead>
            <tr>
              <th class="py-1.5 text-sm">No</th>
              <th class="py-1.5 text-sm">ID HEWAN</th>
              <th class="py-1.5 text-sm">JENIS HEWAN</th>
              <th class="py-1.5 text-sm">SOHIBUL QURBAN</th>
              <th class="py-1.5 text-sm th-kedatangan">KEDATANGAN</th>
              <th class="py-1.5 text-sm th-sembelihan">SEMBELIHAN</th>
              <th class="py-1.5 text-sm th-pengulitan">PENGULITAN</th>
              <th class="py-1.5 text-sm th-distribusi">SIAP DISTRIBUSI</th>
              <th class="py-1.5 text-sm th-skor">SKOR</th>
            </tr>
          </thead>
          <tbody :class="{ 'animate-shimmer': isShimmering }">
            <tr
              v-for="(row, i) in paginatedData"
              :key="`row-${activePage}-${row.idGrup}`"
              :style="{ height: 'calc(100%/10)' }"
              :class="[i % 2 === 1 ? 'bg-slate-100' : 'bg-white', 'relative overflow-hidden']"
            >
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center text-sm text-slate-500">{{ row.displayIndex }}</div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center text-lg font-black" style="color:#003527">{{ row.idGrup }}</div>
              </td>
              <td class="capitalize py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center text-lg font-bold text-slate-800">{{ row.animalName }}</div>
              </td>
              <td class="text-left px-4 font-bold tracking-wide truncate py-0.5">
                <div class="animate-text-reveal w-full truncate text-left px-2 text-lg text-slate-800">{{ row.owner }}</div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['status-pill', statusClass(row.s1)]">
                    <i :class="statusIcon(row.s1)"></i>{{ row.s1 }}
                  </span>
                </div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['status-pill', statusClass(row.s2)]">
                    <i :class="statusIcon(row.s2)"></i>{{ row.s2 }}
                  </span>
                </div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['status-pill', statusClass(row.s3)]">
                    <i :class="statusIcon(row.s3)"></i>{{ row.s3 }}
                  </span>
                </div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['status-pill', statusClass(row.s4)]">
                    <i :class="statusIcon(row.s4)"></i>{{ row.s4 }}
                  </span>
                </div>
              </td>
              <!-- Skor column -->
              <td class="text-center px-3 py-0.5">
                <div class="animate-text-reveal w-full flex flex-col items-center justify-center gap-1">
                  <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div class="h-1.5 rounded-full transition-all duration-700 score-bar-fill"
                      :style="{ width: `${Math.round(([row.s1, row.s2, row.s3, row.s4].filter(s => s === 'Selesai' || s === 'Diterima').length / 4) * 100)}%` }">
                    </div>
                  </div>
                  <span class="text-xs font-black" style="color:#404944">
                    {{ [row.s1, row.s2, row.s3, row.s4].filter(s => s === 'Selesai' || s === 'Diterima').length }}/4
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── BOTTOM PANELS ── -->
      <div class="mon-bottom-row">

        <!-- Summary panel -->
        <div class="mon-panel w-1/4">
          <div class="mon-panel-header">RINGKASAN TOTAL HEWAN</div>
          <div class="flex p-3 items-center justify-between h-full">
            <div class="text-center w-1/2">
              <div class="text-6xl font-black leading-none" style="color:#003527">{{ totalHewan }}</div>
              <div class="text-xs font-black text-gray-500 mt-1 tracking-wide">TOTAL GRUP QURBAN</div>
              <div class="flex justify-center gap-3 mt-1.5">
                <div class="text-center">
                  <div class="text-xl font-black text-step-blue">{{ totalSapi }}</div>
                  <div class="text-xs font-bold text-gray-400 tracking-wide">SAPI</div>
                </div>
                <div class="text-center">
                  <div class="text-xl font-black text-step-green">{{ totalKambingDomba }}</div>
                  <div class="text-xs font-bold text-gray-400 tracking-wide">DOMBA / KAMBING</div>
                </div>
              </div>
            </div>
            <div class="w-1/2 flex flex-col gap-1.5 font-bold text-base border-l-2 border-slate-200 pl-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-black text-gray-500">SELESAI</span>
                <span class="text-2xl font-black" style="color:#006a61">{{ summarySelesai }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-black text-gray-500">PROSES</span>
                <span class="text-2xl font-black" style="color:#D97706">{{ summaryProses }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-black text-gray-500">BELUM</span>
                <span class="text-2xl font-black" style="color:#EF4444">{{ summaryBelum }}</span>
              </div>
              <div class="flex items-center justify-between mt-1 pt-1 border-t border-slate-200">
                <span class="text-xs font-black text-gray-500">SKOR GLOBAL</span>
                <span class="text-base font-black" style="color:#003527">{{ totalScore }}/{{ maxTotalScore }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Progress circles panel -->
        <div class="mon-panel flex-grow relative">
          <div class="mon-panel-header">PROGRESS SETIAP TAHAP</div>
          <div class="flex justify-around items-center h-full pt-1 pb-5">
            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-blue font-black text-sm tracking-wide mb-1">1. KEDATANGAN</div>
              <div class="progress-circle mb-1" :style="`background: conic-gradient(#2b78e4 ${progKedatangan.pct}%, #e2e8f0 0); color: #2b78e4;`">
                <span>{{ progKedatangan.pct }}%</span>
              </div>
              <div class="font-black text-lg flex items-center gap-1 mt-1" style="color:#003527">
                <i class="fas fa-truck text-step-blue text-xs"></i> {{ progKedatangan.frac }}
              </div>
            </div>
            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-green font-black text-sm tracking-wide mb-1">2. SEMBELIHAN</div>
              <div class="progress-circle mb-1" :style="`background: conic-gradient(#27a844 ${progSembelihan.pct}%, #e2e8f0 0); color: #27a844;`">
                <span>{{ progSembelihan.pct }}%</span>
              </div>
              <div class="font-black text-lg flex items-center gap-1 mt-1" style="color:#003527">
                <i class="fas fa-utensils text-step-green text-xs"></i> {{ progSembelihan.frac }}
              </div>
            </div>
            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-orange font-black text-sm tracking-wide mb-1">3. PENGULITAN</div>
              <div class="progress-circle mb-1" :style="`background: conic-gradient(#fd7e14 ${progPengulitan.pct}%, #e2e8f0 0); color: #fd7e14;`">
                <span>{{ progPengulitan.pct }}%</span>
              </div>
              <div class="font-black text-lg flex items-center gap-1 mt-1" style="color:#003527">
                <i class="fas fa-scroll text-step-orange text-xs"></i> {{ progPengulitan.frac }}
              </div>
            </div>
            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-purple font-black text-sm tracking-wide mb-1">4. SIAP DISTRIBUSI</div>
              <div class="progress-circle mb-1" :style="`background: conic-gradient(#6f42c1 ${progPengemasan.pct}%, #e2e8f0 0); color: #6f42c1;`">
                <span>{{ progPengemasan.pct }}%</span>
              </div>
              <div class="font-black text-lg flex items-center gap-1 mt-1" style="color:#003527">
                <i class="fas fa-box-open text-step-purple text-xs"></i> {{ progPengemasan.frac }}
              </div>
            </div>
          </div>
          <div class="absolute bottom-1 left-0 right-0 text-center text-xs italic font-bold tracking-wide" style="color:#bfc9c3">
            *Data akan otomatis ter-update sesuai perkembangan di lapangan,<br>
            bila merasa namanya tidak ada disini bisa hubungi Tim Qurban AhsanTV
          </div>
        </div>

        <!-- Legend / page indicator panel -->
        <div class="mon-panel w-1/5">
          <div class="mon-panel-header">KETERANGAN STATUS</div>
          <div class="p-3 flex flex-col gap-3 justify-center h-full">
            <div class="flex items-center gap-3">
              <i class="fas fa-check-circle text-2xl shrink-0" style="color:#16A34A"></i>
              <span class="font-bold text-slate-700 text-base">Selesai / Diterima</span>
            </div>
            <div class="flex items-center gap-3">
              <i class="fas fa-clock text-2xl shrink-0" style="color:#D97706"></i>
              <span class="font-bold text-slate-700 text-base">Sedang Proses</span>
            </div>
            <div class="flex items-center gap-3">
              <i class="fas fa-times-circle text-2xl shrink-0" style="color:#EF4444"></i>
              <span class="font-bold text-slate-700 text-base">Belum Dimulai</span>
            </div>
            <div class="mt-1 pt-2 border-t border-slate-200 flex items-center gap-2">
              <i class="fas fa-tv text-base shrink-0" style="color:#003527"></i>
              <span class="text-sm font-black text-slate-600">
                HAL <span class="text-xl" style="color:#003527">{{ activePage }}</span>
                <span class="text-xs text-slate-400 ml-1">/ {{ totalPages }}</span>
              </span>
            </div>
            <div class="mt-1 pt-1 border-t border-slate-200 flex items-center gap-2">
              <i :class="['text-base shrink-0', isSyncing ? 'fas fa-circle' : 'fas fa-circle-notch fa-spin']"
                 :style="isSyncing ? 'color:#006a61' : 'color:#D97706'"></i>
              <span class="text-xs font-black" :style="isSyncing ? 'color:#006a61' : 'color:#D97706'">
                {{ isSyncing ? 'Realtime Live' : 'Syncing...' }}
              </span>
            </div>
          </div>
        </div>

      </div>

      <!-- ── FOOTER ── -->
      <div class="mon-footer">
        <div class="flex items-center gap-4 text-xl font-medium">
          <i class="fas fa-book-open text-xl" style="color:#D97706"></i>
          <span class="italic text-base font-semibold">
            "Maka laksanakanlah shalat karena Tuhanmu; dan berkurbanlah."
            <span class="text-sm ml-2 font-normal" style="color:#80bea6">(QS. Al-Kautsar: 2)</span>
          </span>
        </div>
        <div class="text-right leading-tight text-sm font-bold">
          <div>Terima kasih atas partisipasi dan kepercayaannya.</div>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
/* ── Reset ─────────────────────────────────────────────────────────────────── */
html, body {
  width: 100% !important; height: 100% !important;
  margin: 0 !important; padding: 0 !important; overflow: hidden !important;
  font-family: 'Inter', sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
#viewport-wrapper { width: 100vw !important; height: 100vh !important; overflow: hidden !important; }

/* ── Root shell ─────────────────────────────────────────────────────────────── */
.dashboard-container {
  width: 100vw; height: 100vh; background: #ffffff;
  overflow: hidden; display: flex; flex-direction: column;
  border: 12px solid #003527; /* primary */
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.mon-header {
  flex-shrink: 0;
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 12px 24px 8px;
  border-bottom: 4px solid #003527; /* primary */
}
.mon-date-badge {
  background-color: #003527; color: #ffffff;
  padding: 6px 32px; border-radius: 9999px;
  display: inline-flex; align-items: center; gap: 8px;
  font-weight: 600; font-size: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.logo-img-wrapper { width: 237px; height: 130px; overflow: hidden; flex-shrink: 0; }
.logo-img-wrapper img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }

/* ── Date/time box ──────────────────────────────────────────────────────────── */
#dt-box {
  border: 2px solid #003527; border-radius: 0.5rem; overflow: hidden;
  width: 240px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); background: white;
}
#dt-box .dt-header {
  background: #003527; color: #ffffff; text-align: center;
  padding: 5px 0; font-weight: 700; letter-spacing: .12em; font-size: 0.8rem;
}
#dt-box .dt-body { padding: 10px 14px; }
#dt-box .dt-date-row {
  display: flex; align-items: flex-start; gap: 10px;
  margin-bottom: 8px; color: #003527; font-weight: 600;
}
#dt-box .dt-date-row i { font-size: 1.5rem; margin-top: 2px; }
#dt-box .dt-masehi { font-size: 1.05rem; line-height: 1.3; }
#dt-box .dt-hijri  { font-size: 0.8rem; opacity: .75; font-weight: 400; }
#dt-box .dt-time-row {
  border-top: 1px solid #E2E8F0; padding-top: 8px;
  display: flex; align-items: center; gap: 10px;
  color: #003527; font-weight: 700; font-size: 1.25rem;
}

/* ── Step-card row ──────────────────────────────────────────────────────────── */
.mon-step-row {
  flex-shrink: 0;
  display: flex; align-items: center;
  padding: 10px 24px;
  background-color: #f0f4f8; /* surface-container-low */
  border-bottom: 2px solid #E2E8F0; /* border-subtle */
  height: 110px;
}
.step-card { position: relative; }
.step-arrow {
  position: absolute; right: -24px; top: 50%; transform: translateY(-50%);
  width: 0; height: 0;
  border-top: 18px solid transparent; border-bottom: 18px solid transparent;
  border-left: 18px solid #bfc9c3; /* outline-variant */
  z-index: 10;
}

/* Step accent colours (kept as functional identifiers) */
.bg-step-blue  { background-color: #2b78e4; }
.bg-step-green { background-color: #16A34A; }
.bg-step-orange{ background-color: #D97706; }
.bg-step-purple{ background-color: #6f42c1; }
.text-step-blue  { color: #2b78e4; }
.text-step-green { color: #16A34A; }
.text-step-orange{ color: #D97706; }
.text-step-purple{ color: #6f42c1; }

/* ── Table ──────────────────────────────────────────────────────────────────── */
.qurban-table th {
  background-color: #003527; /* primary */
  color: #ffffff; font-weight: 700; text-transform: uppercase;
  font-size: 1.1rem; padding: 1vh 8px;
  border: 2px solid #064e3b; /* primary-container */
  text-align: center; vertical-align: middle;
}
/* Phase-specific header accent tints */
.th-kedatangan { background-color: #2b78e4 !important; border-color: #1a5fc4 !important; }
.th-sembelihan  { background-color: #16A34A !important; border-color: #15803d !important; }
.th-pengulitan  { background-color: #D97706 !important; border-color: #b45309 !important; }
.th-distribusi  { background-color: #6f42c1 !important; border-color: #5a3297 !important; }
.th-skor        { background-color: #2c3134 !important; border-color: #171c1f !important; }

.qurban-table td {
  padding: 0.2vh 4px !important;
  border: 2px solid #E2E8F0; /* border-subtle */
  text-align: center; vertical-align: middle;
  font-size: 1.3rem; font-weight: 700; color: #171c1f;
  white-space: nowrap;
}
.qurban-table tr:nth-child(even) { background-color: #f0f4f8; } /* surface-container-low */

/* ── Status pills (design.md chips) ────────────────────────────────────────── */
.status-pill {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 4px 14px; font-size: 1.1rem; font-weight: 700;
  border-radius: 9999px; white-space: nowrap; letter-spacing: 0.02em;
}
.pill-selesai { background-color: #DCFCE7; color: #16A34A; border: 1.5px solid rgba(22,163,74,0.35); }
.pill-proses  { background-color: #FEF3C7; color: #D97706; border: 1.5px solid rgba(245,158,11,0.35);
  animation: proses-glow 2s ease-in-out infinite; }
.pill-belum   { background-color: #FEE2E2; color: #EF4444; border: 1.5px solid rgba(239,68,68,0.35); }
@keyframes proses-glow {
  0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
  50%      { box-shadow: 0 0 0 4px rgba(245,158,11,0.15); }
}

/* ── Score bar fill ─────────────────────────────────────────────────────────── */
.score-bar-fill {
  background: linear-gradient(90deg, #006a61, #86f2e4); /* secondary → secondary-container */
}

/* ── Bottom panels ──────────────────────────────────────────────────────────── */
.mon-bottom-row {
  flex-shrink: 0; display: flex; gap: 12px;
  padding: 10px 24px; height: 260px;
  background-color: #f6fafe; /* surface */
  border-top: 2px solid #E2E8F0;
}
.mon-panel {
  border: 2px solid #003527; border-radius: 1rem;
  display: flex; flex-direction: column;
  background: #ffffff; overflow: hidden;
  box-shadow: 0px 4px 6px -1px rgba(0,0,0,0.05);
}
.mon-panel-header {
  background: #003527; color: #ffffff;
  text-align: center; padding: 6px 0;
  font-weight: 800; font-size: 0.9rem;
  text-transform: uppercase; letter-spacing: 0.08em;
}

/* ── Progress circle ────────────────────────────────────────────────────────── */
.progress-circle {
  position: relative; width: 110px; height: 110px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 1.8rem; margin: 0 auto;
}
.progress-circle::before {
  content: ''; position: absolute; inset: 8px;
  border-radius: 50%; background: white;
}
.progress-circle span { position: relative; z-index: 1; }

/* ── Footer ─────────────────────────────────────────────────────────────────── */
.mon-footer {
  flex-shrink: 0;
  background-color: #022C22; /* sidebar-dark */
  color: #ffffff; padding: 8px 24px;
  display: flex; justify-content: space-between; align-items: center;
}

/* ── Shimmer / reveal animations ────────────────────────────────────────────── */
.animate-shimmer { position: relative; overflow: hidden; }
.animate-shimmer::after {
  content: ""; position: absolute; inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg,
    rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 20%,
    rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.3) 80%,
    rgba(255,255,255,0) 100%);
  animation: shimmerSweep 0.9s cubic-bezier(0.25,1,0.5,1) forwards;
  pointer-events: none; z-index: 5;
}
.animate-text-reveal { opacity: 0; animation: textReveal 0.7s cubic-bezier(0.25,1,0.5,1) 0.4s forwards; }
tbody:not(.animate-shimmer) .animate-text-reveal { opacity: 1; animation: none; }

@keyframes shimmerSweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(110%); }
}
@keyframes textReveal {
  0%   { opacity: 0; transform: translateY(6px); filter: blur(3px); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0); }
}

/* ── Scrollbar ──────────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: #f0f4f8; }
::-webkit-scrollbar-thumb { background: #bfc9c3; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #707974; }
</style>