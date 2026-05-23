<template>
  <div class="flex h-screen overflow-hidden text-slate-800 bg-slate-50 dark:text-slate-100 dark:bg-slate-950 transition-colors duration-200">

    <!-- ── Main Content ── -->
    <main class="flex-1 flex flex-col w-full h-full bg-slate-50 dark:bg-slate-950 transition-colors duration-200">

      <!-- TopNavBar -->
      <header class="bg-white dark:bg-slate-900 flex justify-between items-center w-full px-6 py-3 border-b border-slate-200 dark:border-slate-800 z-10 shrink-0 transition-colors duration-200">
        <div class="flex items-center gap-3">
          <i class="fa-solid fa-moon-star text-emerald-600 dark:text-emerald-400 text-xl"></i>
          <h1 class="text-xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">Qurban Admin Panel</h1>
        </div>
        <button
          class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          @click="toggleTheme"
        >
          <span class="material-symbols-outlined">{{ isDark ? 'light_mode' : 'dark_mode' }}</span>
        </button>
      </header>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto p-4 md:p-6 table-container">
        <div class="max-w-screen-2xl mx-auto space-y-4">

          <!-- ── Remote Page Control ── -->
          <div class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm transition-colors duration-200">
            <div class="flex items-center gap-2 shrink-0">
              <span class="material-symbols-outlined text-emerald-600 dark:text-emerald-400">cast</span>
              <span class="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                TV DISPLAY MONITOR: HALAMAN [ {{ activePage }} ]
              </span>
            </div>
            <div class="flex gap-1 flex-wrap justify-center items-center">

              <!-- ── Export & Print Actions ── -->
              <button
                @click="exportToExcel()"
                class="h-9 px-3 mr-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded flex items-center gap-1.5 transition-all duration-200 shadow-sm focus:outline-none"
                title="Export to Excel"
              >
                <i class="fa-solid fa-file-excel text-sm"></i>
                <span>Excel</span>
              </button>

              <button
                @click="triggerRemoteReload()"
                class="h-9 px-3 mr-3 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold rounded flex items-center gap-1.5 transition-all duration-200 shadow-sm focus:outline-none"
                title="Paksa semua layar TV Monitor reload sekarang"
              >
                <i class="fa-solid fa-rotate text-sm"></i>
                <span>Reload Layar TV</span>
              </button>

              <!-- ── Auto Switch Countdown Display ── -->
              <div class="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mr-2">
                <i class="fa-solid fa-clock-rotate-left text-emerald-500 animate-spin" style="animation-duration: 6s;"></i>
                <span>Auto Switch: {{ countdown }}s</span>
                <!-- Mini progress bar -->
                <div class="w-14 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-linear"
                    :style="{ width: ((AUTO_INTERVAL - countdown) / AUTO_INTERVAL * 100) + '%' }"
                  ></div>
                </div>
              </div>

              <!-- ── Page Number Buttons ── -->
              <button
                v-for="p in TOTAL_PAGES"
                :key="p"
                class="w-9 h-9 rounded text-sm font-bold flex items-center justify-center shrink-0 transition-colors duration-200"
                :class="p === activePage
                  ? 'bg-emerald-600 text-white shadow'
                  : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
                @click="setActivePage(p)"
              >
                {{ p }}
              </button>
            </div>
          </div>

          <!-- ── Stat Cards ── -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              v-for="stat in stats"
              :key="stat.label"
              class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-200"
            >
              <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{{ stat.label }}</div>
              <div class="text-3xl font-extrabold" :class="stat.colorClass">{{ stat.value }}</div>
            </div>
          </div>

          <!-- ── Search ── -->
          <div class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari ID Grup, Jenis Hewan, Label, atau Keterangan..."
              class="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-sm transition-all duration-200"
            />
          </div>

          <!-- ── Loading / Empty State ── -->
          <div v-if="!dataGrup" class="text-center py-16 text-slate-400 dark:text-slate-600">
            <i class="fa-solid fa-spinner fa-spin text-3xl mb-3"></i>
            <p class="text-sm">Memuat data dari Supabase...</p>
          </div>
          <div v-else-if="filteredRows.length === 0" class="text-center py-16 text-slate-400 dark:text-slate-600">
            <i class="fa-solid fa-circle-xmark text-3xl mb-3"></i>
            <p class="text-sm">Tidak ada data yang cocok dengan pencarian.</p>
          </div>

          <!-- ── Data Table ── -->
          <div v-else class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors duration-200">
            <div class="overflow-x-auto">
              <table :key="tableKey" class="w-full text-left border-collapse min-w-[1100px]">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-12 text-center">NO</th>
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-36">ID GRUP</th>
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-56">DETAIL HEWAN</th>
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-center w-44">
                      <i class="fa-solid fa-door-open mr-1 text-blue-500"></i>KEDATANGAN
                    </th>
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-center w-44">
                      <i class="fa-solid fa-knife mr-1 text-green-500"></i>SEMBELIHAN
                    </th>
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-center w-44">
                      <i class="fa-solid fa-scissors mr-1 text-orange-500"></i>PENGULITAN
                    </th>
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 text-center w-44">
                      <i class="fa-solid fa-box mr-1 text-purple-500"></i>PENGEMASAN
                    </th>
                    <th class="py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 w-52">KETERANGAN</th>
                  </tr>
                </thead>
                <tbody class="text-sm text-slate-700 dark:text-slate-300">
                  <tr
                    v-for="(row, i) in filteredRows"
                    :key="row.id_grup"
                    class="border-b border-slate-200 dark:border-slate-800 transition-colors duration-200"
                    :class="i % 2 === 1
                      ? 'bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'"
                  >
                    <!-- No -->
                    <td class="py-3 px-4 text-center font-mono text-slate-400 dark:text-slate-500 text-xs">{{ i + 1 }}</td>

                    <!-- ID Grup + tombol force-sync per baris -->
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-2">
                        <span class="inline-flex items-center bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide transition-colors duration-200">
                          {{ row.id_grup }}
                        </span>
                        <button
                          @click="toggleHideGroup(row.id_grup)"
                          class="w-6 h-6 flex items-center justify-center rounded transition-colors duration-200 shrink-0"
                          :class="hiddenGroupIds.includes(row.id_grup)
                            ? 'bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-800/50 border border-rose-300 dark:border-rose-700'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'"
                          :title="hiddenGroupIds.includes(row.id_grup) ? 'Tampilkan kembali di Monitor TV' : 'Sembunyikan dari Monitor TV'"
                        >
                          <i
                            class="text-[10px]"
                            :class="hiddenGroupIds.includes(row.id_grup)
                              ? 'fa-solid fa-eye-slash text-rose-500 dark:text-rose-400'
                              : 'fa-solid fa-eye text-slate-400 dark:text-slate-500'"
                          ></i>
                        </button>
                      </div>
                    </td>

                    <!-- Detail Hewan -->
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100 capitalize transition-colors duration-200">
                        <i :class="['fa-solid', animalIconClass(row.jenis_hewan)]"></i>
                        {{ row.jenis_hewan }}
                      </div>
                      <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 transition-colors duration-200">
                        {{ row.label_tampilan }}
                      </div>
                    </td>

                    <!-- Status Buttons: 4 kolom -->
                    <td
                      v-for="kolom in STATUS_COLUMNS"
                      :key="kolom.field"
                      class="py-3 px-2"
                    >
                      <div class="flex justify-center bg-slate-100 dark:bg-slate-950 rounded-lg p-1 w-fit mx-auto border border-slate-200 dark:border-slate-800 gap-1 transition-colors duration-200">
                        <button
                          v-for="opt in STATUS_OPTIONS"
                          :key="opt"
                          class="status-btn px-2.5 py-1 text-[11px] rounded-md"
                          :class="[opt.toLowerCase(), { active: row[kolom.field] === opt }]"
                          @click="handleStatusClick($event, row.id_grup, kolom.field, opt)"
                        >
                          {{ opt }}
                        </button>
                      </div>
                    </td>

                    <!-- Keterangan (live-save on change) -->
                    <td class="py-3 px-4">
                      <input
                        type="text"
                        :value="row.keterangan"
                        placeholder="Catatan..."
                        class="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200"
                        @change="updateKeterangan(row.id_grup, $event.target.value)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- Footer count -->
            <div class="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-600 text-right transition-colors duration-200">
              Menampilkan {{ filteredRows.length }} dari {{ dataGrup?.length ?? 0 }} grup
            </div>
          </div>

        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as XLSX from 'xlsx'

