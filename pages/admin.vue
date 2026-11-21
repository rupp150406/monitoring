<script setup lang="ts">
// ./pages/admin.vue — Qurban Command Center (design: FigCraft "Operasional Qurban 1446 H")
import { ref, reactive, watch, nextTick, computed, onMounted, onUnmounted } from 'vue';
import * as XLSX from 'xlsx';
import logoAhsan from '~/assets/images/ahsan.webp';
import { useQurbanRealtime, useActivityLog, use12ValueScore } from '@/composables/useQurbanEngine';
import type { GrupHewan, Database, ActivityLog } from '@/composables/useQurbanEngine';

// ─── Route guard — requires admin-auth middleware ────────────────────────────
definePageMeta({ middleware: 'admin-auth' });

useHead({
  title: 'Qurban Command Center | Ahsantv',
  htmlAttrs: { style: 'height: 100% !important; overflow: hidden !important;' },
  bodyAttrs: {
    style: 'height: 100% !important; overflow: hidden !important; background-color: #0A0E13 !important; margin: 0 !important; padding: 0 !important;',
  },
  meta: [
    { name: 'theme-color', content: '#0A0E13' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=connected_tv' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap' },
    { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css' },
  ],
});

// ─── Types ────────────────────────────────────────────────────────────────────
type PhaseKey      = 'kedatangan' | 'sembelihan' | 'pengulitan' | 'pengemasan';
type StatusField   = 'status_kedatangan' | 'status_sembelihan' | 'status_pengulitan' | 'status_pengemasan';
type StatusTone    = 'belum' | 'proses' | 'selesai' | 'diterima';

// ─── Constants ────────────────────────────────────────────────────────────────
const supabase      = useSupabaseClient<Database>();
const ROWS_PER_PAGE = 10;
const AUTO_INTERVAL = 6;

const STATUS_COLUMNS: Array<{ field: StatusField; phase: PhaseKey; label: string; options: string[] }> = [
  { field: 'status_kedatangan', phase: 'kedatangan', label: 'KEDATANGAN', options: ['Belum', 'Diterima'] },
  { field: 'status_sembelihan', phase: 'sembelihan', label: 'SEMBELIHAN', options: ['Belum', 'Selesai']  },
  { field: 'status_pengulitan', phase: 'pengulitan', label: 'PENGULITAN', options: ['Belum', 'Proses', 'Selesai'] },
  { field: 'status_pengemasan', phase: 'pengemasan', label: 'DISTRIBUSI', options: ['Belum', 'Proses', 'Selesai'] },
];

const PHASE_FIELDS: Record<PhaseKey, StatusField> = {
  kedatangan: 'status_kedatangan',
  sembelihan: 'status_sembelihan',
  pengulitan: 'status_pengulitan',
  pengemasan: 'status_pengemasan',
};

// Reverse lookup — status column name → process key (used when writing the audit log)
const FASE_MAP: Record<string, PhaseKey> = {
  status_kedatangan: 'kedatangan',
  status_sembelihan: 'sembelihan',
  status_pengulitan: 'pengulitan',
  status_pengemasan: 'pengemasan',
};

// Design palette per process
const PHASE_META: Record<PhaseKey, { title: string; short: string; color: string }> = {
  kedatangan: { title: 'KEDATANGAN', short: 'Kedatangan', color: '#93C5FD' },
  sembelihan: { title: 'SEMBELIHAN', short: 'Sembelihan', color: '#6EE7B7' },
  pengulitan: { title: 'PENGULITAN', short: 'Pengulitan', color: '#FCD34D' },
  pengemasan: { title: 'DISTRIBUSI',  short: 'Distribusi', color: '#C4B5FD' },
};

// Status pill / dropdown tone — one tone per status value
const STATUS_STYLE: Record<StatusTone, { bg: string; text: string; dot: string; hollow: boolean }> = {
  belum:    { bg: '#171E28', text: '#8B98A7', dot: '#4E5A68', hollow: true  },
  proses:   { bg: '#2B2008', text: '#FCD34D', dot: '#FBBF24', hollow: false },
  selesai:  { bg: '#0F2A22', text: '#6EE7B7', dot: '#34D399', hollow: false },
  diterima: { bg: '#0F2A22', text: '#6EE7B7', dot: '#34D399', hollow: false },
};

const JENIS_OPTIONS: string[] = ['Sapi', 'Kambing', 'Domba'];

// Top deck cards — exact colours from the design file
const DECK = [
  { key: 'kedatangan' as PhaseKey, label: '01 · KEDATANGAN', card: '#10253C', accent: '#93C5FD', bar: '#60A5FA', track: '#1B3B5E' },
  { key: 'sembelihan' as PhaseKey, label: '02 · SEMBELIHAN', card: '#0F2D25', accent: '#6EE7B7', bar: '#34D399', track: '#15463A' },
  { key: 'pengulitan' as PhaseKey, label: '03 · PENGULITAN', card: '#33260C', accent: '#FCD34D', bar: '#FBBF24', track: '#4F3A12' },
  { key: 'pengemasan' as PhaseKey, label: '04 · DISTRIBUSI', card: '#271F45', accent: '#C4B5FD', bar: '#A78BFA', track: '#3B2F6B' },
] as const;

// Phase colour used by the audit log headline
const FASE_COLOR: Record<string, string> = {
  kedatangan: '#93C5FD',
  sembelihan: '#6EE7B7',
  pengulitan: '#FBBF24',
  pengemasan: '#C4B5FD',
};

const SCROLLBAR_TABLE =
  '[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#1E2A38] [&::-webkit-scrollbar-thumb:hover]:bg-[#2B3B4C]';

const SCROLLBAR_FEED =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#1E2A38] [&::-webkit-scrollbar-thumb:hover]:bg-[#2B3B4C]';

const RIPPLE_CLASS =
  'pointer-events-none absolute rounded-full bg-white/20 animate-[qc-ripple_0.35s_ease-out_forwards]';

// ─── Toast ────────────────────────────────────────────────────────────────────
const toastMsg     = ref('');
const toastVisible = ref(false);
let _toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string): void {
  toastMsg.value     = msg;
  toastVisible.value = true;
  if (_toastTimer !== null) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastVisible.value = false; }, 2400);
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
const {
  liveLogs, isLoadingHistory,
  subscribe: subscribeLogs, unsubscribe: unsubscribeLogs,
  clearView, loadRecentHistory, insertLog,
} = useActivityLog();

