<script setup lang="ts">
// ./pages/admin.vue
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue';
import * as XLSX from 'xlsx';
import { useQurbanRealtime, useActivityLog, use12ValueScore } from '@/composables/useQurbanEngine';
import type { GrupHewan, Database, ActivityLog } from '@/composables/useQurbanEngine';

// ─── Route guard — requires admin-auth middleware ────────────────────────────
definePageMeta({ middleware: 'admin-auth' });

useHead({
  title: 'Qurban Admin | Dashboard',
  meta: [
    { name: 'theme-color', content: '#003527' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css' },
  ],
});

// ─── Types ────────────────────────────────────────────────────────────────────
type Fase = 'kedatangan' | 'sembelihan' | 'pengulitan' | 'pengemasan';

// ─── Constants ────────────────────────────────────────────────────────────────
const supabase      = useSupabaseClient<Database>();
const ROWS_PER_PAGE = 10;
const AUTO_INTERVAL = 6;

const STATUS_COLUMNS = [
  { field: 'status_kedatangan', label: 'KEDATANGAN',  options: ['Belum', 'Diterima'] },
  { field: 'status_sembelihan', label: 'SEMBELIHAN',  options: ['Belum', 'Selesai']  },
  { field: 'status_pengulitan', label: 'PENGULITAN',  options: ['Belum', 'Proses', 'Selesai'] },
  { field: 'status_pengemasan', label: 'DISTRIBUSI',  options: ['Belum', 'Proses', 'Selesai'] },
];

const JENIS_OPTIONS: string[] = ['Sapi', 'Kambing', 'Domba'];

const FASE_MAP: Record<string, Fase> = {
  status_kedatangan: 'kedatangan',
  status_sembelihan: 'sembelihan',
  status_pengulitan: 'pengulitan',
  status_pengemasan: 'pengemasan',
};

// ─── Activity Log ─────────────────────────────────────────────────────────────
const {
  liveLogs, isLoadingHistory,
  subscribe: subscribeLogs, unsubscribe: unsubscribeLogs,
  clearView, loadRecentHistory, insertLog,
} = useActivityLog();

const alfLogs      = computed<readonly ActivityLog[]>(() => liveLogs.value);
const alfIsLoading = computed<boolean>(() => isLoadingHistory.value);

const isPaused = ref(false);
const feedEl   = ref<HTMLElement | null>(null);
let _userScrollTimeout: ReturnType<typeof setTimeout> | null = null;

function onFeedScroll(): void {
  if (!feedEl.value) return;
  if (feedEl.value.scrollTop > 32) isPaused.value = true;
  if (_userScrollTimeout !== null) clearTimeout(_userScrollTimeout);
  _userScrollTimeout = setTimeout(() => {
    if (feedEl.value && feedEl.value.scrollTop <= 4) isPaused.value = false;
  }, 500);
}

watch(() => alfLogs.value.length, async () => {
  if (isPaused.value || !feedEl.value) return;
  await nextTick();
  feedEl.value.scrollTop = 0;
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusColor(status: string): string {
  if (status === 'Selesai' || status === 'Diterima') return 'log-status-selesai';
  if (status === 'Proses') return 'log-status-proses';
  return 'log-status-belum';
}

function sourceLabel(src: string): string {
  if (src === 'qr_scan')    return 'PWA';
  if (src === 'auto_timer') return 'AUTO';
  return 'ADMIN';
}

function sourceClass(src: string): string {
  if (src === 'qr_scan')    return 'badge-pwa';
  if (src === 'auto_timer') return 'badge-auto';
  return 'badge-admin';
}

function faseLabel(fase: string): string {
  const map: Record<string, string> = {
    kedatangan: 'KEDATANGAN', sembelihan: 'SEMBELIHAN',
    pengulitan: 'PENGULITAN', pengemasan: 'DISTRIBUSI',
  };
  return map[fase] ?? fase.toUpperCase();
}

function faseClass(fase: string): string {
  const map: Record<string, string> = {
    kedatangan: 'fase-kedatangan', sembelihan: 'fase-sembelihan',
    pengulitan: 'fase-pengulitan', pengemasan: 'fase-distribusi',
  };
  return map[fase] ?? 'fase-default';
}

const entryCount    = computed<number>(() => alfLogs.value.length);
const isAtCapacity  = computed<boolean>(() => alfLogs.value.length >= 100);

// ─── Data ─────────────────────────────────────────────────────────────────────
const tableKey = ref(0);

const { data: dataGrup, refresh } = await useAsyncData('admin_grup_hewan', async () => {
  const { data, error } = await supabase
    .from('grup_hewan')
    .select('*, sohibul_qurban(*)')
    .order('id_grup', { ascending: true });
  if (error) { console.error('[Admin] Initial fetch error:', error); return [] as GrupHewan[]; }
  return (data ?? []) as GrupHewan[];
});

const scoreInput = computed<GrupHewan[]>(() => dataGrup.value ?? []);
const { globalPercentage, phaseMetrics, totalScore, maxTotalScore } = use12ValueScore(scoreInput);
const { connect: connectRealtime, disconnect: disconnectRealtime, isSyncing } = useQurbanRealtime(dataGrup, {
  channelSuffix: 'admin',
  onInsert: () => refresh(),
  onConnectionLost: () => refresh(),
});

// ─── Device detection ─────────────────────────────────────────────────────────
const isMobileDevice = ref(false);

function detectDevice(): void {
  if (typeof window === 'undefined') return;
  isMobileDevice.value = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ─── TV Page sync ─────────────────────────────────────────────────────────────
const activePage  = ref(1);
const countdown   = ref(AUTO_INTERVAL);
let masterTimer: ReturnType<typeof setInterval> | null = null;

const pageSyncChannel = supabase.channel('page-sync-channel');

function broadcastPageChanged(page: number): void {
  pageSyncChannel.send({ type: 'broadcast', event: 'PAGE_CHANGED', payload: { page } });
}
function broadcastManualPageChange(page: number): void {
  pageSyncChannel.send({ type: 'broadcast', event: 'MANUAL_PAGE_CHANGE', payload: { page } });
}
function broadcastHiddenGroups(): void {
  const total  = dataGrup.value?.length ?? 0;
  const hidden = hiddenGroupIds.value.length;
  pageSyncChannel.send({
    type: 'broadcast', event: 'update-hidden-groups',
    payload: { hiddenIds: hiddenGroupIds.value, totalVisible: total - hidden, totalGroups: total },
  });
}
function triggerRemoteReload(): void {
  pageSyncChannel.send({ type: 'broadcast', event: 'remote-reload', payload: { ts: Date.now() } });
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────
function _readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function _writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, value); } catch { /* noop */ }
}

// ─── Hidden groups ────────────────────────────────────────────────────────────
const hiddenGroupIds = ref<string[]>([]);

function loadHiddenGroupsFromStorage(): void {
  const raw = _readLocalStorage('qurban_hidden_group_ids');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) hiddenGroupIds.value = parsed.map(String);
  } catch { console.warn('[Admin] Could not parse qurban_hidden_group_ids from localStorage.'); }
}

function toggleHideGroup(idGrup: string): void {
  const id  = String(idGrup);
  const idx = hiddenGroupIds.value.indexOf(id);
  if (idx !== -1) hiddenGroupIds.value.splice(idx, 1);
  else hiddenGroupIds.value.push(id);
  _writeLocalStorage('qurban_hidden_group_ids', JSON.stringify(hiddenGroupIds.value));
  broadcastHiddenGroups();
}

function clearAllHidden(): void {
  hiddenGroupIds.value = [];
  _writeLocalStorage('qurban_hidden_group_ids', JSON.stringify([]));
  broadcastHiddenGroups();
}

function isGroupHidden(idGrup: string): boolean {
  return hiddenGroupIds.value.includes(String(idGrup));
}

// ─── TV pagination (chunked by grup, ROWS_PER_PAGE = 10) ─────────────────────
// Mirrors index.vue exactly: 1 grup = 1 TV row. 21 grups → 3 pages.
// totalPages drives the eg-page-btn count rendered in the control bar.
// The admin table itself shows all filteredRows untruncated (scrollable).
const chunkedGrup = computed<GrupHewan[][]>(() => {
  const visible = (dataGrup.value ?? []).filter(
    (g) => !hiddenGroupIds.value.includes(String(g.id_grup ?? ''))
  );
  const pages: GrupHewan[][] = [];
  for (let i = 0; i < visible.length; i += ROWS_PER_PAGE) {
    pages.push(visible.slice(i, i + ROWS_PER_PAGE));
  }
  return pages.length > 0 ? pages : [[]];
});