const supabase = useSupabaseClient()

useHead({
  title: 'Qurban Admin Panel',
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
    { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css' },
  ],
})

// ── Konstanta ──
const STATUS_OPTIONS = ['Belum', 'Proses', 'Selesai']
const STATUS_COLUMNS = [
  { field: 'status_kedatangan', label: 'Kedatangan' },
  { field: 'status_sembelihan', label: 'Sembelihan' },
  { field: 'status_pengulitan', label: 'Pengulitan' },
  { field: 'status_pengemasan', label: 'Pengemasan' },
]
const TOTAL_PAGES   = 13
const AUTO_INTERVAL = 6   // detik

// ── Dark Mode ──
const isDark = ref(false)

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('color-theme', isDark.value ? 'dark' : 'light')
}

// ══════════════════════════════════════════════════════
// MASTER REMOTE PAGE CONTROL
//
// Arsitektur satu-arah:
//   Admin (Master) → broadcast → TV Monitor (Client)
//
// pageSyncChannel dibuat SATU kali di top-level agar
// .send() bisa dipanggil kapan saja setelah .subscribe().
// ══════════════════════════════════════════════════════
const activePage     = ref(1)
const countdown      = ref(AUTO_INTERVAL)
let   masterTimer    = null
const pageSyncChannel = supabase.channel('monitor-channel')