const alfLogs      = computed<readonly ActivityLog[]>(() => liveLogs.value);
const alfIsLoading = computed<boolean>(() => isLoadingHistory.value);
const entryCount   = computed<number>(() => alfLogs.value.length);

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

function faseLabel(fase: string): string {
  const map: Record<string, string> = {
    kedatangan: 'KEDATANGAN', sembelihan: 'SEMBELIHAN',
    pengulitan: 'PENGULITAN', pengemasan: 'DISTRIBUSI',
  };
  return map[fase] ?? fase.toUpperCase();
}

function faseColor(fase: string): string {
  return FASE_COLOR[fase] ?? '#6EE7B7';
}

function statusTone(status: string): StatusTone {
  const s = (status ?? '').toLowerCase();
  if (s === 'selesai') return 'selesai';
  if (s === 'diterima') return 'diterima';
  if (s === 'proses') return 'proses';
  return 'belum';
}

function statusTextColor(status: string): string {
  return STATUS_STYLE[statusTone(status)].text;
}

function pillStyle(status: string) {
  const t = STATUS_STYLE[statusTone(status)];
  return { background: t.bg, color: t.text };
}

function dotStyle(status: string) {
  const t = STATUS_STYLE[statusTone(status)];
  return t.hollow
    ? { background: 'transparent', boxShadow: `inset 0 0 0 2px ${t.dot}` }
    : { background: t.dot };
}

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

// ─── Boot skeleton — shown for at least 1s, even when the fetch is faster ────
const SKELETON_MS = 1000;
const SKELETON_ROWS = 15; // table rows drawn while loading
const SKELETON_LOGS = 15; // audit entries drawn while loading
const skeletonElapsed = ref(false);
let _skeletonTimer: ReturnType<typeof setTimeout> | null = null;

// Still loading while the minimum window is open OR the first dataset
// has not arrived yet — whichever finishes last wins.
const showSkeleton = computed<boolean>(() => !skeletonElapsed.value || dataGrup.value === null);

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
const activePage = ref(1);
const countdown  = ref(AUTO_INTERVAL);
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

function onToggleHide(idGrup: string): void {
  toggleHideGroup(idGrup);
  showToast(isGroupHidden(idGrup)
    ? `${idGrup} disembunyikan dari TV monitor.`
    : `${idGrup} ditampilkan kembali di TV monitor.`);
}

function clearAllHidden(): void {
  hiddenGroupIds.value = [];
  _writeLocalStorage('qurban_hidden_group_ids', JSON.stringify([]));
  broadcastHiddenGroups();
  showToast('Semua kelompok qurban kembali ditampilkan.');
}

function isGroupHidden(idGrup: string): boolean {
  return hiddenGroupIds.value.includes(String(idGrup));
}

// ─── TV pagination (chunked by grup, ROWS_PER_PAGE = 10) ─────────────────────
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

function onPageClick(p: number): void {
  setActivePage(p);
  showToast(`Menampilkan TV Layar Halaman ${activePage.value}`);
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

// Status seeds are keyed per process: AND across processes, OR inside one.
const filterStatus = reactive<Record<PhaseKey, string[]>>({
  kedatangan: [], sembelihan: [], pengulitan: [], pengemasan: [],
});
const filterJenis = ref<string[]>([]);

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

  if (filterJenis.value.length) {
    rows = rows.filter((r) => filterJenis.value.includes(r.jenis_hewan ?? ''));
  }

  for (const phase of Object.keys(PHASE_FIELDS) as PhaseKey[]) {
    const selected = filterStatus[phase];
    if (!selected.length) continue;
    const field = PHASE_FIELDS[phase];
    rows = rows.filter((r) => selected.includes(statusOf(r, field)));
  }

  return rows;
});

const filteredCount = computed<number>(() => filteredRows.value.length);

const hasActiveStatusFilter = computed<boolean>(
  () => (Object.keys(PHASE_FIELDS) as PhaseKey[]).some((p) => filterStatus[p].length > 0)
);

const filterSummary = computed<string>(() => {
  const parts: string[] = [];
  for (const phase of Object.keys(PHASE_FIELDS) as PhaseKey[]) {
    const sel = filterStatus[phase];
    if (sel.length) parts.push(`${PHASE_META[phase].short} · ${sel.join(' / ')}`);
  }
  if (filterJenis.value.length) parts.push(filterJenis.value.join(' / '));
  return parts.length ? parts.join(' · ') : 'Semua proses';
});

const filterOpen = ref(false);

function toggleStatusFilter(field: StatusField, value: string): void {
  const phase = (Object.keys(PHASE_FIELDS) as PhaseKey[]).find((p) => PHASE_FIELDS[p] === field);
  if (!phase) return;
  const arr = filterStatus[phase];
  const idx = arr.indexOf(value);
  if (idx !== -1) arr.splice(idx, 1); else arr.push(value);
}

function toggleJenis(value: string): void {
  const idx = filterJenis.value.indexOf(value);
  if (idx !== -1) filterJenis.value.splice(idx, 1); else filterJenis.value.push(value);
}

function resetStatusFilters(): void {
  for (const p of Object.keys(PHASE_FIELDS) as PhaseKey[]) filterStatus[p].splice(0);
  filterJenis.value = [];
}

function resetFilters(): void {
  resetStatusFilters();
  searchQuery.value = '';
}

function onResetFilters(): void {
  resetFilters();
  filterOpen.value = false;
  showToast('Filter dikembalikan ke default');
}

// ─── Phase stats (top deck) ───────────────────────────────────────────────────
const stats = computed(() => {
  const m = phaseMetrics.value as Record<string, { belum: number; proses: number; selesai: number }> | null;
  return DECK.map((p) => {
    const d     = m?.[p.key] ?? { belum: 0, proses: 0, selesai: 0 };
    const total = d.belum + d.proses + d.selesai;
    return {
      ...p,
      belum: d.belum, proses: d.proses, selesai: d.selesai, total,
      pct: total ? Math.round((d.selesai / total) * 100) : 0,
      doneLabel: p.key === 'kedatangan' ? 'Diterima' : 'Selesai',
      hasProses: (STATUS_COLUMNS.find((c) => c.phase === p.key)?.options ?? []).includes('Proses'),
    };
  });
});