const totalPages = computed<number>(() => chunkedGrup.value.length || 1);

watch(totalPages, (newTotal) => {
  if (activePage.value > newTotal) activePage.value = Math.max(1, newTotal);
});

function setActivePage(p: number): void {
  const target = Math.max(1, Math.min(p, totalPages.value));
  if (isMobileDevice.value) {
    activePage.value = target;
    broadcastManualPageChange(target);
  } else {
    activePage.value = target;
    countdown.value  = AUTO_INTERVAL;
    restartMasterInterval();
    broadcastPageChanged(target);
  }
}

function startMasterInterval(): void {
  if (isMobileDevice.value) return;
  if (masterTimer !== null) return;
  masterTimer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      activePage.value = activePage.value >= totalPages.value ? 1 : activePage.value + 1;
      broadcastPageChanged(activePage.value);
      countdown.value = AUTO_INTERVAL;
    }
  }, 1000);
}
function stopMasterInterval(): void {
  if (masterTimer !== null) { clearInterval(masterTimer); masterTimer = null; }
}
function restartMasterInterval(): void {
  stopMasterInterval();
  countdown.value = AUTO_INTERVAL;
  startMasterInterval();
}

// ─── Search & filter ──────────────────────────────────────────────────────────
const searchQuery = ref('');
const filterState = ref<{
  jenisHewan: string[]; kedatangan: string[]; sembelihan: string[];
  pengulitan: string[]; pengemasan: string[];
}>({ jenisHewan: [], kedatangan: [], sembelihan: [], pengulitan: [], pengemasan: [] });

const filteredRows = computed<GrupHewan[]>(() => {
  if (!dataGrup.value) return [];
  let rows: GrupHewan[] = dataGrup.value;
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      r.id_grup?.toLowerCase().includes(q) ||
      r.jenis_hewan?.toLowerCase().includes(q) ||
      r.label_tampilan?.toLowerCase().includes(q) ||
      r.sohibul_qurban?.some((s: { nama?: string }) => s.nama?.toLowerCase().includes(q))
    );
  }
  if (filterState.value.jenisHewan.length) rows = rows.filter((r) => filterState.value.jenisHewan.includes(r.jenis_hewan ?? ''));
  if (filterState.value.kedatangan.length) rows = rows.filter((r) => filterState.value.kedatangan.includes(r.status_kedatangan ?? 'Belum'));
  if (filterState.value.sembelihan.length) rows = rows.filter((r) => filterState.value.sembelihan.includes(r.status_sembelihan ?? 'Belum'));
  if (filterState.value.pengulitan.length) rows = rows.filter((r) => filterState.value.pengulitan.includes(r.status_pengulitan ?? 'Belum'));
  if (filterState.value.pengemasan.length) rows = rows.filter((r) => filterState.value.pengemasan.includes(r.status_pengemasan ?? 'Belum'));
  return rows;
});

const filteredCount = computed<number>(() => filteredRows.value.length);

function resetFilters(): void {
  filterState.value = { jenisHewan: [], kedatangan: [], sembelihan: [], pengulitan: [], pengemasan: [] };
  searchQuery.value = '';
}

function applyQuickFilter(type: 'all' | 'belum' | 'proses' | 'selesai'): void {
  switch (type) {
    case 'all':    resetFilters(); break;
    case 'belum':  filterState.value = { jenisHewan: [], kedatangan: ['Belum'], sembelihan: ['Belum'], pengulitan: ['Belum'], pengemasan: ['Belum'] }; break;
    case 'proses': filterState.value = { jenisHewan: [], kedatangan: [], sembelihan: [], pengulitan: ['Proses'], pengemasan: ['Proses'] }; break;
    case 'selesai':filterState.value = { jenisHewan: [], kedatangan: ['Diterima'], sembelihan: ['Selesai'], pengulitan: ['Selesai'], pengemasan: ['Selesai'] }; break;
  }
}

function toggleFilter(category: keyof typeof filterState.value, value: string): void {
  const arr = filterState.value[category];
  const idx = arr.indexOf(value);
  if (idx !== -1) arr.splice(idx, 1); else arr.push(value);
}

// ─── Phase stats ──────────────────────────────────────────────────────────────
const stats = computed(() => {
  const m = phaseMetrics.value;
  if (!m) return [];
  return [
    { label: 'KEDATANGAN', icon: 'fas fa-truck-ramp-box', ...m.kedatangan },
    { label: 'SEMBELIHAN', icon: 'fas fa-scissors',         ...m.sembelihan },
    { label: 'PENGULITAN', icon: 'fas fa-inbox',       ...m.pengulitan },
    { label: 'DISTRIBUSI', icon: 'fas fa-box-open',       ...m.pengemasan },
  ];
});

//<span class="material-symbols-outlined text-[20px]" style="font-variation-settings:'FILL' 1;">cut</span>
// ─── Status mutation ──────────────────────────────────────────────────────────
const isMutatingId = ref('');

function handleStatusClick(event: MouseEvent, idGrup: string, kolom: string, statusBaru: string): void {
  const btn    = event.currentTarget as HTMLElement;
  const ripple = document.createElement('span');
  ripple.classList.add('btn-ripple');
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width  = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left   = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top    = `${event.clientY - rect.top  - size / 2}px`;
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  updateStatus(idGrup, kolom, statusBaru);
}

async function updateStatus(idGrup: string, kolom: string, statusBaru: string): Promise<void> {
  const lockKey = `${idGrup}:${kolom}`;
  if (isMutatingId.value === lockKey) {
    console.warn(`[Admin] updateStatus blocked — mutation in-flight for ${lockKey}`);
    return;
  }
  isMutatingId.value = lockKey;

  const row = dataGrup.value?.find((r) => String(r.id_grup) === String(idGrup));
  if (!row) { isMutatingId.value = ''; return; }

  const statusLama: string = (row as unknown as Record<string, unknown>)[kolom] as string ?? 'Belum';
  if (statusLama === statusBaru) { isMutatingId.value = ''; return; }

  (row as unknown as Record<string, unknown>)[kolom] = statusBaru;

  try {
    const { error } = await supabase
      .from('grup_hewan')
      .update({ [kolom]: statusBaru, updated_by: 'Admin Dashboard' }) 
      .eq('id_grup', idGrup);

    if (error) {
      console.error('[Admin] updateStatus DB error — rolling back:', error);
      (row as unknown as Record<string, unknown>)[kolom] = statusLama;
      tableKey.value++;
      return;
    }

    await insertLog({
      id_grup:      idGrup,
      actor_id:     'admin-dashboard',
      actor_name:   'Admin Dashboard',
      fase:         FASE_MAP[kolom] ?? 'kedatangan',
      status_lama:  statusLama,
      status_baru:  statusBaru,
      action_source:'manual',
      metadata:     { timestamp_local: new Date().toISOString(), source: 'admin-dashboard', kolom },
    });

    await refresh();
    tableKey.value++;
  } catch (err) {
    console.error('[Admin] updateStatus unexpected error:', err);
    (row as unknown as Record<string, unknown>)[kolom] = statusLama;
    tableKey.value++;
  } finally {
    isMutatingId.value = '';
  }
}