// Kirim nomor halaman ke TV Monitor via Supabase Broadcast
function broadcastPage(page) {
  pageSyncChannel.send({
    type:    'broadcast',
    event:   'master-page-change',
    payload: { page },
  })
}

// Kirim sinyal force reload ke semua layar TV Monitor
function triggerRemoteReload() {
  pageSyncChannel.send({
    type:    'broadcast',
    event:   'remote-reload',
    payload: { ts: Date.now() },
  })
}

// ── Kendali Manual Sembunyikan/Tampilkan Baris di Monitor TV ──
const hiddenGroupIds = ref([])

function toggleHideGroup(idGrup) {
  const idx = hiddenGroupIds.value.indexOf(idGrup)
  if (idx !== -1) {
    hiddenGroupIds.value.splice(idx, 1)
  } else {
    hiddenGroupIds.value.push(idGrup)
  }
  // Broadcast daftar terbaru ke semua layar monitor
  pageSyncChannel.send({
    type:    'broadcast',
    event:   'update-hidden-groups',
    payload: { hiddenIds: hiddenGroupIds.value },
  })
}

// Klik manual tombol halaman → pindah + reset countdown + broadcast
function setActivePage(p) {
  activePage.value = p
  countdown.value  = AUTO_INTERVAL   // reset agar hitungan mundur dari 6 lagi
  broadcastPage(p)
}

// ── Master Interval: hitung mundur 1 detik, broadcast tiap 6 detik ──
function startMasterInterval() {
  if (masterTimer) return
  masterTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      activePage.value = (activePage.value % TOTAL_PAGES) + 1
      broadcastPage(activePage.value)
      countdown.value = AUTO_INTERVAL
    }
  }, 1000)
}

function stopMasterInterval() {
  if (masterTimer) { clearInterval(masterTimer); masterTimer = null }
}

// ── Fetch Data ──
const tableKey = ref(0)
const { data: dataGrup, refresh } = await useAsyncData('grup_hewan', async () => {
  const { data, error } = await supabase
    .from('grup_hewan')
    .select('*, sohibul_qurban(*)')
    .order('id_grup', { ascending: true })
  if (error) { console.error('Supabase fetch error:', error); return [] }
  return data ?? []
})

// ── Realtime & Lifecycle ──
let realtimeChannel = null