// Breakdown rows shown inside an expanded phase card
function detailRows(
  _key: string,
  stat: { doneLabel: string; hasProses: boolean; selesai: number; proses: number; belum: number; bar: string },
): Array<{ label: string; value: number; dot: string | null }> {
  const rows: Array<{ label: string; value: number; dot: string | null }> = [
    { label: stat.doneLabel, value: stat.selesai, dot: stat.bar },
  ];
  if (stat.hasProses) rows.push({ label: 'Proses', value: stat.proses, dot: '#FBBF24' });
  rows.push({ label: 'Belum', value: stat.belum, dot: null });
  return rows;
}

// Accordion state per card key — includes 'master'
const ALL_DECK_KEYS = [...DECK.map((p) => p.key), 'master'];
const openAcc = reactive<Record<string, boolean>>({});
function toggleAcc(key: string): void {
  const targetState = !openAcc[key];
  for (const k of ALL_DECK_KEYS) openAcc[k] = targetState;
}

// Height/opacity animation for the deck's expandable detail block.
// Written as JS hooks so the panel animates to its real content height
// (no max-height guesswork) and the grid row reflows smoothly.
const EXPAND_MS = 320;
const COLLAPSE_MS = 260;

function expandEnter(el: Element): void {
  const node = el as HTMLElement;
  // Mid-flight reversal: continue from the height it currently has
  // instead of snapping back to 0 (fresh inserts start at 0).
  const startHeight = node.style.height !== '' ? Math.max(0, node.getBoundingClientRect().height) : 0;

  node.style.overflow = 'hidden';
  node.style.height = `${startHeight}px`;
  node.style.opacity = '0';
  node.style.transform = 'translateY(-4px)';
  node.style.willChange = 'height, opacity, transform';
  void node.offsetHeight; // commit the start values before transitioning
  node.style.transition =
    `height ${EXPAND_MS}ms cubic-bezier(0.22, 1, 0.36, 1), ` +
    `opacity 260ms ease, transform ${EXPAND_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  node.style.height = `${node.scrollHeight}px`;
  node.style.opacity = '1';
  node.style.transform = 'translateY(0)';
}

function expandAfterEnter(el: Element): void {
  const node = el as HTMLElement;
  node.style.transition = '';
  node.style.height = '';
  node.style.opacity = '';
  node.style.transform = '';
  node.style.overflow = '';
  node.style.willChange = '';
}

function expandLeave(el: Element, done: () => void): void {
  const node = el as HTMLElement;
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    done();
  };

  node.style.height = `${node.getBoundingClientRect().height || node.scrollHeight}px`;
  node.style.opacity = '1';
  node.style.overflow = 'hidden';
  node.style.willChange = 'height, opacity, transform';
  void node.offsetHeight;
  node.style.transition =
    `height ${COLLAPSE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), ` +
    `opacity 180ms ease, transform 220ms ease`;
  node.style.height = '0px';
  node.style.opacity = '0';
  node.style.transform = 'translateY(-4px)';

  node.addEventListener('transitionend', (ev) => {
    if ((ev as TransitionEvent).propertyName === 'height') finish();
  });
  // Safety net: never leave the card stuck mid-collapse.
  window.setTimeout(finish, COLLAPSE_MS + 120);
}

function expandAfterLeave(el: Element): void {
  const node = el as HTMLElement;
  node.style.transition = '';
  node.style.height = '';
  node.style.opacity = '';
  node.style.transform = '';
  node.style.overflow = '';
  node.style.willChange = '';
}

// ─── Status mutation ──────────────────────────────────────────────────────────
const isMutatingId = ref('');

// Floating status menu (design: "UBAH STATUS")
const statusMenu = ref<{
  idGrup: string; field: StatusField; options: string[]; current: string; x: number; y: number;
} | null>(null);

function openStatusMenu(
  event: MouseEvent,
  idGrup: string,
  field: StatusField,
  options: string[],
  current: string,
): void {
  const btn = event.currentTarget as HTMLElement;
  const ripple = document.createElement('span');
  ripple.className = RIPPLE_CLASS;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width  = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left   = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top    = `${event.clientY - rect.top - size / 2}px`;
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });

  const w = 158;
  const h = 21 + options.length * 34 + 12 + 8;
  const x = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
  const below = rect.bottom + 8 + h < window.innerHeight;
  const y = below ? rect.bottom + 8 : Math.max(8, rect.top - h - 8);
  statusMenu.value = { idGrup, field, options, current, x, y };
}

function closeStatusMenu(): void { statusMenu.value = null; }

async function chooseStatus(option: string): Promise<void> {
  const menu = statusMenu.value;
  if (!menu) return;
  statusMenu.value = null;
  if (option === menu.current) return;
  await updateStatus(menu.idGrup, menu.field, option);
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
    showToast(`Updated ${idGrup} → ${statusBaru}`);
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

function handleExport(): void {
  exportToExcel();
  showToast('Export data Excel siap diunduh.');
}

function handleSyncMonitor(): void {
  triggerRemoteReload();
  showToast('Perintah sinkronisasi ke TV Monitor dikirim.');
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function statusOf(row: GrupHewan, field: string): string {
  return ((row as unknown as Record<string, unknown>)[field] as string | null | undefined) ?? 'Belum';
}

function porsiLabel(grup: GrupHewan): string {
  const n = grup.sohibul_qurban?.length ?? 0;
  return `${n} sohibul`;
}

function sohibulNames(grup: GrupHewan): string {
  const names = (grup.sohibul_qurban ?? [])
    .map((s) => s.nama)
    .filter((n): n is string => Boolean(n));
  return names.length ? names.join(', ') : '—';
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

function rowPct(grup: GrupHewan): number {
  return Math.round((rowScore(grup) / 12) * 100);
}

function avgPerGroup(): string {
  const groups = dataGrup.value?.length ?? 0;
  if (!groups) return '0,0';
  return (totalScore.value / groups).toFixed(1).replace('.', ',');
}

// ─── Outside click / Escape ───────────────────────────────────────────────────
function onDocumentClick(ev: MouseEvent): void {
  const target = ev.target as HTMLElement | null;
  if (!target) return;
  if (!target.closest('[data-qc="filter-panel"]') && !target.closest('[data-qc="filter-trigger"]')) {
    filterOpen.value = false;
  }
  if (!target.closest('[data-qc="status-menu"]') && !target.closest('[data-qc="status-pill"]')) {
    statusMenu.value = null;
  }
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape') return;
  filterOpen.value = false;
  statusMenu.value = null;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  _skeletonTimer = setTimeout(() => { skeletonElapsed.value = true; }, SKELETON_MS);
  detectDevice();
  loadHiddenGroupsFromStorage();
  connectRealtime();
  loadRecentHistory().then(() => { subscribeLogs(); });

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);

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
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
  if (_toastTimer !== null) clearTimeout(_toastTimer);
  if (_userScrollTimeout !== null) clearTimeout(_userScrollTimeout);
  if (_skeletonTimer !== null) clearTimeout(_skeletonTimer);
});
</script>

<template>
  <div
    class="qc-root relative flex h-screen max-h-screen w-full flex-col gap-4 overflow-hidden bg-[#0A0E13] p-6 text-[#E6EDF3] antialiased [font-family:'Inter',system-ui,sans-serif] max-lg:h-auto max-lg:min-h-screen max-lg:max-h-none max-lg:overflow-y-auto max-md:p-4"
  >
    <!-- ── HEADER ─────────────────────────────────────────────────────────── -->
    <header class="flex h-[52px] shrink-0 items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <img
          :src="logoAhsan"
          alt="Ahsan TV"
          width="12"
          height="12"
          decoding="async"
          draggable="false"
          class="h-[102px] w-[102px] shrink-0 select-none object-contain"
        />
        <div class="flex flex-col gap-0.5">
          <h1 class="qc-display text-[28px] leading-none font-black tracking-[-0.01em] text-[#E6EDF3]">
            Operasional Qurban 1446 H
          </h1>
          <p class="text-[13px] font-semibold text-[#9AA7B5]">Ahsantv · Manajemen terpadu &amp; audit log</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="flex h-[34px] items-center gap-2 rounded-[12px] bg-[#11171E] px-3 text-[12px] font-semibold text-[#8B98A7]">
          <span
            class="h-1.5 w-1.5 rounded-full"
            :style="{ background: isSyncing ? '#34D399' : '#F87171', boxShadow: isSyncing ? '0 0 8px rgba(52,211,153,0.6)' : 'none' }"
          ></span>
          {{ isSyncing ? 'Tersinkron' : 'Offline' }}
        </span>
      </div>
    </header>

    <!-- ── PROGRESS DECK ──────────────────────────────────────────────────── -->
    <!-- loading: the whole deck is replaced by five neutral skeleton cards -->
    <section
      v-if="showSkeleton"
      aria-hidden="true"
      class="grid shrink-0 grid-cols-5 gap-3.5 max-2xl:grid-cols-3 max-md:grid-cols-1"
    >
      <div
        v-for="n in 5" :key="`skel-card-${n}`"
        class="flex flex-col gap-2.5 rounded-3xl bg-[#11171E] p-5"
      >
        <span class="qc-skel h-[18px] w-[92px] rounded bg-white/10"></span>
        <span class="qc-skel -mt-1 h-[51px] w-[132px] rounded-xl bg-white/10"></span>
        <span class="qc-skel h-3.5 w-full rounded-full bg-white/10"></span>
        <span class="qc-skel h-[21px] w-[96px] rounded-md bg-white/10"></span>
      </div>
    </section>

    <section v-else class="grid shrink-0 grid-cols-5 gap-3.5 max-2xl:grid-cols-3 max-md:grid-cols-1">
      <div
        v-for="stat in stats" :key="stat.key"
        role="button"
        tabindex="0"
        class="relative flex cursor-pointer select-none flex-col gap-2.5 rounded-3xl p-5 outline-none transition-shadow duration-200 hover:ring-1 hover:ring-white/10 focus-visible:ring-2 focus-visible:ring-[#93C5FD]/60"
        :style="{ background: stat.card }"
        :aria-expanded="openAcc[stat.key] ? 'true' : 'false'"
        :aria-label="`${openAcc[stat.key] ? 'Sembunyikan' : 'Tampilkan'} detail ${stat.label}`"
        @click="toggleAcc(stat.key)"
        @keydown.enter.prevent="toggleAcc(stat.key)"
        @keydown.space.prevent="toggleAcc(stat.key)"
      >
        <span class="qc-display pr-10 text-[12px] font-extrabold tracking-[0.06em]" :style="{ color: stat.accent }">
          {{ stat.label }}
        </span>

        <div class="qc-display -mt-1 text-[54px] leading-[0.95] font-black tracking-[-0.02em] text-[#E6EDF3]">
          {{ stat.pct }}%
        </div>

        <div class="h-3.5 w-full overflow-hidden rounded-full" :style="{ background: stat.track }">
          <div
            class="h-full rounded-full transition-[width] duration-500 ease-out"
            :style="{ width: stat.pct + '%', background: stat.bar }"
          ></div>
        </div>

        <div class="text-[14px] font-bold text-[#7D8A99]">{{ stat.selesai }} / {{ stat.total }} grup</div>

        <!-- expand toggle (whole card is clickable; button kept for keyboard) -->
        <button
          type="button"
          class="absolute top-3.5 right-5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-transform duration-200"
          :style="{ background: stat.accent }"
          :aria-expanded="openAcc[stat.key] ? 'true' : 'false'"
          :aria-label="`Detail ${stat.label}`"
          @click.stop="toggleAcc(stat.key)"
        >
          <svg
            width="10" height="6" viewBox="0 0 10 6" fill="none"
            stroke="#0A0E13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            :class="openAcc[stat.key] ? 'rotate-180 transition-transform duration-200' : 'transition-transform duration-200'"
          >
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>

        <!-- breakdown -->
        <Transition
          @enter="expandEnter"
          @after-enter="expandAfterEnter"
          @leave="expandLeave"
          @after-leave="expandAfterLeave"
        >
          <div v-if="openAcc[stat.key]" class="overflow-hidden">
            <div class="mt-1 flex flex-col gap-2.5 rounded-2xl bg-black/35 p-3.5">
              <div v-for="row in detailRows(stat.key, stat)" :key="row.label" class="flex items-center gap-2">
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  :style="row.dot ? { background: row.dot } : { boxShadow: 'inset 0 0 0 2px #6B7889' }"
                ></span>
                <span class="flex-1 text-[13px] font-bold text-[#AEBBCB]">{{ row.label }}</span>
                <span class="qc-display text-[18px] font-black text-[#E6EDF3]">{{ row.value }}</span>
                <span class="text-[12px] font-bold text-[#7D8A99]">grup</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- TOTAL card -->
      <div
        role="button"
        tabindex="0"
        class="relative flex cursor-pointer select-none flex-col gap-2.5 rounded-3xl bg-[#34D399] p-5 outline-none transition-shadow duration-200 hover:ring-1 hover:ring-white/30 focus-visible:ring-2 focus-visible:ring-[#052E22]/60"
        :aria-expanded="openAcc['master'] ? 'true' : 'false'"
        :aria-label="`${openAcc['master'] ? 'Sembunyikan' : 'Tampilkan'} detail total eksekusi`"
        @click="toggleAcc('master')"
        @keydown.enter.prevent="toggleAcc('master')"
        @keydown.space.prevent="toggleAcc('master')"
      >
        <span class="qc-display pr-10 text-[12px] font-extrabold tracking-[0.06em] text-[#052E22]">TOTAL EKSEKUSI</span>

        <div class="qc-display -mt-1 text-[54px] leading-[0.95] font-black tracking-[-0.02em] text-[#052E22]">
          {{ globalPercentage }}%
        </div>

        <div class="h-3.5 w-full overflow-hidden rounded-full bg-[#1FA878]">
          <div
            class="h-full rounded-full bg-[#052E22] transition-[width] duration-500 ease-out"
            :style="{ width: globalPercentage + '%' }"
          ></div>
        </div>

        <div class="text-[14px] font-bold text-[#064E3B]">{{ totalScore }} / {{ maxTotalScore }} poin</div>

        <button
          type="button"
          class="absolute top-3.5 right-5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#052E22]"
          :aria-expanded="openAcc['master'] ? 'true' : 'false'"
          aria-label="Detail total eksekusi"
          @click.stop="toggleAcc('master')"
        >
          <svg
            width="10" height="6" viewBox="0 0 10 6" fill="none"
            stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            :class="openAcc['master'] ? 'rotate-180 transition-transform duration-200' : 'transition-transform duration-200'"
          >
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>

        <Transition
          @enter="expandEnter"
          @after-enter="expandAfterEnter"
          @leave="expandLeave"
          @after-leave="expandAfterLeave"
        >
          <div v-if="openAcc['master']" class="overflow-hidden">
            <div class="mt-1 flex flex-col gap-2.5 rounded-2xl bg-black/15 p-3.5">
              <div class="flex items-center gap-2">
                <span class="flex-1 text-[13px] font-bold text-[#05483a]">Terkumpul</span>
                <span class="qc-display text-[18px] font-black text-[#052E22]">{{ totalScore }}</span>
                <span class="text-[12px] font-bold text-[#067a5c]">poin</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="flex-1 text-[13px] font-bold text-[#05483a]">Sisa</span>
                <span class="qc-display text-[18px] font-black text-[#052E22]">{{ Math.max(0, maxTotalScore - totalScore) }}</span>
                <span class="text-[12px] font-bold text-[#067a5c]">poin</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="flex-1 text-[13px] font-bold text-[#05483a]">Rata-rata</span>
                <span class="qc-display text-[18px] font-black text-[#052E22]">{{ avgPerGroup() }}</span>
                <span class="text-[12px] font-bold text-[#067a5c]">/ grup</span>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </section>

    <!-- ── TOOLBAR ────────────────────────────────────────────────────────── -->
    <div class="relative z-20 flex h-12 shrink-0 items-center gap-2.5 max-lg:h-auto max-lg:flex-wrap">
      <!-- search -->
      <label class="flex h-[43px] w-[300px] shrink-0 items-center gap-2 rounded-[14px] bg-[#11171E] px-3 max-md:w-full">
        <i class="fas fa-magnifying-glass text-[12px] text-[#5B6776]"></i>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari ID grup, shohibul, label…"
          class="w-full bg-transparent text-[14px] text-[#E6EDF3] outline-none placeholder:text-[#5B6776]"
        />
      </label>

      <!-- per-process status filter -->
      <div class="relative shrink-0">
        <button
          data-qc="filter-trigger"
          class="flex h-[39px] w-[322px] cursor-pointer items-center gap-2 rounded-[14px] bg-[#11171E] px-3 text-left transition-colors hover:bg-[#151D26] max-md:w-full"
          :aria-expanded="filterOpen ? 'true' : 'false'"
          @click="filterOpen = !filterOpen"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#8B98A7" stroke-width="1.4" class="shrink-0">
            <path d="M.7 1h11.6L8 6v6l-3 1.6V6L.7 1Z" />
          </svg>
          <span class="shrink-0 text-[13px] font-extrabold text-[#E6EDF3]">Status per proses</span>
          <span class="h-3.5 w-px shrink-0 bg-[#263340]"></span>
          <span
            class="flex-1 truncate text-[12px] font-bold"
            :style="{ color: hasActiveStatusFilter ? '#34D399' : '#8B98A7' }"
            :title="filterSummary"
          >{{ filterSummary }}</span>
          <svg
            width="8" height="5" viewBox="0 0 8 5" fill="none" stroke="#8B98A7" stroke-width="1.4"
            class="shrink-0 transition-transform duration-150" :class="filterOpen ? 'rotate-180' : ''"
          >
            <path d="M.5.5 4 4l3.5-3.5" />
          </svg>
        </button>

        <!-- grouped filter panel -->
        <div
          v-if="filterOpen"
          data-qc="filter-panel"
          class="absolute top-[47px] left-0 z-50 w-[484px] rounded-[18px] bg-[#0D141B] p-[18px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] max-md:w-[calc(100vw-2rem)]"
        >
          <div class="flex items-start justify-between">
            <div class="flex flex-col gap-0.5">
              <span class="text-[14px] font-extrabold text-[#E6EDF3]">Filter status</span>
              <span class="text-[11px] text-[#5B6776]">Pilih status per proses</span>
            </div>
            <button
              class="cursor-pointer text-[11px] font-bold text-[#8B98A7] transition-colors hover:text-[#E6EDF3]"
              @click="resetStatusFilters()"
            >Reset</button>
          </div>

          <div class="mt-3.5 grid grid-cols-2 gap-x-[18px] gap-y-3.5">
            <div v-for="column in STATUS_COLUMNS" :key="column.field" class="flex flex-col gap-[7px]">
              <div class="flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full" :style="{ background: PHASE_META[column.phase].color }"></span>
                <span class="qc-display text-[10px] font-extrabold tracking-[0.06em]" :style="{ color: PHASE_META[column.phase].color }">
                  {{ PHASE_META[column.phase].title }}
                </span>
                <span class="flex-1"></span>
                <span v-if="showSkeleton" class="qc-skel h-2.5 w-[34px] rounded bg-white/10"></span>
                <span v-else class="text-[10px] text-[#4E5A68]">{{ dataGrup?.length ?? 0 }} grup</span>
              </div>

              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="option in column.options" :key="option"
                  class="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] transition-colors"
                  :class="filterStatus[column.phase].includes(option) ? 'font-extrabold' : 'font-semibold'"
                  :style="filterStatus[column.phase].includes(option)
                    ? { background: '#0F2A22', color: '#6EE7B7' }
                    : { background: '#11171E', color: '#8B98A7', boxShadow: 'inset 0 0 0 1px #1B2632' }"
                  @click="toggleStatusFilter(column.field, option)"
                >
                  <span v-if="filterStatus[column.phase].includes(option)" class="h-1.5 w-1.5 rounded-full bg-[#34D399]"></span>
                  {{ option }}
                </button>
              </div>
            </div>
          </div>

          <div class="mt-3.5 border-t border-[#1E2A38] pt-2 text-[10px] text-[#5B6776]">
            Logika: status dalam satu proses = ATAU · antar proses = DAN
          </div>
        </div>
      </div>

      <!-- species chips -->
      <button
        v-for="j in JENIS_OPTIONS" :key="j"
        class="flex h-[39px] shrink-0 cursor-pointer items-center rounded-[14px] px-[11px] text-[14px] transition-colors"
        :class="filterJenis.includes(j) ? 'font-extrabold' : 'font-semibold'"
        :style="filterJenis.includes(j)
          ? { background: '#0F2A22', color: '#6EE7B7' }
          : { background: '#11171E', color: '#8B98A7' }"
        @click="toggleJenis(j)"
      >{{ j }}</button>

      <div class="flex-1"></div>

      <!-- TV page control -->
      <div class="flex items-center gap-1.5 text-[13px] font-semibold text-[#7D8A99]">
        <span class="whitespace-nowrap">TV · hal.</span>
        <span v-if="showSkeleton" class="qc-skel h-[22px] w-[52px] rounded-md bg-white/10"></span>
        <button
          v-for="p in showSkeleton ? [] : totalPages" :key="p"
          class="flex h-[22px] min-w-[22px] cursor-pointer items-center justify-center rounded-md px-1 text-[11px] font-bold transition-colors"
          :style="p === activePage ? { background: '#0F2A22', color: '#6EE7B7' } : { color: '#5B6776' }"
          @click="onPageClick(p)"
        >{{ p }}</button>
        <span v-if="!isMobileDevice" class="whitespace-nowrap tabular-nums">· {{ countdown }} dtk</span>
      </div>

      <!-- actions -->
      <button
        class="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[14px] bg-[#11171E] text-[#E6EDF3] transition-colors hover:bg-[#151D26]"
        title="Reset filter" @click="onResetFilters"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.2 9.5A7 7 0 1 1 4 13.2" />
          <path d="M3.2 4.2v5.2h5.2" />
        </svg>
      </button>

      <button
        class="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[14px] bg-[#11171E] text-[#E6EDF3] transition-colors hover:bg-[#151D26]"
        title="Export XLSX" @click="handleExport"
      >
        <svg width="16.2" height="22" viewBox="0 0 14 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <path d="M1 1h7l5 5v12H1V1Z" />
          <path d="M8 1v5h5" />
          
        </svg>
      </button>

      <button
        class="flex h-[45px] w-[50px] shrink-0 cursor-pointer items-center justify-center rounded-[14px] bg-[#34D399] text-[#052E22] transition-colors hover:bg-[#6EE7B7]"
        title="Sinkronkan TV" @click="handleSyncMonitor"  
      >
        <span class="material-symbols-outlined">
        connected_tv
        </span>
      </button>
    </div>

    <!-- ── WORKSPACE ──────────────────────────────────────────────────────── -->
    <main class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] gap-4 overflow-hidden max-xl:grid-cols-1 max-xl:overflow-visible">
      <!-- Operations table -->
      <section class="flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-[#11171E] max-xl:min-h-[520px]">
        <div class="flex h-[50px] shrink-0 items-center justify-between gap-3 px-4">
          <div class="flex items-center gap-2">
            <span v-if="showSkeleton" class="qc-skel h-4 w-[172px] rounded bg-white/10"></span>
            <span v-else class="qc-display text-[15px] font-extrabold text-[#E6EDF3]">
              {{ filteredCount }} dari {{ dataGrup?.length ?? 0 }} kelompok
            </span>
            <button
              v-if="hiddenGroupIds.length"
              class="cursor-pointer rounded-md bg-[#2B2008] px-2 py-1 text-[11px] font-bold text-[#FCD34D] transition-colors hover:bg-[#3A2C0D]"
              title="Tampilkan semua grup di TV"
              @click="clearAllHidden"
            >
              {{ hiddenGroupIds.length }} disembunyikan · reset
            </button>
          </div>
          <span class="hidden shrink-0 text-[13px] text-[#5B6776] sm:block">Klik status untuk mengubah langsung</span>
        </div>

        <div class="min-h-0 flex-1 overflow-auto" :class="SCROLLBAR_TABLE">
          <div class="min-w-full">
            <!-- column headers -->
            <div
              class="sticky top-0 z-10 grid h-[47px] grid-cols-[28px_180px_260px_repeat(4,110px)_minmax(120px,1fr)] items-center gap-2 bg-[#0D1218] px-4 text-[12px] font-extrabold tracking-[0.06em] text-[#5B6776]"
            >
              <span>NO</span>
              <span>ID &amp; SHOHIBUL</span>
              <span>HEWAN</span>
              <span v-for="col in STATUS_COLUMNS" :key="col.field" class="text-center">{{ col.label }}</span>
              <span>PROGRES</span>
            </div>

            <!-- loading skeleton -->
            <div v-if="showSkeleton" aria-hidden="true">
              <div
                v-for="n in SKELETON_ROWS" :key="`skel-row-${n}`"
                class="grid h-[67px] grid-cols-[28px_180px_260px_repeat(4,110px)_minmax(120px,1fr)] items-center gap-2 border-b border-[#151D26] px-4"
              >
                <span class="qc-skel h-3 w-4 rounded bg-white/10"></span>

                <div class="flex min-w-0 flex-col gap-1.5">
                  <span class="qc-skel h-4 w-[56px] rounded bg-white/10"></span>
                  <span class="qc-skel h-3 w-[124px] rounded bg-white/10"></span>
                </div>

                <div class="flex min-w-0 flex-col gap-1.5">
                  <span class="qc-skel h-4 w-[96px] rounded bg-white/10"></span>
                  <span class="qc-skel h-3 w-[72px] rounded bg-white/10"></span>
                </div>

                <span
                  v-for="c in 4" :key="`skel-pill-${n}-${c}`"
                  class="qc-skel h-[34px] w-[110px] rounded-[10px] bg-white/10"
                ></span>

                <div class="flex w-full flex-col gap-1.5">
                  <span class="qc-skel h-3 w-[74px] rounded bg-white/10"></span>
                  <span class="qc-skel h-2 w-full rounded-full bg-white/10"></span>
                </div>
              </div>
            </div>

            <!-- empty -->
            <div v-else-if="filteredRows.length === 0" class="flex flex-col items-center justify-center gap-2 py-16 text-[#5B6776]">
              <i class="fas fa-inbox text-xl text-[#2B3B4C]"></i>
              <span class="text-[12px]">Tidak ada grup hewan yang cocok dengan parameter filter.</span>
              <button
                class="mt-1 cursor-pointer rounded-[10px] bg-[#11171E] px-3 py-1.5 text-[11px] font-bold text-[#8B98A7] shadow-[inset_0_0_0_1px_#1B2632] transition-colors hover:text-[#E6EDF3]"
                @click="onResetFilters"
              >Reset filter</button>
            </div>

            <!-- rows -->
            <template v-else>
              <div
                v-for="(row, i) in filteredRows" :key="`${row.id_grup}-${i}`"
                class="group grid h-[67px] grid-cols-[28px_180px_260px_repeat(4,110px)_minmax(120px,1fr)] items-center gap-2 border-b border-[#151D26] px-4 transition-colors hover:bg-[#151D26]"
                :class="[
                  isGroupHidden(row.id_grup) ? 'opacity-40' : '',
                  isMutatingId.startsWith(row.id_grup + ':') ? 'animate-[qc-row-mutate_0.6s_ease-out]' : '',
                ]"
              >
                <span class="text-[14px] font-bold text-[#5B6776]">{{ i + 1 }}</span>

                <!-- ID + sohibul -->
                <div class="relative flex min-w-0 flex-col gap-0.5">
                  <span class="qc-display text-[17px] font-black text-[#E6EDF3]">{{ row.id_grup }}</span>
                  <span class="truncate text-[13px] text-[#9AA7B5]" :title="sohibulNames(row)">
                    {{ sohibulNames(row) }}
                  </span>
                  <button
                    class="absolute top-0 right-0 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-[10px] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    :class="isGroupHidden(row.id_grup) ? 'text-[#F87171] opacity-100' : 'text-[#5B6776] hover:text-[#E6EDF3]'"
                    :title="isGroupHidden(row.id_grup) ? 'Tampilkan di TV' : 'Sembunyikan dari TV'"
                    @click.stop="onToggleHide(row.id_grup)"
                  >
                    <i :class="isGroupHidden(row.id_grup) ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                  </button>
                </div>

                <!-- hewan -->
                <div class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate text-[15px] font-extrabold text-[#E6EDF3]">{{ row.label_tampilan ?? '—' }}</span>
                  <span class="truncate text-[13px]" :style="{ color: row.is_timer_active ? '#FBBF24' : '#7D8A99' }">
                    {{ porsiLabel(row) }}<template v-if="row.is_timer_active"> · timer aktif</template>
                  </span>
                </div>

                <!-- status pills -->
                <button
                  v-for="col in STATUS_COLUMNS" :key="col.field"
                  data-qc="status-pill"
                  class="relative flex h-[34px] w-[110px] cursor-pointer items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-extrabold transition-[filter] hover:brightness-125 disabled:cursor-wait disabled:opacity-70"
                  :style="pillStyle(statusOf(row, col.field))"
                  :disabled="isMutating(row.id_grup, col.field)"
                  @click="openStatusMenu($event, row.id_grup, col.field, col.options, statusOf(row, col.field))"
                >
                  <i v-if="isMutating(row.id_grup, col.field)" class="fas fa-circle-notch fa-spin text-[10px]"></i>
                  <span v-else class="h-2.5 w-2.5 shrink-0 rounded-full" :style="dotStyle(statusOf(row, col.field))"></span>
                  <span>{{ statusOf(row, col.field) }}</span>
                  <svg width="8" height="4" viewBox="0 0 8 4" fill="none" stroke="currentColor" stroke-width="1.3" class="shrink-0 opacity-80">
                    <path d="M.5.5 4 3.5 7.5.5" />
                  </svg>
                </button>

                <!-- progress -->
                <div class="flex w-full flex-col gap-1.5">
                  <span class="text-[13px] font-extrabold text-[#C9D3DE]">{{ rowScore(row) }}/12 · {{ rowPct(row) }}%</span>
                  <div class="h-2 w-full overflow-hidden rounded-full bg-[#1E2733]">
                    <div
                      class="h-full rounded-full bg-[#34D399] transition-all duration-300"
                      :style="{ width: rowPct(row) + '%' }"
                    ></div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </section>

      <!-- Audit log -->
      <aside class="flex min-h-0 flex-col gap-1.5 overflow-hidden rounded-[28px] bg-[#11171E] p-3 max-xl:h-[420px]">
        <div class="flex h-[47px] shrink-0 items-center justify-between gap-2 px-3.5">
          <h2 class="text-[16px] font-extrabold text-[#E6EDF3]">Log audit realtime</h2>
          <div class="flex items-center gap-1">
            <button
              class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[10px] text-[#5B6776] transition-colors hover:text-[#E6EDF3]"
              :class="isPaused ? 'text-[#FCD34D]' : ''"
              :title="isPaused ? 'Lanjutkan auto-scroll' : 'Jeda auto-scroll'"
              @click="isPaused = !isPaused"
            >
              <i :class="isPaused ? 'fas fa-play' : 'fas fa-pause'"></i>
            </button>
            <button
              class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[10px] text-[#5B6776] transition-colors hover:text-[#F87171]"
              title="Bersihkan log tampilan" @click="clearView"
            >
              <i class="fas fa-trash-can"></i>
            </button>
          </div>
        </div>

        <div ref="feedEl" class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto" :class="SCROLLBAR_FEED" @scroll="onFeedScroll">
          <template v-if="showSkeleton">
            <div
              v-for="n in SKELETON_LOGS" :key="`skel-log-${n}`"
              class="flex flex-col gap-1.5 rounded-[20px] bg-[#161E28] p-3.5"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="qc-skel h-3 w-[92px] rounded bg-white/10"></span>
                <span class="qc-skel h-3 w-[52px] rounded bg-white/10"></span>
              </div>
              <div class="flex items-center gap-2.5">
                <span class="qc-skel h-[19px] w-[54px] rounded bg-white/10"></span>
                <span class="qc-skel h-4 w-[116px] rounded bg-white/10"></span>
              </div>
              <span class="qc-skel h-3 w-[104px] rounded bg-white/10"></span>
            </div>
          </template>

          <div v-else-if="alfLogs.length === 0 && alfIsLoading" class="flex flex-col items-center justify-center gap-2 py-10 text-[12px] text-[#5B6776]">
            <i class="fas fa-circle-notch fa-spin"></i>
            <span>Memuat riwayat aktivitas…</span>
          </div>

          <div v-else-if="alfLogs.length === 0" class="flex flex-col items-center justify-center gap-1.5 py-10 text-center text-[#5B6776]">
            <i class="fas fa-satellite-dish text-lg text-[#2B3B4C]"></i>
            <span class="text-[12px] font-bold text-[#8B98A7]">Menunggu transmisi baru</span>
            <span class="text-[11px] text-[#4E5A68]">Perubahan status hewan akan terdaftar di sini secara realtime.</span>
          </div>

          <template v-else>
            <article
              v-for="(log, i) in alfLogs" :key="log.id ?? `log-${i}`"
              class="flex flex-col gap-1.5 rounded-[20px] bg-[#161E28] p-3.5 transition-colors hover:bg-[#19222D]"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="qc-display text-[12px] font-black tracking-[0.06em]" :style="{ color: faseColor(log.fase) }">
                  {{ faseLabel(log.fase) }}
                </span>
                <span class="text-[12px] tabular-nums text-[#5B6776]">{{ formatTime(log.created_at) }}</span>
              </div>

              <div class="flex items-center gap-2.5">
                <span class="qc-display shrink-0 text-[19px] font-black text-[#E6EDF3]">{{ log.id_grup }}</span>
                <span class="truncate text-[16px] font-extrabold" :style="{ color: statusTextColor(log.status_baru) }">
                  <span class="text-[#5B6776]">{{ log.status_lama }}</span>
                  <span class="px-1 text-[#4E5A68]">→</span>{{ log.status_baru }}
                </span>
              </div>

              <span class="text-[12px] font-semibold text-[#7D8A99]">oleh {{ log.actor_name }}</span>
            </article>
          </template>
        </div>

        <div class="flex h-[39px] shrink-0 items-center justify-between rounded-[12px] bg-[#0D1218] px-3">
          <span class="text-[12px] text-[#5B6776]">{{ showSkeleton ? 'Memuat…' : (alfIsLoading ? 'Syncing…' : 'Live audit feed') }}</span>
          <span v-if="showSkeleton" class="qc-skel h-3 w-12 rounded bg-white/10"></span>
          <span v-else class="text-[12px] font-semibold text-[#C9D3DE]">{{ entryCount }} entri</span>
        </div>
      </aside>
    </main>

    <!-- ── STATUS MENU (teleported, positioned at the clicked pill) ────────── -->
    <Teleport to="body">
      <div v-if="statusMenu" class="contents">
        <div
          data-qc="status-menu"
          class="fixed z-[300] w-[158px] rounded-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
          :style="{ background: '#1C2632', left: statusMenu.x + 'px', top: statusMenu.y + 'px' }"
        >
          <div class="flex h-[21px] items-center px-2.5 text-[11px] font-extrabold tracking-[0.08em] text-[#6B7889]">
            UBAH STATUS
          </div>
          <button
            v-for="option in statusMenu.options" :key="option"
            class="flex h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-extrabold transition-colors"
            :style="option === statusMenu.current
              ? { background: STATUS_STYLE[statusTone(option)].bg, color: STATUS_STYLE[statusTone(option)].text }
              : { color: STATUS_STYLE[statusTone(option)].text }"
            @click="chooseStatus(option)"
          >
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="dotStyle(option)"></span>
            <span class="flex-1 text-left">{{ option }}</span>
            <svg v-if="option === statusMenu.current" width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 4.5 4.5 8 11 1" />
            </svg>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ── TOAST ──────────────────────────────────────────────────────────── -->
    <div
      class="pointer-events-none fixed bottom-10 left-1/2 z-[999] -translate-x-1/2 rounded-2xl bg-[#161E28] px-4 py-2 text-[12px] font-semibold text-[#E6EDF3] shadow-[0_16px_40px_rgba(0,0,0,0.55)] ring-1 ring-[#1E2A38] transition-all duration-150"
      :class="toastVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'"
    >
      {{ toastMsg }}
    </div>
  </div>
</template>

<style>
.qc-root .qc-display {
  font-family: 'Montserrat', 'Inter', system-ui, sans-serif;
}

@keyframes qc-ripple {
  0%   { transform: scale(0);   opacity: 0.8; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes qc-row-mutate {
  0%   { box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0); }
  40%  { box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.4); }
  100% { box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0); }
}

/* ── Skeleton placeholders ───────────────────────────────────────────────────
   Background colour comes from the utility class on each element (white/10 on
   dark surfaces, black/15 on the green TOTAL card); this only adds the sweep. */
.qc-skel {
  position: relative;
  overflow: hidden;
}

.qc-skel::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.14) 50%,
    transparent 100%
  );
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