function isMutating(idGrup: string, kolom: string): boolean {
  return isMutatingId.value === `${idGrup}:${kolom}`;
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportToExcel(): void {
  const exportRows: Array<Record<string, unknown>> = [];
  let noUrut = 1;
  const tsCetak = new Date().toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  filteredRows.value.forEach((grup) => {
    const allSohibulNames = (grup.sohibul_qurban ?? [])
      .map((s: { nama?: string }) => s.nama ?? '—').join('; ') || '(Belum Ada Anggota)';
    const baseFields = {
      'ID Hewan':          grup.id_grup ?? '—',
      'Jenis Hewan':       grup.jenis_hewan ?? '—',
      'Label Grup':        grup.label_tampilan ?? '—',
      'Shohibul (Semua)':  allSohibulNames,
      'Status Kedatangan': grup.status_kedatangan ?? 'Belum',
      'Status Sembelih':   grup.status_sembelihan ?? 'Belum',
      'Status Pengulitan': grup.status_pengulitan ?? 'Belum',
      'Status Distribusi': grup.status_pengemasan ?? 'Belum',
      'Timer Aktif':       grup.is_timer_active ? 'YA' : 'TIDAK',
      'QR Code String':    grup.qr_code_string ?? '—',
      'Updated By':        grup.updated_by ?? '—',
      'Dicetak Pada':      tsCetak,
    };
    const sohibulList = grup.sohibul_qurban ?? [];
    if (sohibulList.length === 0) {
      exportRows.push({ No: noUrut++, 'Nama Shohibul Qurban': '(Belum Ada Anggota)', ...baseFields });
    } else {
      sohibulList.forEach((s: { nama?: string }) => {
        exportRows.push({ No: noUrut++, 'Nama Shohibul Qurban': s.nama || '—', ...baseFields });
      });
    }
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = [
    { wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
    { wch: 40 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manifes Shohibul Qurban');
  const tglCetak = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `Manifes_Shohibul_Qurban_${tglCetak}.xlsx`);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function statusPillClass(val: string | null | undefined): string {
  if (val === 'Selesai' || val === 'Diterima') return 'pill-selesai';
  if (val === 'Proses') return 'pill-proses';
  return 'pill-belum';
}

function animalIcon(jenis: string | null | undefined): string {
  const j = (jenis ?? '').toLowerCase();
  if (j === 'sapi')              return 'fas fa-cow';
  if (j === 'kambing' || j === 'domba') return 'fas fa-horse-head';
  return 'fas fa-paw';
}

function rowScore(grup: GrupHewan): number {
  const w: Record<string, number> = { Belum: 0, Proses: 1, Selesai: 3, Diterima: 3 };
  return (
    (w[grup.status_kedatangan ?? 'Belum'] ?? 0) +
    (w[grup.status_sembelihan ?? 'Belum'] ?? 0) +
    (w[grup.status_pengulitan ?? 'Belum'] ?? 0) +
    (w[grup.status_pengemasan ?? 'Belum'] ?? 0)
  );
}

function rowScoreBarWidth(score: number): string {
  return `${Math.round((score / 12) * 100)}%`;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  detectDevice();
  loadHiddenGroupsFromStorage();
  connectRealtime();
  loadRecentHistory().then(() => { subscribeLogs(); });

  pageSyncChannel
    .on('broadcast', { event: 'PAGE_CHANGED' }, (msg) => {
      if (!isMobileDevice.value) return;
      const target = Number(msg?.payload?.page);
      if (!isNaN(target) && target >= 1 && target <= totalPages.value) activePage.value = target;
    })
    .on('broadcast', { event: 'MANUAL_PAGE_CHANGE' }, (msg) => {
      if (isMobileDevice.value) return;
      const target = Number(msg?.payload?.page);
      if (!isNaN(target) && target >= 1 && target <= totalPages.value) {
        activePage.value = target;
        restartMasterInterval();
        broadcastPageChanged(activePage.value);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        startMasterInterval();
        console.info('[Admin] page-sync-channel subscribed. Auto-timer started.');
      }
    });
});

onUnmounted(() => {
  stopMasterInterval();
  disconnectRealtime();
  unsubscribeLogs();
  supabase.removeChannel(pageSyncChannel);
});
</script>

<template>
  <div class="eg-root">

    <!-- ── HEADER ── -->
    <header class="eg-header">
      <div class="eg-header-brand">
        <div class="eg-header-icon"><i class="fas fa-mosque"></i></div>
        <div class="eg-header-title-group">
          <h1 class="eg-header-title">Qurban Admin</h1>
          <span class="eg-header-subtitle">Dashboard Manajemen Hewan Qurban</span>
        </div>
        <span v-if="isSyncing" class="eg-sync-badge eg-sync-live">
          <span class="eg-sync-dot"></span>Realtime
        </span>
        <span v-else class="eg-sync-badge eg-sync-offline">
          <span class="eg-sync-dot"></span>Offline
        </span>
      </div>
      <div class="eg-header-right">
        <span class="eg-device-tag">{{ isMobileDevice ? 'Mobile' : 'Desktop' }}</span>
        <div class="eg-global-score-wrap">
          <span class="eg-global-score-label">Progres Global</span>
          <div class="eg-global-bar-track">
            <div class="eg-global-bar-fill" :style="{ width: globalPercentage + '%' }"></div>
          </div>
          <span class="eg-global-score-pct">{{ globalPercentage }}%</span>
        </div>
      </div>
    </header>

    <!-- ── PHASE DECK ── -->
    <section class="eg-phase-deck">
      <div v-for="(stat, idx) in stats" :key="stat.label" class="eg-phase-card">
        <div class="eg-phase-card-header">
          <div class="eg-phase-icon"><i :class="stat.icon"></i></div>
          <div class="eg-phase-info">
            <span class="eg-phase-label">{{ stat.label }}</span>
            <span class="eg-phase-fraction">{{ stat.selesai }} / {{ (stat.belum + stat.proses + stat.selesai) || 0 }} selesai</span>
          </div>
        </div>
        <div class="eg-phase-chips">
          <span class="eg-phase-chip chip-belum">B: {{ stat.belum }}</span>
          <span v-if="stat.proses > 0" class="eg-phase-chip chip-proses">P: {{ stat.proses }}</span>
          <span class="eg-phase-chip chip-selesai">S: {{ stat.selesai }}</span>
        </div>
        <div class="eg-phase-bar-track">
          <div class="eg-phase-bar-fill"
            :style="{ width: Math.round((stat.selesai / ((stat.belum + stat.proses + stat.selesai) || 1)) * 100) + '%',
                      transitionDelay: (idx * 0.15) + 's' }">
          </div>
        </div>
      </div>

      <!-- Global score card -->
      <div class="eg-global-card">
        <span class="eg-global-card-label">Global Score</span>
        <span class="eg-global-card-pct">{{ globalPercentage }}<span class="eg-global-card-pct-unit">%</span></span>
        <span class="eg-global-card-sub">{{ totalScore }} / {{ maxTotalScore }} pts</span>
        <div class="eg-global-card-bar-track">
          <div class="eg-global-card-bar-fill" :style="{ width: globalPercentage + '%' }"></div>
        </div>
      </div>
    </section>

    <!-- ── CONTROL BAR ── -->
    <div class="eg-control-bar">
      <!-- TV page buttons -->
      <div class="eg-ctrl-group">
        <i class="fas fa-tv eg-ctrl-icon"></i>
        <span class="eg-ctrl-label">TV Hal:</span>
        <button
          v-for="p in totalPages" :key="p"
          class="eg-page-btn"
          :class="p === activePage ? 'eg-page-btn--active' : ''"
          @click="setActivePage(p)"
        >{{ p }}</button>
      </div>

      <!-- Auto-countdown (desktop only) -->
      <div v-if="!isMobileDevice" class="eg-ctrl-group">
        <i class="fas fa-clock eg-ctrl-icon"></i>
        <span class="eg-ctrl-label">Auto: {{ countdown }}s</span>
        <div class="eg-countdown-track">
          <div class="eg-countdown-fill" :style="{ width: ((AUTO_INTERVAL - countdown) / AUTO_INTERVAL * 100) + '%' }"></div>
        </div>
      </div>

      <div class="eg-ctrl-divider"></div>

      <!-- Search -->
      <div class="eg-search-wrap">
        <i class="fas fa-magnifying-glass eg-search-icon"></i>
        <input
          v-model="searchQuery" type="text"
          placeholder="Cari ID, Jenis, Label, atau Nama Sohibul..."
          class="eg-search-input"
        />
      </div>

      <!-- Quick filters -->
      <div class="eg-quick-filters">
        <button
          v-for="q in [{ k: 'all', l: 'Semua' }, { k: 'belum', l: 'Belum' }, { k: 'proses', l: 'Proses' }, { k: 'selesai', l: 'Selesai' }]"
          :key="q.k" class="eg-quick-chip"
          @click="applyQuickFilter(q.k as any)"
        >{{ q.l }}</button>
      </div>

      <!-- Action buttons -->
      <div class="eg-ctrl-actions">
        <button class="eg-btn-secondary" @click="exportToExcel">
          <i class="fas fa-file-excel"></i>Export XLSX
        </button>
        <button class="eg-btn-ghost" @click="resetFilters">
          <i class="fas fa-filter-circle-xmark"></i>Reset Filter
        </button>
        <button class="eg-btn-ghost" @click="triggerRemoteReload">
          <i class="fas fa-rotate"></i>Reload Monitor
        </button>
      </div>
    </div>

    <!-- ── FILTER PANEL ── -->
    <div class="eg-filter-panel">
      <div class="eg-filter-group">
        <span class="eg-filter-label">Jenis:</span>
        <label
          v-for="j in JENIS_OPTIONS" :key="j"
          class="eg-filter-chip"
          :class="filterState.jenisHewan.includes(j) ? 'eg-filter-chip--active' : ''"
        >
          <input type="checkbox" :checked="filterState.jenisHewan.includes(j)" class="eg-filter-checkbox" @change="toggleFilter('jenisHewan', j)" />
          {{ j }}
        </label>
      </div>
      <div class="eg-filter-group">
        <span class="eg-filter-label">Kedatangan:</span>
        <label
          v-for="o in ['Belum', 'Diterima']" :key="o"
          class="eg-filter-chip"
          :class="filterState.kedatangan.includes(o) ? 'eg-filter-chip--active' : ''"
        >
          <input type="checkbox" :checked="filterState.kedatangan.includes(o)" class="eg-filter-checkbox" @change="toggleFilter('kedatangan', o)" />
          {{ o }}
        </label>
      </div>
      <div class="eg-filter-group">
        <span class="eg-filter-label">Sembelihan:</span>
        <label
          v-for="o in ['Belum', 'Selesai']" :key="o"
          class="eg-filter-chip"
          :class="filterState.sembelihan.includes(o) ? 'eg-filter-chip--active' : ''"
        >
          <input type="checkbox" :checked="filterState.sembelihan.includes(o)" class="eg-filter-checkbox" @change="toggleFilter('sembelihan', o)" />
          {{ o }}
        </label>
      </div>
      <div class="eg-filter-group">
        <span class="eg-filter-label">Pengulitan:</span>
        <label
          v-for="o in ['Belum', 'Proses', 'Selesai']" :key="o"
          class="eg-filter-chip"
          :class="filterState.pengulitan.includes(o) ? 'eg-filter-chip--active' : ''"
        >
          <input type="checkbox" :checked="filterState.pengulitan.includes(o)" class="eg-filter-checkbox" @change="toggleFilter('pengulitan', o)" />
          {{ o }}
        </label>
      </div>
      <div class="eg-filter-group">
        <span class="eg-filter-label">Distribusi:</span>
        <label
          v-for="o in ['Belum', 'Proses', 'Selesai']" :key="o"
          class="eg-filter-chip"
          :class="filterState.pengemasan.includes(o) ? 'eg-filter-chip--active' : ''"
        >
          <input type="checkbox" :checked="filterState.pengemasan.includes(o)" class="eg-filter-checkbox" @change="toggleFilter('pengemasan', o)" />
          {{ o }}
        </label>
      </div>
      <div class="eg-filter-count">
        <i class="fas fa-database"></i>
        <span>{{ filteredCount }}</span>
        <span class="eg-filter-count-total"> / {{ dataGrup?.length ?? 0 }} grup</span>
      </div>
    </div>

    <!-- ── WORKSPACE: table + activity log side-by-side ── -->
    <div class="eg-workspace">

      <!-- Admin table (shows all filteredRows, scrollable) -->
      <div class="eg-table-area">
        <div v-if="!dataGrup" class="eg-state-empty">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Memuat data dari Supabase...</span>
        </div>
        <div v-else-if="filteredRows.length === 0" class="eg-state-empty">
          <i class="fas fa-circle-xmark"></i>
          <span>Tidak ada data yang cocok dengan filter aktif.</span>
          <button class="eg-btn-secondary eg-mt-sm" @click="resetFilters">
            <i class="fas fa-filter-circle-xmark"></i>Reset Filter
          </button>
        </div>
        <div v-else class="eg-table-scroll">
          <table :key="tableKey" class="eg-table">
            <thead>
              <tr class="eg-thead-row">
                <th class="eg-th eg-th--no">No</th>
                <th class="eg-th eg-th--id">ID Grup</th>
                <th class="eg-th">Detail Hewan</th>
                <th v-for="col in STATUS_COLUMNS" :key="col.field" class="eg-th eg-th--center">{{ col.label }}</th>
                <th class="eg-th eg-th--meta">Score / Meta</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in filteredRows"
                :key="row.id_grup"
                class="eg-tbody-row"
                :class="[
                  i % 2 === 1 ? 'eg-row--odd' : 'eg-row--even',
                  isMutatingId.startsWith(row.id_grup + ':') ? 'eg-row--mutating' : '',
                ]"
              >
                <td class="eg-td eg-td--no">{{ i + 1 }}</td>

                <!-- ID + hide toggle + sohibul names -->
                <td class="eg-td eg-td--id">
                  <div class="eg-id-row">
                    <span class="eg-id-badge">{{ row.id_grup }}</span>
                    <button
                      class="eg-hide-btn"
                      :class="isGroupHidden(row.id_grup) ? 'eg-hide-btn--hidden' : ''"
                      :title="isGroupHidden(row.id_grup) ? 'Tampilkan di Monitor TV' : 'Sembunyikan dari Monitor TV'"
                      @click="toggleHideGroup(row.id_grup)"
                    >
                      <i :class="isGroupHidden(row.id_grup) ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                    </button>
                  </div>
                  <div class="eg-sohibul-list">
                    <span v-for="s in (row.sohibul_qurban ?? [])" :key="s.id ?? s.nama" class="eg-sohibul-name">{{ s.nama }}</span>
                    <span v-if="!(row.sohibul_qurban?.length)" class="eg-sohibul-empty">—</span>
                  </div>
                </td>

                <!-- Animal detail -->
                <td class="eg-td eg-td--detail">
                  <div class="eg-hewan-row">
                    <i :class="[animalIcon(row.jenis_hewan), 'eg-hewan-icon']"></i>
                    <span class="eg-hewan-jenis">{{ row.jenis_hewan }}</span>
                  </div>
                  <div class="eg-hewan-label">{{ row.label_tampilan ?? '—' }}</div>
                  <div v-if="row.is_timer_active" class="eg-timer-badge">
                    <i class="fas fa-hourglass-half"></i>Timer Aktif
                  </div>
                </td>

                <!-- Status columns -->
                <td v-for="col in STATUS_COLUMNS" :key="col.field" class="eg-td eg-td--status">
                  <div class="eg-status-group">
                    <button
                      v-for="opt in col.options" :key="opt"
                      class="eg-status-btn"
                      :class="[
                        'eg-status-btn--' + opt.toLowerCase(),
                        { 'eg-status-btn--active':   (row as any)[col.field] === opt },
                        { 'eg-status-btn--mutating': isMutating(row.id_grup, col.field) },
                      ]"
                      :disabled="isMutating(row.id_grup, col.field)"
                      @click="handleStatusClick($event, row.id_grup, col.field, opt)"
                    >
                      <i v-if="isMutating(row.id_grup, col.field) && (row as any)[col.field] === opt" class="fas fa-circle-notch fa-spin"></i>
                      {{ opt }}
                    </button>
                  </div>
                </td>

                <!-- Score / Meta -->
                <td class="eg-td eg-td--meta">
                  <div class="eg-score-row">
                    <div class="eg-score-bar-track">
                      <div class="eg-score-bar-fill" :style="{ width: rowScoreBarWidth(rowScore(row)) }"></div>
                    </div>
                    <span class="eg-score-label">{{ rowScore(row) }}/12</span>
                  </div>
                  <div v-if="row.updated_by" class="eg-meta-info">
                    <i class="fas fa-user-pen"></i>{{ row.updated_by }}
                  </div>
                  <div v-if="row.qr_code_string" class="eg-meta-info">
                    <i class="fas fa-qrcode"></i>{{ row.qr_code_string }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="eg-table-footer">
            Menampilkan {{ filteredRows.length }} dari {{ dataGrup?.length ?? 0 }} grup hewan
          </div>
        </div>
      </div>

      <!-- Activity Log Feed -->
      <div class="alf-root">
        <div class="alf-header">
          <div class="alf-header-left">
            <span class="alf-status-dot" :class="alfIsLoading ? 'alf-dot--loading' : 'alf-dot--live'"></span>
            <i class="fas fa-list-check alf-header-icon"></i>
            <span class="alf-title">Log Aktivitas</span>
            <span class="alf-subtitle">audit realtime</span>
          </div>
          <div class="alf-header-right">
            <span v-if="alfIsLoading" class="alf-live-label alf-live-label--loading">Memuat...</span>
            <span v-else class="alf-live-label alf-live-label--live">
              <span class="alf-live-dot"></span>Live
            </span>
            <button
              class="alf-ctrl-btn"
              :class="isPaused ? 'alf-ctrl-btn--active' : ''"
              :title="isPaused ? 'Resume auto-scroll' : 'Pause auto-scroll'"
              @click="isPaused = !isPaused"
            >
              <i :class="isPaused ? 'fas fa-play' : 'fas fa-pause'"></i>
              {{ isPaused ? 'Lanjut' : 'Jeda' }}
            </button>
            <button class="alf-ctrl-btn alf-ctrl-btn--danger" title="Hapus semua entri log dari tampilan" @click="clearView">
              <i class="fas fa-trash-can"></i>Hapus
            </button>
          </div>
        </div>

        <div ref="feedEl" class="alf-body" @scroll="onFeedScroll">
          <!-- Empty -->
          <div v-if="alfLogs.length === 0 && !alfIsLoading" class="alf-empty">
            <i class="fas fa-satellite-dish alf-empty-icon"></i>
            <span class="alf-empty-title">Menunggu aktivitas...</span>
            <span class="alf-empty-sub">Perubahan status akan muncul di sini secara realtime.</span>
          </div>
          <!-- Skeleton -->
          <div v-else-if="alfIsLoading && alfLogs.length === 0" class="alf-skeleton-list">
            <div v-for="n in 5" :key="n" class="alf-skeleton" :style="{ width: (45 + n * 9) + '%', animationDelay: (n * 0.12) + 's' }"></div>
          </div>
          <!-- Log rows -->
          <div
            v-for="(log, i) in alfLogs"
            :key="log.id ?? `log-${i}`"
            class="alf-row"
            :class="{ 'alf-row--even': i % 2 === 0 }"
          >
            <span class="alf-ts">{{ formatTime(log.created_at) }}</span>
            <span class="alf-actor" :title="log.actor_name">{{ log.actor_name }}</span>
            <span class="alf-sep">›</span>
            <span class="alf-id">{{ log.id_grup }}</span>
            <span class="alf-fase-badge" :class="faseClass(log.fase)">{{ faseLabel(log.fase) }}</span>
            <span class="alf-flow">
              <span class="alf-status-old">{{ log.status_lama }}</span>
              <span class="alf-arrow">→</span>
              <span :class="['alf-status-new', statusColor(log.status_baru)]">{{ log.status_baru }}</span>
            </span>
            <span class="alf-source-badge" :class="sourceClass(log.action_source)">{{ sourceLabel(log.action_source) }}</span>
          </div>
        </div>

        <div class="alf-footer">
          <div class="alf-footer-left">
            <span class="alf-footer-text">
              Entri:<span :class="isAtCapacity ? 'alf-footer-text--capacity' : 'alf-footer-text--count'">{{ entryCount }}</span>/100
            </span>
            <span v-if="isAtCapacity" class="alf-footer-text alf-footer-text--warn">
              <i class="fas fa-triangle-exclamation"></i>Buffer penuh
            </span>
          </div>
          <div class="alf-footer-right">
            <span v-if="isPaused" class="alf-footer-text alf-footer-text--paused">
              <i class="fas fa-pause"></i>Scroll dijeda
            </span>
            <span v-else class="alf-footer-text alf-footer-text--auto">
              <i class="fas fa-arrow-up"></i>Auto-scroll aktif
            </span>
          </div>
        </div>
      </div>

    </div>

    <!-- ── FOOTER ── -->
    <footer class="eg-footer">
      <span class="eg-footer-brand">Ahsantv Qurban System</span>
      <span class="eg-footer-sep">·</span>
      <span class="eg-footer-info">Admin Panel v2.0.0</span>
      <span class="eg-footer-sep">·</span>
      <span class="eg-footer-info">Total Grup: {{ dataGrup?.length ?? 0 }}</span>
      <span class="eg-footer-sep">·</span>
      <span class="eg-footer-info">Filter Aktif: {{ filteredCount }}</span>
      <div class="eg-footer-right">
        <span v-if="!isMobileDevice" class="eg-footer-info">TV Hal {{ activePage }} / {{ totalPages }}</span>
        <span v-if="hiddenGroupIds.length > 0" class="eg-footer-hidden">
          <i class="fas fa-eye-slash"></i>{{ hiddenGroupIds.length }} Tersembunyi
        </span>
        <button v-if="hiddenGroupIds.length > 0" class="eg-footer-clear-btn" @click="clearAllHidden">Tampilkan Semua</button>
      </div>
    </footer>

  </div>
</template>

<style>
/* ── Reset / Root ─────────────────────────────────────────────────────────── */
html, body { width:100%; height:100%; margin:0; padding:0; overflow:hidden; background-color:#f0f4f8; }
*, *::before, *::after { box-sizing:border-box; }

.eg-root {
  display:flex; flex-direction:column; height:100vh; overflow:hidden;
  background-color:#f0f4f8;  /* surface-container-low */
  color:#171c1f;             /* on-surface */
  font-family:'Inter',sans-serif; font-size:14px; line-height:20px;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.eg-header {
  display:flex; align-items:center; justify-content:space-between;
  gap:16px; padding:0 32px; height:56px;
  background-color:#022C22;  /* sidebar-dark */
  flex-shrink:0; border-bottom:1px solid #064e3b;
}
.eg-header-brand  { display:flex; align-items:center; gap:12px; min-width:0; }
.eg-header-icon   {
  width:36px; height:36px; border-radius:0.5rem;
  background-color:rgba(149,211,186,0.15); border:1px solid rgba(149,211,186,0.3);
  display:flex; align-items:center; justify-content:center;
  color:#95d3ba; font-size:15px; flex-shrink:0;
}
.eg-header-title-group { display:flex; flex-direction:column; gap:1px; }
.eg-header-title  { font-size:18px; font-weight:600; line-height:28px; color:#fff; margin:0; white-space:nowrap; letter-spacing:-0.01em; }
.eg-header-subtitle { font-size:11px; color:#80bea6; white-space:nowrap; }

.eg-sync-badge { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:9999px; font-size:12px; font-weight:600; }
.eg-sync-live    { background-color:rgba(22,163,74,0.2); color:#86f2e4; border:1px solid rgba(134,242,228,0.3); }
.eg-sync-offline { background-color:rgba(186,26,26,0.2); color:#fca5a5; border:1px solid rgba(252,165,165,0.3); }
.eg-sync-dot { width:7px; height:7px; border-radius:9999px; background-color:currentColor; flex-shrink:0; }
.eg-sync-live .eg-sync-dot { animation:eg-pulse 2s ease-in-out infinite; }
@keyframes eg-pulse { 0%,100%{opacity:1}50%{opacity:0.4} }

.eg-header-right     { display:flex; align-items:center; gap:16px; flex-shrink:0; }
.eg-device-tag       {
  font-size:11px; font-weight:600; color:#80bea6;
  background-color:rgba(149,211,186,0.1); border:1px solid rgba(149,211,186,0.25);
  padding:2px 10px; border-radius:9999px; letter-spacing:0.04em;
}
.eg-global-score-wrap { display:flex; align-items:center; gap:8px; }
.eg-global-score-label { font-size:11px; color:#80bea6; white-space:nowrap; }
.eg-global-bar-track   { width:100px; height:6px; background-color:rgba(149,211,186,0.15); border-radius:9999px; overflow:hidden; }
.eg-global-bar-fill    { height:100%; background:linear-gradient(90deg,#006a61,#86f2e4); border-radius:9999px; transition:width 0.8s ease; }
.eg-global-score-pct   { font-size:14px; font-weight:700; color:#95d3ba; min-width:36px; text-align:right; }

/* ── Phase deck ─────────────────────────────────────────────────────────── */
.eg-phase-deck {
  display:flex; gap:8px; padding:12px 32px;
  background-color:#ffffff; border-bottom:1px solid #E2E8F0; flex-shrink:0;
}
.eg-phase-card {
  flex:1; background-color:#f0f4f8; border:1px solid #E2E8F0;
  border-radius:0.5rem; padding:10px 14px;
  display:flex; flex-direction:column; gap:6px; min-width:0;
}
.eg-phase-card-header { display:flex; align-items:center; gap:10px; }
.eg-phase-icon {
  width:32px; height:32px; border-radius:0.375rem;
  background-color:#064e3b; display:flex; align-items:center; justify-content:center;
  color:#95d3ba; font-size:13px; flex-shrink:0;
}
.eg-phase-info    { display:flex; flex-direction:column; gap:1px; min-width:0; }
.eg-phase-label   { font-size:12px; font-weight:600; color:#003527; letter-spacing:0.05em; line-height:16px; }
.eg-phase-fraction{ font-size:11px; color:#404944; opacity:0.8; }
.eg-phase-chips   { display:flex; gap:4px; }
.eg-phase-chip    { font-size:11px; font-weight:600; padding:1px 8px; border-radius:9999px; border:1px solid transparent; }
.chip-belum   { background-color:#FEE2E2; color:#EF4444; border-color:rgba(239,68,68,0.3); }
.chip-proses  { background-color:#FEF3C7; color:#D97706; border-color:rgba(245,158,11,0.3); }
.chip-selesai { background-color:#DCFCE7; color:#16A34A; border-color:rgba(22,163,74,0.3); }
.eg-phase-bar-track { height:5px; background-color:#dfe3e7; border-radius:9999px; overflow:hidden; }
.eg-phase-bar-fill  { height:100%; background:linear-gradient(90deg,#006a61,#86f2e4); border-radius:9999px; transition:width 0.9s ease-out; }

.eg-global-card {
  width:140px; flex-shrink:0;
  background-color:#003527; border:1px solid #064e3b;
  border-radius:0.5rem; padding:10px 14px;
  display:flex; flex-direction:column; justify-content:center; gap:3px;
}
.eg-global-card-label    { font-size:11px; font-weight:600; color:#80bea6; letter-spacing:0.04em; text-transform:uppercase; }
.eg-global-card-pct      { font-size:30px; font-weight:700; color:#fff; line-height:36px; letter-spacing:-0.02em; }
.eg-global-card-pct-unit { font-size:18px; font-weight:600; color:#95d3ba; }
.eg-global-card-sub      { font-size:11px; color:#80bea6; }
.eg-global-card-bar-track{ height:4px; background-color:rgba(149,211,186,0.15); border-radius:9999px; overflow:hidden; margin-top:4px; }
.eg-global-card-bar-fill { height:100%; background:linear-gradient(90deg,#006a61,#86f2e4); border-radius:9999px; transition:width 0.9s ease; }

/* ── Control bar ─────────────────────────────────────────────────────────── */
.eg-control-bar {
  display:flex; align-items:center; flex-wrap:wrap; gap:8px;
  padding:8px 32px; background-color:#ffffff; border-bottom:1px solid #E2E8F0;
  min-height:48px; flex-shrink:0;
}
.eg-ctrl-group  { display:flex; align-items:center; gap:6px; }
.eg-ctrl-icon   { color:#006a61; font-size:12px; }
.eg-ctrl-label  { font-size:12px; font-weight:600; color:#404944; white-space:nowrap; }
.eg-ctrl-divider{ width:1px; height:24px; background-color:#E2E8F0; margin:0 4px; }

.eg-page-btn {
  width:30px; height:30px; display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:500; font-family:'Inter',sans-serif;
  border:1px solid #bfc9c3; border-radius:0.375rem;
  background-color:transparent; color:#404944; cursor:pointer; transition:all 0.15s ease;
}
.eg-page-btn:hover { border-color:#006a61; color:#006a61; }
.eg-page-btn--active {
  background-color:#003527; border-color:#003527; color:#fff;
  font-weight:600; box-shadow:0 1px 3px rgba(0,53,39,0.25);
}
.eg-countdown-track { width:64px; height:6px; background-color:#eaeef2; border-radius:9999px; overflow:hidden; border:1px solid #E2E8F0; }
.eg-countdown-fill  { height:100%; background:linear-gradient(90deg,#006a61,#86f2e4); border-radius:9999px; transition:width 1s linear; }

.eg-search-wrap  { position:relative; flex:1; max-width:320px; min-width:200px; }
.eg-search-icon  { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#707974; font-size:12px; pointer-events:none; }
.eg-search-input {
  width:100%; background-color:#f0f4f8; border:1px solid #bfc9c3;
  border-radius:0.375rem; color:#171c1f; font-family:'Inter',sans-serif;
  font-size:13px; padding:6px 10px 6px 30px; outline:none;
  transition:border-color 0.15s ease,box-shadow 0.15s ease;
}
.eg-search-input::placeholder { color:#707974; opacity:0.8; }
.eg-search-input:focus { border-color:#006a61; box-shadow:0 0 0 2px rgba(0,106,97,0.12); background-color:#fff; }

.eg-quick-filters { display:flex; align-items:center; gap:4px; }
.eg-quick-chip {
  padding:4px 12px; font-family:'Inter',sans-serif; font-size:12px; font-weight:500;
  border:1px solid #bfc9c3; border-radius:9999px; color:#404944;
  background:transparent; cursor:pointer; transition:all 0.15s ease;
}
.eg-quick-chip:hover { border-color:#006a61; color:#006a61; background-color:rgba(0,106,97,0.06); }

.eg-ctrl-actions { margin-left:auto; display:flex; align-items:center; gap:6px; flex-shrink:0; }
.eg-btn-primary {
  display:inline-flex; align-items:center; gap:6px; padding:7px 16px;
  background-color:#003527; color:#fff; border:none; border-radius:0.375rem;
  font-family:'Inter',sans-serif; font-size:13px; font-weight:600;
  cursor:pointer; transition:all 0.15s ease; white-space:nowrap;
}
.eg-btn-primary:hover { background-color:#064e3b; box-shadow:0 2px 6px rgba(0,53,39,0.2); }
.eg-btn-secondary {
  display:inline-flex; align-items:center; gap:6px; padding:6px 14px;
  background-color:transparent; color:#006a61; border:1px solid #006a61;
  border-radius:0.375rem; font-family:'Inter',sans-serif; font-size:12px; font-weight:600;
  cursor:pointer; transition:all 0.15s ease; white-space:nowrap;
}
.eg-btn-secondary:hover { background-color:rgba(0,106,97,0.08); }
.eg-btn-ghost {
  display:inline-flex; align-items:center; gap:6px; padding:6px 12px;
  background-color:transparent; color:#404944; border:1px solid #E2E8F0;
  border-radius:0.375rem; font-family:'Inter',sans-serif; font-size:12px; font-weight:500;
  cursor:pointer; transition:all 0.15s ease; white-space:nowrap;
}
.eg-btn-ghost:hover { background-color:#eaeef2; border-color:#bfc9c3; color:#171c1f; }
.eg-mt-sm { margin-top:8px; }

/* ── Filter panel ────────────────────────────────────────────────────────── */
.eg-filter-panel {
  display:flex; flex-wrap:wrap; align-items:center; gap:16px;
  padding:6px 32px; background-color:#f6fafe; border-bottom:1px solid #E2E8F0;
  min-height:38px; flex-shrink:0;
}
.eg-filter-group   { display:flex; align-items:center; gap:6px; }
.eg-filter-label   { font-size:11px; font-weight:600; color:#404944; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap; }
.eg-filter-chip    {
  display:inline-flex; align-items:center; gap:5px;
  font-size:12px; font-weight:500; color:#404944; cursor:pointer; user-select:none;
  padding:2px 10px; border:1px solid #bfc9c3; border-radius:9999px;
  transition:all 0.12s ease; background-color:transparent;
}
.eg-filter-chip:hover    { border-color:#006a61; color:#006a61; }
.eg-filter-chip--active  { background-color:#006a61; border-color:#006a61; color:#fff; }
.eg-filter-checkbox      { width:12px; height:12px; accent-color:#006a61; }
.eg-filter-count         { margin-left:auto; display:flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:#006a61; }
.eg-filter-count-total   { color:#707974; font-weight:400; }

/* ── Workspace ───────────────────────────────────────────────────────────── */
.eg-workspace { flex:1; display:flex; min-height:0; overflow:hidden; }
.eg-table-area {
  flex:1; display:flex; flex-direction:column;
  min-width:0; overflow:hidden;
}
.eg-state-empty {
  flex:1; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:8px; font-size:14px; color:#404944; opacity:0.7;
}
.eg-state-empty i { font-size:24px; color:#006a61; }
.eg-table-scroll { flex:1; overflow:auto; padding:0; }
.eg-table-scroll::-webkit-scrollbar       { width:6px; height:6px; }
.eg-table-scroll::-webkit-scrollbar-track { background:#f0f4f8; }
.eg-table-scroll::-webkit-scrollbar-thumb { background:#bfc9c3; border-radius:3px; }
.eg-table-scroll::-webkit-scrollbar-thumb:hover { background:#707974; }

/* ── Table ───────────────────────────────────────────────────────────────── */
.eg-table { border-collapse:collapse; width:100%; min-width:900px; }
.eg-thead-row {
  background-color:#f6fafe; position:sticky; top:0; z-index:5;
  border-bottom:2px solid #E2E8F0;
}
.eg-th {
  padding:9px 12px; font-size:12px; font-weight:600; color:#404944;
  letter-spacing:0.05em; text-transform:uppercase; text-align:left;
  white-space:nowrap; border-bottom:2px solid #bfc9c3;
}
.eg-th--no     { width:48px; text-align:center; }
.eg-th--id     { width:180px; }
.eg-th--meta   { width:140px; }
.eg-th--center { text-align:center; }

.eg-tbody-row { border-bottom:1px solid #E2E8F0; transition:background-color 0.1s ease; }
.eg-row--even { background-color:#ffffff; }
.eg-row--odd  { background-color:#f6fafe; }
.eg-tbody-row:hover { background-color:rgba(0,106,97,0.04); }
.eg-row--mutating { animation:eg-row-mutate 0.6s ease-in-out; }
@keyframes eg-row-mutate {
  0%,100%{ background-color:transparent; }
  50%    { background-color:rgba(134,242,228,0.12); }
}

.eg-td       { padding:10px 12px; font-size:13px; color:#171c1f; vertical-align:middle; }
.eg-td--no   { text-align:center; color:#707974; font-size:12px; width:48px; }
.eg-td--id   { width:180px; }
.eg-td--detail  { min-width:160px; }
.eg-td--status  { text-align:center; vertical-align:middle; }
.eg-td--meta    { width:140px; }

.eg-id-row    { display:flex; align-items:center; gap:6px; }
.eg-id-badge  {
  display:inline-flex; align-items:center; padding:2px 8px;
  border:1px solid #006a61; border-radius:0.25rem;
  background-color:rgba(0,106,97,0.06); color:#003527;
  font-size:12px; font-weight:600; letter-spacing:0.03em;
}
.eg-hide-btn {
  width:22px; height:22px; display:flex; align-items:center; justify-content:center;
  border:1px solid #bfc9c3; border-radius:0.25rem;
  background:transparent; cursor:pointer; color:#707974; font-size:10px;
  transition:all 0.15s ease;
}
.eg-hide-btn:hover      { border-color:#006a61; color:#006a61; }
.eg-hide-btn--hidden    { border-color:#EF4444; color:#EF4444; background-color:rgba(239,68,68,0.06); }
.eg-sohibul-list        { display:flex; flex-direction:column; gap:1px; margin-top:4px; }
.eg-sohibul-name        { font-size:11px; color:#404944; line-height:16px; }
.eg-sohibul-empty       { font-size:11px; color:#707974; opacity:0.6; }

.eg-hewan-row  { display:flex; align-items:center; gap:6px; }
.eg-hewan-icon { color:#006a61; font-size:13px; flex-shrink:0; }
.eg-hewan-jenis{ font-size:13px; font-weight:600; color:#003527; text-transform:capitalize; }
.eg-hewan-label{ font-size:11px; color:#404944; margin-top:2px; opacity:0.8; }
.eg-timer-badge{
  display:inline-flex; align-items:center; gap:4px;
  font-size:10px; font-weight:600; color:#D97706;
  background-color:#FEF3C7; border:1px solid rgba(245,158,11,0.3);
  padding:1px 6px; border-radius:9999px; margin-top:4px;
  animation:eg-timer-pulse 1.8s ease-in-out infinite;
}
@keyframes eg-timer-pulse { 0%,100%{opacity:1}50%{opacity:0.6} }

.eg-status-group { display:inline-flex; gap:3px; flex-wrap:nowrap; }
.eg-status-btn {
  position:relative; overflow:hidden;
  display:inline-flex; align-items:center; justify-content:center; gap:3px;
  border:1px solid #bfc9c3; border-radius:0.25rem;
  background-color:transparent; color:#404944; cursor:pointer;
  font-family:'Inter',sans-serif; font-size:11px; font-weight:500;
  padding:3px 8px; transition:all 0.15s ease; white-space:nowrap;
}
.eg-status-btn:not(:disabled):not(.eg-status-btn--active):hover {
  border-color:#2b6954; color:#2b6954; background-color:rgba(43,105,84,0.05);
}
.eg-status-btn:active   { transform:scale(0.95); }
.eg-status-btn:disabled { cursor:not-allowed; opacity:0.5; }
.eg-status-btn--mutating{ opacity:0.6; cursor:wait; }

/* Active state per design.md chips */
.eg-status-btn--belum.eg-status-btn--active    { background-color:#FEE2E2; color:#EF4444; border-color:#EF4444; font-weight:600; }
.eg-status-btn--proses.eg-status-btn--active   {
  background-color:#FEF3C7; color:#D97706; border-color:#F59E0B; font-weight:600;
  animation:eg-proses-pulse 2s ease-in-out infinite;
}
@keyframes eg-proses-pulse {
  0%,100%{ box-shadow:0 0 0 0 rgba(245,158,11,0); }
  50%    { box-shadow:0 0 0 3px rgba(245,158,11,0.15); }
}
.eg-status-btn--selesai.eg-status-btn--active,
.eg-status-btn--diterima.eg-status-btn--active { background-color:#DCFCE7; color:#16A34A; border-color:#16A34A; font-weight:600; }

.btn-ripple {
  position:absolute; border-radius:50%; transform:scale(0);
  background:rgba(0,106,97,0.18); pointer-events:none;
  animation:eg-ripple 0.52s ease-out forwards;
}
@keyframes eg-ripple { 0%{transform:scale(0);opacity:1}100%{transform:scale(2.8);opacity:0} }

/* Score / meta */
.eg-score-row       { display:flex; align-items:center; gap:6px; }
.eg-score-bar-track { flex:1; height:5px; background-color:#eaeef2; border-radius:9999px; overflow:hidden; }
.eg-score-bar-fill  { height:100%; background:linear-gradient(90deg,#006a61,#86f2e4); border-radius:9999px; transition:width 0.6s ease; }
.eg-score-label     { font-size:11px; font-weight:600; color:#006a61; white-space:nowrap; }
.eg-meta-info       {
  font-size:10px; color:#707974; margin-top:3px; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; max-width:130px;
  display:flex; align-items:center; gap:4px;
}
.eg-table-footer {
  text-align:right; padding:8px 16px 6px; font-size:12px; color:#707974;
  background-color:#f6fafe; border-top:1px solid #E2E8F0;
}

/* ── Activity Log Feed ────────────────────────────────────────────────────── */
.alf-root {
  display:flex; flex-direction:column; width:480px; flex-shrink:0;
  height:100%; overflow:hidden; background-color:#ffffff;
  border-left:1px solid #E2E8F0; font-family:'Inter',sans-serif;
}
.alf-header {
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:8px 14px; background-color:#f6fafe; border-bottom:1px solid #E2E8F0; flex-shrink:0;
}
.alf-header-left  { display:flex; align-items:center; gap:7px; min-width:0; }
.alf-status-dot   { width:7px; height:7px; border-radius:9999px; flex-shrink:0; }
.alf-dot--live    { background-color:#16A34A; box-shadow:0 0 0 2px rgba(22,163,74,0.2); animation:alf-dot-pulse 2s ease-in-out infinite; }
.alf-dot--loading { background-color:#F59E0B; box-shadow:0 0 0 2px rgba(245,158,11,0.2); animation:alf-dot-pulse 0.8s ease-in-out infinite; }
@keyframes alf-dot-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
.alf-header-icon { font-size:11px; color:#006a61; }
.alf-title    { font-size:13px; font-weight:600; color:#003527; white-space:nowrap; letter-spacing:-0.01em; }
.alf-subtitle { font-size:11px; color:#707974; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.alf-header-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }
.alf-live-label {
  display:inline-flex; align-items:center; gap:5px;
  font-size:11px; font-weight:600; padding:2px 8px; border-radius:9999px;
}
.alf-live-label--live    { color:#16A34A; background-color:#DCFCE7; border:1px solid rgba(22,163,74,0.25); }
.alf-live-label--loading { color:#D97706; background-color:#FEF3C7; border:1px solid rgba(245,158,11,0.25); animation:alf-fade 1s ease-in-out infinite; }
@keyframes alf-fade { 0%,100%{opacity:1}50%{opacity:0.5} }
.alf-live-dot { width:6px; height:6px; border-radius:9999px; background-color:currentColor; animation:alf-dot-pulse 2s ease-in-out infinite; }

.alf-ctrl-btn {
  display:inline-flex; align-items:center; gap:4px; padding:3px 9px;
  font-family:'Inter',sans-serif; font-size:11px; font-weight:600;
  border:1px solid #bfc9c3; border-radius:0.375rem;
  background:transparent; color:#404944; cursor:pointer; transition:all 0.15s ease; white-space:nowrap;
}
.alf-ctrl-btn:hover       { border-color:#006a61; color:#006a61; background-color:rgba(0,106,97,0.05); }
.alf-ctrl-btn--active     { background-color:rgba(0,106,97,0.08); border-color:#006a61; color:#006a61; }
.alf-ctrl-btn--danger     { color:#EF4444; border-color:rgba(239,68,68,0.3); }
.alf-ctrl-btn--danger:hover{ background-color:#FEE2E2; border-color:#EF4444; color:#EF4444; }

.alf-body { flex:1; overflow-y:auto; padding:4px 0; }
.alf-body::-webkit-scrollbar       { width:5px; }
.alf-body::-webkit-scrollbar-track { background:#f6fafe; }
.alf-body::-webkit-scrollbar-thumb { background:#bfc9c3; border-radius:3px; }
.alf-body::-webkit-scrollbar-thumb:hover { background:#707974; }

.alf-empty       { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 24px; text-align:center; gap:8px; }
.alf-empty-icon  { font-size:26px; color:#bfc9c3; }
.alf-empty-title { font-size:13px; font-weight:600; color:#404944; }
.alf-empty-sub   { font-size:12px; color:#707974; line-height:18px; }

.alf-skeleton-list { padding:10px 14px; display:flex; flex-direction:column; gap:8px; }
.alf-skeleton {
  height:12px; border-radius:0.25rem;
  background:linear-gradient(90deg,#eaeef2 25%,#dfe3e7 50%,#eaeef2 75%);
  background-size:200% 100%;
  animation:alf-skeleton-shimmer 1.4s infinite ease-in-out;
}
@keyframes alf-skeleton-shimmer { 0%{background-position:200% 0}100%{background-position:-200% 0} }

.alf-row {
  display:flex; align-items:center; gap:5px; padding:5px 14px;
  border-left:2px solid transparent;
  transition:background-color 0.1s ease, border-left-color 0.1s ease;
  flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden;
  scrollbar-width:none;
}
.alf-row::-webkit-scrollbar { display:none; }
.alf-row:hover   { background-color:rgba(0,106,97,0.04); border-left-color:#006a61; }
.alf-row--even   { background-color:#f6fafe; }
.alf-ts          { font-size:11px; color:#707974; flex-shrink:0; white-space:nowrap; font-variant-numeric:tabular-nums; }
.alf-actor       { font-size:11px; font-weight:600; color:#003527; max-width:72px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
.alf-sep         { color:#bfc9c3; font-size:11px; flex-shrink:0; }
.alf-id          { font-size:11px; font-weight:700; color:#006a61; letter-spacing:0.03em; flex-shrink:0; white-space:nowrap; }
.alf-fase-badge  {
  display:inline-flex; align-items:center; padding:1px 6px;
  font-size:10px; font-weight:600; letter-spacing:0.04em;
  border:1px solid; border-radius:0.25rem; flex-shrink:0; white-space:nowrap;
}
.fase-kedatangan { color:#006a61; border-color:rgba(0,106,97,0.35); background-color:rgba(0,106,97,0.07); }
.fase-sembelihan { color:#EF4444; border-color:rgba(239,68,68,0.3); background-color:rgba(239,68,68,0.06); }
.fase-pengulitan { color:#D97706; border-color:rgba(245,158,11,0.3); background-color:rgba(245,158,11,0.06); }
.fase-distribusi { color:#6b342d; border-color:rgba(107,52,45,0.3); background-color:rgba(107,52,45,0.06); }
.fase-default    { color:#404944; border-color:#bfc9c3; background-color:transparent; }

.alf-flow       { display:inline-flex; align-items:center; gap:4px; flex-shrink:0; }
.alf-status-old { font-size:11px; color:#707974; text-decoration:line-through; white-space:nowrap; }
.alf-arrow      { font-size:11px; color:#bfc9c3; }
.alf-status-new { font-size:11px; font-weight:700; white-space:nowrap; }
.log-status-selesai { color:#16A34A; }
.log-status-proses  { color:#D97706; }
.log-status-belum   { color:#EF4444; }

.alf-source-badge {
  display:inline-flex; align-items:center; padding:1px 6px;
  font-size:10px; font-weight:600; letter-spacing:0.04em;
  border:1px solid; border-radius:9999px;
  flex-shrink:0; white-space:nowrap;
}
.badge-pwa   { color:#D97706; border-color:rgba(245,158,11,0.35); background-color:rgba(245,158,11,0.08); }
.badge-auto  { color:#006a61; border-color:rgba(0,106,97,0.35); background-color:rgba(0,106,97,0.08); }
.badge-admin { color:#404944; border-color:#bfc9c3; background-color:transparent; }

.alf-footer {
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:5px 14px; background-color:#f6fafe; border-top:1px solid #E2E8F0; flex-shrink:0;
}
.alf-footer-left, .alf-footer-right { display:flex; align-items:center; gap:8px; }
.alf-footer-text            { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:#707974; }
.alf-footer-text--count     { font-weight:600; color:#003527; }
.alf-footer-text--capacity  { font-weight:700; color:#EF4444; }
.alf-footer-text--warn      { color:#D97706; animation:alf-fade 1.2s ease-in-out infinite; }
.alf-footer-text--paused    { color:#D97706; font-weight:500; }
.alf-footer-text--auto      { color:#16A34A; font-weight:500; }

/* ── Footer ─────────────────────────────────────────────────────────────── */
.eg-footer {
  display:flex; align-items:center; gap:10px; padding:0 32px; min-height:36px;
  background-color:#022C22; border-top:1px solid #064e3b; flex-shrink:0;
}
.eg-footer-brand  { font-size:12px; font-weight:700; color:#95d3ba; white-space:nowrap; letter-spacing:0.03em; }
.eg-footer-sep    { color:#406355; font-size:12px; }
.eg-footer-info   { font-size:11px; color:#80bea6; white-space:nowrap; }
.eg-footer-hidden { font-size:11px; color:#fca5a5; display:flex; align-items:center; gap:4px; white-space:nowrap; }
.eg-footer-right  { margin-left:auto; display:flex; align-items:center; gap:12px; flex-shrink:0; }
.eg-footer-clear-btn {
  font-family:'Inter',sans-serif; font-size:11px; font-weight:600; color:#95d3ba;
  border:1px solid rgba(149,211,186,0.35); border-radius:9999px;
  background:transparent; padding:2px 10px; cursor:pointer; transition:all 0.15s ease;
}
.eg-footer-clear-btn:hover { background-color:rgba(149,211,186,0.12); border-color:#95d3ba; }

/* ── Scrollbar global ────────────────────────────────────────────────────── */
::-webkit-scrollbar       { width:5px; height:5px; }
::-webkit-scrollbar-track { background:#f0f4f8; }
::-webkit-scrollbar-thumb { background:#bfc9c3; border-radius:3px; }
::-webkit-scrollbar-thumb:hover { background:#707974; }

@media print {
  .eg-root { background:white !important; color:black !important; }
  .eg-header { background:white !important; border-bottom-color:#ccc !important; }
  .eg-header-title, .eg-header-subtitle { color:black !important; }
}
</style>