onMounted(() => {
  // Pulihkan tema
  const saved = localStorage.getItem('color-theme')
  isDark.value = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark.value)

  // Subscribe channel broadcast SEBELUM memanggil .send()
  // Tanpa subscribe(), Supabase menolak semua .send() calls.
  pageSyncChannel.subscribe((status) => {
    console.log('[Admin] pageSyncChannel status:', status)
    // Mulai interval otomatis hanya setelah channel siap
    if (status === 'SUBSCRIBED') startMasterInterval()
  })

  // Realtime Postgres: refresh tabel saat ada perubahan di DB
  realtimeChannel = supabase
    .channel('admin-grup-hewan-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'grup_hewan' },
      (payload) => {
        console.log('[Admin] DB change:', payload)
        refresh().then(() => { tableKey.value++ })
      }
    )
    .subscribe((status) => {
      console.log('[Admin] realtimeChannel status:', status)
    })
})

onUnmounted(() => {
  stopMasterInterval()
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
  supabase.removeChannel(pageSyncChannel)
})

// ── Search ──
const searchQuery = ref('')

const filteredRows = computed(() => {
  if (!dataGrup.value) return []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return dataGrup.value
  return dataGrup.value.filter(r =>
    r.id_grup?.toLowerCase().includes(q)        ||
    r.jenis_hewan?.toLowerCase().includes(q)    ||
    r.label_tampilan?.toLowerCase().includes(q) ||
    r.keterangan?.toLowerCase().includes(q)
  )
})

// ── Stat Cards ──
const stats = computed(() => {
  const list    = dataGrup.value ?? []
  const total   = list.length
  const selesai = list.filter(r => r.status_pengemasan === 'Selesai').length
  const proses  = list.filter(r =>
    [r.status_kedatangan, r.status_sembelihan, r.status_pengulitan, r.status_pengemasan].some(s => s === 'Proses')
    && r.status_pengemasan !== 'Selesai'
  ).length
  const belum   = list.filter(r =>
    [r.status_kedatangan, r.status_sembelihan, r.status_pengulitan, r.status_pengemasan].every(s => s === 'Belum')
  ).length
  return [
    { label: 'Total Hewan',         value: total,   colorClass: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'Selesai Semua Tahap', value: selesai, colorClass: 'text-green-600 dark:text-green-400'     },
    { label: 'Sedang Diproses',     value: proses,  colorClass: 'text-amber-600 dark:text-amber-400'     },
    { label: 'Belum Mulai',         value: belum,   colorClass: 'text-red-500 dark:text-red-400'         },
  ]
})

// ── Icon Hewan ──
function animalIconClass(jenis) {
  const j = String(jenis ?? '').toLowerCase()
  if (j === 'sapi')    return 'fa-cow text-emerald-600'
  if (j === 'kambing') return 'fa-horse-head text-amber-600'
  return 'fa-sheep text-indigo-500'
}

// ── Status Button Ripple + Update ──
function handleStatusClick(event, idGrup, kolom, statusBaru) {
  const btn    = event.currentTarget
  const ripple = document.createElement('span')
  ripple.classList.add('btn-ripple')
  const rect = btn.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  ripple.style.width  = ripple.style.height = size + 'px'
  ripple.style.left   = (event.clientX - rect.left - size / 2) + 'px'
  ripple.style.top    = (event.clientY - rect.top  - size / 2) + 'px'
  btn.appendChild(ripple)
  ripple.addEventListener('animationend', () => ripple.remove())
  updateStatus(idGrup, kolom, statusBaru)
}

// ── Update Status ──
async function updateStatus(idGrup, kolom, statusBaru) {
  const row = dataGrup.value?.find(r => r.id_grup === idGrup)
  if (row) row[kolom] = statusBaru

  const { error } = await supabase
    .from('grup_hewan')
    .update({ [kolom]: statusBaru })
    .eq('id_grup', idGrup)
  if (error) {
    console.error('updateStatus error:', error)
    refresh().then(() => { tableKey.value++ })
  } else {
    refresh().then(() => { tableKey.value++ })
  }
}

// ── Update Keterangan ──
async function updateKeterangan(idGrup, teksBaru) {
  const row = dataGrup.value?.find(r => r.id_grup === idGrup)
  if (row) row.keterangan = teksBaru

  const { error } = await supabase
    .from('grup_hewan')
    .update({ keterangan: teksBaru })
    .eq('id_grup', idGrup)
  if (error) {
    console.error('updateKeterangan error:', error)
    refresh().then(() => { tableKey.value++ })
  } else {
    refresh().then(() => { tableKey.value++ })
  }
}

// ── Export to Excel ──
function exportToExcel() {
  const shohibulRows = []
  let noUrut = 1

  filteredRows.value.forEach(grup => {
    const labelGrupValue = (grup.jenis_hewan?.toLowerCase() === 'sapi') ? (grup.label_tampilan ?? '-') : '-'

    if (grup.sohibul_qurban?.length > 0) {
      grup.sohibul_qurban.forEach(shohibul => {
        shohibulRows.push({
          'No'                    : noUrut++,
          'Nama Shohibul Qurban'  : shohibul.nama             || '—',
          'ID Hewan'              : grup.id_grup,
          'Jenis Hewan'           : grup.jenis_hewan,
          'Label Grup'            : labelGrupValue,
          'Status Kedatangan'     : grup.status_kedatangan    || 'Belum',
          'Status Sembelih'       : grup.status_sembelihan    || 'Belum',
          'Status Pengulitan'     : grup.status_pengulitan    || 'Belum',
          'Status Pengemasan'     : grup.status_pengemasan    || 'Belum',
          'Keterangan'            : grup.keterangan           || '-',
        })
      })
    } else {
      shohibulRows.push({
        'No'                    : noUrut++,
        'Nama Shohibul Qurban'  : '(Belum Ada Anggota)',
        'ID Hewan'              : grup.id_grup,
        'Jenis Hewan'           : grup.jenis_hewan,
        'Label Grup'            : labelGrupValue,
        'Status Kedatangan'     : grup.status_kedatangan    || 'Belum',
        'Status Sembelih'       : grup.status_sembelihan    || 'Belum',
        'Status Pengulitan'     : grup.status_pengulitan    || 'Belum',
        'Status Pengemasan'     : grup.status_pengemasan    || 'Belum',
        'Keterangan'            : grup.keterangan           || '-',
      })
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(shohibulRows)
  const workbook  = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manifes Shohibul Qurban')

  const tglCetak = new Date().toISOString().split('T')[0]
  XLSX.writeFile(workbook, `Manifes_Shohibul_Qurban_${tglCetak}.xlsx`)
}
</script>

<style scoped>
.material-symbols-outlined {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

/* ══════════════════════════════════════
   SCROLLBAR
   ══════════════════════════════════════ */
.table-container::-webkit-scrollbar         { width: 8px; height: 8px; }
.table-container::-webkit-scrollbar-track   { background: #334155; }
.table-container::-webkit-scrollbar-thumb   { background: #475569; border-radius: 4px; }
.table-container::-webkit-scrollbar-thumb:hover { background: #64748b; }

:global(html:not(.dark)) .table-container::-webkit-scrollbar-track { background: #e2e8f0; }
:global(html:not(.dark)) .table-container::-webkit-scrollbar-thumb { background: #cbd5e1; }
:global(html:not(.dark)) .table-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* ══════════════════════════════════════
   STATUS BUTTON — BASE
   ══════════════════════════════════════ */
.status-btn {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #334155;
  background-color: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-weight: 500;
  transition:
    background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    border-color     0.25s cubic-bezier(0.4, 0, 0.2, 1),
    color            0.25s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow       0.25s cubic-bezier(0.4, 0, 0.2, 1),
    transform        0.12s cubic-bezier(0.4, 0, 0.2, 1);
}
:global(html:not(.dark)) .status-btn {
  border-color: #cbd5e1;
  color: #64748b;
}
.status-btn:active { transform: scale(0.94); }
.status-btn:not(.active):hover {
  transform: translateY(-1px);
  border-color: #64748b;
  color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
:global(html:not(.dark)) .status-btn:not(.active):hover {
  border-color: #94a3b8;
  color: #475569;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* ══════════════════════════════════════
   RIPPLE EFFECT
   ══════════════════════════════════════ */
.status-btn :deep(.btn-ripple) {
  position: absolute;
  border-radius: 50%;
  transform: scale(0);
  background: rgba(255, 255, 255, 0.28);
  pointer-events: none;
  animation: rippleExpand 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
:global(html:not(.dark)) .status-btn :deep(.btn-ripple) { background: rgba(0, 0, 0, 0.09); }

@keyframes rippleExpand {
  0%   { transform: scale(0); opacity: 1; }
  100% { transform: scale(2.8); opacity: 0; }
}

/* ══════════════════════════════════════
   DARK MODE — Active States
   ══════════════════════════════════════ */
.status-btn.belum.active {
  background-color: #7f1d1d; color: #fca5a5; border-color: #ef4444;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.28); font-weight: 700; animation: none;
}
.status-btn.proses.active {
  background-color: #78350f; color: #fcd34d; border-color: #f59e0b;
  font-weight: 700; animation: statusPulse 2s infinite ease-in-out;
}
.status-btn.selesai.active {
  background-color: #14532d; color: #86efac; border-color: #22c55e;
  box-shadow: 0 2px 6px rgba(34, 197, 94, 0.22); font-weight: 700; animation: none;
}

/* ══════════════════════════════════════
   LIGHT MODE — Active States
   ══════════════════════════════════════ */
:global(html:not(.dark)) .status-btn.belum.active {
  background-color: #fee2e2; color: #b91c1c; border-color: #ef4444;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.20); font-weight: 700; animation: none;
}
:global(html:not(.dark)) .status-btn.proses.active {
  background-color: #fef3c7; color: #b45309; border-color: #f59e0b;
  font-weight: 700; animation: statusPulseLite 2s infinite ease-in-out;
}
:global(html:not(.dark)) .status-btn.selesai.active {
  background-color: #dcfce7; color: #15803d; border-color: #22c55e;
  box-shadow: 0 2px 6px rgba(34, 197, 94, 0.20); font-weight: 700; animation: none;
}

/* ══════════════════════════════════════
   PULSE KEYFRAMES
   ══════════════════════════════════════ */
@keyframes statusPulse {
  0%   { box-shadow: 0 0 0 0   rgba(245, 158, 11, 0.60); }
  70%  { box-shadow: 0 0 0 7px rgba(245, 158, 11, 0);    }
  100% { box-shadow: 0 0 0 0   rgba(245, 158, 11, 0);    }
}
@keyframes statusPulseLite {
  0%   { box-shadow: 0 0 0 0   rgba(180, 83, 9, 0.45); }
  70%  { box-shadow: 0 0 0 7px rgba(180, 83, 9, 0);    }
  100% { box-shadow: 0 0 0 0   rgba(180, 83, 9, 0);    }
}

/* ══════════════════════════════════════
   PRINT STYLES
   ══════════════════════════════════════ */
@media print {
  header,
  .table-container > .max-w-screen-2xl > div:first-child,
  .table-container > .max-w-screen-2xl > div:nth-child(2),
  .table-container > .max-w-screen-2xl > div:nth-child(3)
  { display: none !important; }

  body, html { overflow: visible !important; height: auto !important; }
  .table-container { overflow: visible !important; height: auto !important; padding: 0 !important; }
  .max-w-screen-2xl { max-width: 100% !important; }

  .status-btn.belum.active   { background-color: #fecaca !important; color: #7f1d1d !important; border-color: #ef4444 !important; animation: none !important; }
  .status-btn.proses.active  { background-color: #fde68a !important; color: #78350f !important; border-color: #f59e0b !important; animation: none !important; }
  .status-btn.selesai.active { background-color: #bbf7d0 !important; color: #14532d !important; border-color: #22c55e !important; animation: none !important; }

  * { box-shadow: none !important; animation: none !important; transition: none !important; }
  .border-t { display: block !important; }
}
</style>