<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

useHead({
  title: 'Monitor Alur Kerja Hewan Qurban',
  link: [
    { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' },
  ],
})

const supabase = useSupabaseClient()

const HIJRI_OVERRIDE = { day: 10, month: 'Dzulhijjah', year: 1447 }
const MASEHI_MONTHS  = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const dtMasehi = ref('—')
const dtHijri  = ref('—')
const dtTime   = ref('--:--:-- WIB')

function pad2(n) { return String(n).padStart(2, '0') }

function updateClock() {
  const now   = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const wib   = new Date(utcMs + 7 * 3600000)
  dtTime.value   = `${pad2(wib.getHours())}:${pad2(wib.getMinutes())}:${pad2(wib.getSeconds())} WIB`
  dtMasehi.value = `${wib.getDate()} ${MASEHI_MONTHS[wib.getMonth()]} ${wib.getFullYear()}`
  dtHijri.value  = `${HIJRI_OVERRIDE.day} ${HIJRI_OVERRIDE.month} ${HIJRI_OVERRIDE.year}H`
}

const rawData = ref([])

async function fetchGrupHewan() {
  const { data, error } = await supabase
    .from('sohibul_qurban')
    .select(`
      id,
      nama,
      jenis_hewan,
      id_grup,
      grup_hewan (
        id_grup,
        label_tampilan,
        keterangan,
        status_kedatangan,
        status_sembelihan,
        status_pengulitan,
        status_pengemasan
      )
    `)
    .order('id_grup', { ascending: true })

  if (error) { console.error('Supabase fetch error:', error); return }
  rawData.value = data ?? []
}

await fetchGrupHewan()

const activePage     = ref(1)
const isShimmering   = ref(false)
let   shimmerTimeout = null
const hiddenGroupIds = ref([])

let realtimeChannel = null
let timerClock      = null

onMounted(() => {
  fetchGrupHewan()
  updateClock()
  timerClock = setInterval(updateClock, 1000)

  realtimeChannel = supabase.channel('page-sync-channel')

    .on('broadcast', { event: 'PAGE_CHANGED' }, (msg) => {
      const targetPage = msg?.payload?.page
      if (!targetPage || targetPage < 1 || targetPage > totalPages.value) return
      if (shimmerTimeout) clearTimeout(shimmerTimeout)
      isShimmering.value = true
      activePage.value   = targetPage
      shimmerTimeout = setTimeout(() => {
        isShimmering.value = false
        shimmerTimeout     = null
      }, 800)
    })

    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'grup_hewan',
    }, (payload) => {
      console.log('[Monitor] DB terupdate:', payload)
      fetchGrupHewan()
    })

    .on('broadcast', { event: 'remote-reload' }, () => {
      console.log('[Monitor] Force reload diterima...')
      setTimeout(() => window.location.reload(), 300)
    })

    .on('broadcast', { event: 'update-hidden-groups' }, (payload) => {
      hiddenGroupIds.value = payload?.payload?.hiddenIds ?? []
    })

    .subscribe((status) => {
      console.log('[Monitor] Supabase Realtime:', status)
    })
})

onUnmounted(() => {
  if (timerClock)      clearInterval(timerClock)
  if (shimmerTimeout)  clearTimeout(shimmerTimeout)
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
})

// ── chunkedGrup ──
const ROWS_PER_PAGE = 10  // ← diubah dari 6 → 10

const chunkedGrup = computed(() => {
  if (!rawData.value?.length) return []

  const activeRows = rawData.value.filter(item =>
    !hiddenGroupIds.value.includes(String(item.id_grup ?? ''))
  )

  const mapped = activeRows.map((item, index) => ({
    displayIndex: index + 1,
    id:           item.id,
    idGrup:       String(item.id_grup ?? ''),
    animalName:   item.jenis_hewan ?? '—',
    owner:        item.nama ?? '—',
    s1:           item.grup_hewan?.status_kedatangan ?? 'Belum',
    s2:           item.grup_hewan?.status_sembelihan ?? 'Belum',
    s3:           item.grup_hewan?.status_pengulitan ?? 'Belum',
    s4:           item.grup_hewan?.status_pengemasan ?? 'Belum',
    notes:        item.grup_hewan?.keterangan        ?? '—',
  }))

  const pages = []
  for (let i = 0; i < mapped.length; i += ROWS_PER_PAGE) {
    pages.push(mapped.slice(i, i + ROWS_PER_PAGE))
  }
  return pages
})

const totalPages    = computed(() => chunkedGrup.value.length || 1)
const paginatedData = computed(() => chunkedGrup.value[activePage.value - 1] ?? [])

// ── Label header kolom ──
const stageHeaders = [
  { key: 's1', label: 'Kedatangan'      },
  { key: 's2', label: 'Sembelihan'      },
  { key: 's3', label: 'Pengulitan'      },
  { key: 's4', label: 'Siap Distribusi' },
]

// ── Statistik ──
const uniqueGrups = computed(() => {
  if (!rawData.value?.length) return []
  const seen = new Set()
  return rawData.value.filter(item => {
    const key = String(item.id_grup ?? '').toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const totalHewan   = computed(() => rawData.value?.length ?? 0)
const totalSapi    = computed(() => uniqueGrups.value.filter(i => String(i.jenis_hewan ?? '').toLowerCase() === 'sapi').length)
const totalKambingDomba = computed(() => {
  if (!uniqueGrups.value) return 0
  // Menyaring grup yang jenis_hewan-nya adalah Domba ATAU Kambing
  return uniqueGrups.value.filter(g => {
    const jenis = String(g.jenis_hewan ?? '').toLowerCase()
    return jenis === 'domba' || jenis === 'kambing'
  }).length
})
function stageCount(field) {
  const list       = uniqueGrups.value
  const total      = list.length || 1
  const doneStatus = field === 'status_kedatangan' ? 'Diterima' : 'Selesai'
  const selesai = list.filter(i => i.grup_hewan?.[field] === doneStatus).length
  const proses  = list.filter(i => i.grup_hewan?.[field] === 'Proses').length
  const belum   = list.filter(i => i.grup_hewan?.[field] === 'Belum').length
  return {
    selesai, proses, belum,
    pct:  Math.round((selesai / total) * 100),
    frac: `${selesai}/${list.length}`,
  }
}

const progKedatangan = computed(() => stageCount('status_kedatangan'))
const progSembelihan = computed(() => stageCount('status_sembelihan'))
const progPengulitan = computed(() => stageCount('status_pengulitan'))
const progPengemasan = computed(() => stageCount('status_pengemasan'))

const progressCards = [
  { key: 'kedatangan', label: 'Kedatangan',     prog: () => progKedatangan.value },
  { key: 'sembelihan', label: 'Sembelihan',      prog: () => progSembelihan.value },
  { key: 'pengulitan', label: 'Pengulitan',      prog: () => progPengulitan.value },
  { key: 'pengemasan', label: 'Siap Distribusi', prog: () => progPengemasan.value },
]

const summarySelesai = computed(() =>
  uniqueGrups.value.filter(i => i.grup_hewan?.status_pengemasan === 'Selesai').length
)
const summaryProses = computed(() =>
  uniqueGrups.value.filter(i => {
    const g = i.grup_hewan
    if (!g) return false
    const statuses = [
      g.status_kedatangan === 'Diterima' ? 'Selesai' : g.status_kedatangan,
      g.status_sembelihan,
      g.status_pengulitan,
      g.status_pengemasan,
    ]
    return statuses.some(s => s === 'Proses') && g.status_pengemasan !== 'Selesai'
  }).length
)
const summaryBelum = computed(() =>
  uniqueGrups.value.filter(i => {
    const g = i.grup_hewan
    if (!g) return true
    return (
      g.status_kedatangan === 'Belum' &&
      g.status_sembelihan  === 'Belum' &&
      g.status_pengulitan  === 'Belum' &&
      g.status_pengemasan  === 'Belum'
    )
  }).length
)

function statusClass(status) {
  if (status === 'Selesai')  return 'bg-qurban-green text-white'
  if (status === 'Proses')   return 'bg-qurban-orange text-white'
  if (status === 'Diterima') return 'bg-blue-600 text-white'
  return 'bg-qurban-red text-white'
}
function statusIcon(status) {
  if (status === 'Selesai')  return 'fas fa-check-circle mr-1'
  if (status === 'Proses')   return 'fas fa-spinner fa-spin mr-1'
  if (status === 'Diterima') return 'fas fa-circle-check mr-1'
  return 'fas fa-times-circle mr-1'
}
</script>

<template>
  <div id="viewport-wrapper">
    <div class="dashboard-container" id="dashboard">

      <!-- ── HEADER ── -->
      <header class="flex justify-between items-start px-6 py-3 pb-2 border-b-4 border-qurban-dark flex-shrink-0">

        <div class="flex items-center w-1/4">
          <div class="logo-img-wrapper">
            <img
              src="https://ahsan.tv/wp-content/uploads/2026/05/Logo-Ahsan-TV.webp"
              alt="Logo / Header Qurban"
              loading="eager"
            />
          </div>
        </div>

        <div class="text-center w-2/4 pt-1">
          <h2 class="text-xl font-bold text-qurban-dark tracking-wider mb-1">MONITOR ALUR KERJA (WORKFLOW)</h2>
          <h1 class="text-6xl font-extrabold text-qurban-dark mb-2 drop-shadow-sm">HEWAN QURBAN</h1>
          <div class="bg-qurban-dark text-white py-1.5 px-8 rounded-full inline-flex items-center gap-2 font-semibold text-base shadow-md">
            <i class="fas fa-calendar-alt"></i>
            Hari Idul Adha, 10 Dzulhijjah 1447H / 27 Mei 2026
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

      <!-- ── WORKFLOW STEPS + PROGRESS BAR ── -->
      <div class="flex justify-between items-center px-6 py-2 bg-slate-100 border-b-2 border-slate-300 gap-4 flex-shrink-0">

        <!-- Step 1: Kedatangan -->
        <div
          :class="['flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md step-card relative transition-colors duration-500',
            progKedatangan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']"
        >
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0',
            progKedatangan.pct === 100 ? 'bg-white text-emerald-800' : 'bg-step-blue text-white']">
            <i class="fas fa-truck"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progKedatangan.pct === 100 ? 'text-white' : 'text-step-blue']">1. KEDATANGAN</div>
            <div :class="['text-xs font-bold mt-0.5', progKedatangan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Hewan tiba di lokasi</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                class="h-2 rounded-full transition-all duration-700"
                :class="progKedatangan.pct === 100 ? 'bg-white' : 'bg-step-blue'"
                :style="{ width: progKedatangan.pct + '%' }"
              ></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progKedatangan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progKedatangan.pct }}% &nbsp;|&nbsp; {{ progKedatangan.frac }} HEWAN
            </div>
          </div>
          <div class="step-arrow"></div>
        </div>

        <!-- Step 2: Sembelihan -->
        <div
          :class="['flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md step-card relative ml-3 transition-colors duration-500',
            progSembelihan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']"
        >
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0',
            progSembelihan.pct === 100 ? 'bg-white text-emerald-800' : 'bg-step-green text-white']">
            <i class="fas fa-utensils"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progSembelihan.pct === 100 ? 'text-white' : 'text-step-green']">2. SEMBELIHAN</div>
            <div :class="['text-xs font-bold mt-0.5', progSembelihan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Proses penyembelihan</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                class="h-2 rounded-full transition-all duration-700"
                :class="progSembelihan.pct === 100 ? 'bg-white' : 'bg-step-green'"
                :style="{ width: progSembelihan.pct + '%' }"
              ></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progSembelihan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progSembelihan.pct }}% &nbsp;|&nbsp; {{ progSembelihan.frac }} HEWAN
            </div>
          </div>
          <div class="step-arrow"></div>
        </div>

        <!-- Step 3: Pengulitan -->
        <div
          :class="['flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md step-card relative ml-3 transition-colors duration-500',
            progPengulitan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']"
        >
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0',
            progPengulitan.pct === 100 ? 'bg-white text-emerald-800' : 'bg-step-orange text-white']">
            <i class="fas fa-scroll"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progPengulitan.pct === 100 ? 'text-white' : 'text-step-orange']">3. PENGULITAN</div>
            <div :class="['text-xs font-bold mt-0.5', progPengulitan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Pembersihan kulit</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                class="h-2 rounded-full transition-all duration-700"
                :class="progPengulitan.pct === 100 ? 'bg-white' : 'bg-step-orange'"
                :style="{ width: progPengulitan.pct + '%' }"
              ></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progPengulitan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progPengulitan.pct }}% &nbsp;|&nbsp; {{ progPengulitan.frac }} HEWAN
            </div>
          </div>
          <div class="step-arrow"></div>
        </div>

        <!-- Step 4: Siap Distribusi -->
        <div
          :class="['flex-1 border-2 border-slate-300 rounded-xl p-3 flex items-center gap-3 shadow-md ml-3 transition-colors duration-500',
            progPengemasan.pct === 100 ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700']"
        >
          <div :class="['w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0',
            progPengemasan.pct === 100 ? 'bg-white text-emerald-800' : 'bg-step-purple text-white']">
            <i class="fas fa-box-open"></i>
          </div>
          <div class="leading-tight flex-grow">
            <div :class="['font-black text-lg', progPengemasan.pct === 100 ? 'text-white' : 'text-step-purple']">4. SIAP DISTRIBUSI</div>
            <div :class="['text-xs font-bold mt-0.5', progPengemasan.pct === 100 ? 'text-emerald-200' : 'text-gray-600']">Pengemasan daging</div>
            <div class="mt-1.5 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                class="h-2 rounded-full transition-all duration-700"
                :class="progPengemasan.pct === 100 ? 'bg-white' : 'bg-step-purple'"
                :style="{ width: progPengemasan.pct + '%' }"
              ></div>
            </div>
            <div :class="['text-xs font-bold mt-0.5', progPengemasan.pct === 100 ? 'text-emerald-200' : 'text-slate-500']">
              PROSES: {{ progPengemasan.pct }}% &nbsp;|&nbsp; {{ progPengemasan.frac }} HEWAN
            </div>
          </div>
        </div>

      </div>

      <!-- ── DATA TABLE ── -->
      <div class="flex-grow px-6 py-1 overflow-hidden flex flex-col bg-white" style="height: calc(100vh - 420px); min-height: 0;">
        <table class="w-full qurban-table table-fixed h-full">
          <colgroup>
            <col style="width:4%"  />
            <col style="width:10%" />
            <col style="width:12%" />
            <col style="width:18%" />
            <col style="width:11%" />
            <col style="width:11%" />
            <col style="width:11%" />
            <col style="width:11%" />
            <col style="width:12%" />
          </colgroup>
          <thead>
            <tr>
              <th class="py-1.5 text-sm">No</th>
              <th class="py-1.5 text-sm">ID HEWAN</th>
              <th class="py-1.5 text-sm">JENIS HEWAN</th>
              <th class="py-1.5 text-sm">SOHIBUL QURBAN</th>
              <th class="py-1.5 text-sm bg-step-blue">KEDATANGAN</th>
              <th class="py-1.5 text-sm bg-step-green">SEMBELIHAN</th>
              <th class="py-1.5 text-sm bg-step-orange">PENGULITAN</th>
              <th class="py-1.5 text-sm bg-step-purple">SIAP DISTRIBUSI</th>
              <th class="py-1.5 text-sm bg-slate-700">KETERANGAN</th>
            </tr>
          </thead>
          <tbody :class="{ 'animate-shimmer': isShimmering }">
            <tr
              v-for="(row, i) in paginatedData"
              :key="`row-${activePage}-${row.id}`"
              :style="{ height: 'calc(100%/10)' }"
              :class="[i % 2 === 1 ? 'bg-slate-100' : 'bg-white', 'relative overflow-hidden']"
            >
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center text-sm">
                  {{ row.displayIndex }}
                </div>
              </td>
              <td class="text-qurban-dark font-black py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center text-lg">
                  {{ row.idGrup }}
                </div>
              </td>
              <td class="capitalize py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center text-lg">
                  <span>{{ row.animalName }}</span>
                </div>
              </td>
              <td class="text-left px-4 font-bold tracking-wide truncate py-0.5">
                <div class="animate-text-reveal w-full truncate text-left px-2 text-lg">
                  {{ row.owner }}
                </div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['px-2 py-1 rounded-full font-black text-lg inline-flex items-center', statusClass(row.s1)]">
                    <i :class="statusIcon(row.s1)"></i>{{ row.s1 }}
                  </span>
                </div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['px-2 py-1 rounded-full font-black text-lg inline-flex items-center', statusClass(row.s2)]">
                    <i :class="statusIcon(row.s2)"></i>{{ row.s2 }}
                  </span>
                </div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['px-2 py-1 rounded-full font-black text-lg inline-flex items-center', statusClass(row.s3)]">
                    <i :class="statusIcon(row.s3)"></i>{{ row.s3 }}
                  </span>
                </div>
              </td>
              <td class="py-0.5">
                <div class="animate-text-reveal w-full flex justify-center items-center">
                  <span :class="['px-2 py-1 rounded-full font-black text-lg inline-flex items-center', statusClass(row.s4)]">
                    <i :class="statusIcon(row.s4)"></i>{{ row.s4 }}
                  </span>
                </div>
              </td>
              <td class="text-left px-3 text-slate-600 font-semibold truncate py-0.5">
                <div class="animate-text-reveal w-full truncate text-xs italic">
                  {{ row.notes }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── BOTTOM SUMMARY ── -->
      <div class="px-6 py-2 flex gap-4 flex-shrink-0 bg-slate-50 border-t-2 border-slate-200" style="height: 260px;">

        <!-- Kiri: Ringkasan Total Hewan -->
        <div class="w-1/4 border-2 border-qurban-dark rounded-2xl flex flex-col bg-white overflow-hidden shadow-sm">
          <div class="bg-qurban-dark text-white text-center py-1.5 font-extrabold uppercase text-base tracking-wider">RINGKASAN TOTAL HEWAN</div>
          <div class="flex p-3 items-center justify-between h-full">
            <div class="text-center w-1/2">
              <div class="text-6xl font-black text-qurban-dark leading-none">{{ totalHewan }}</div>
              <div class="text-xs font-black text-gray-500 mt-1 tracking-wide">TOTAL SOHIBUL QURBAN</div>
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
                <span class="text-2xl font-black text-qurban-teal">{{ summarySelesai }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-black text-gray-500">PROSES</span>
                <span class="text-2xl font-black text-qurban-orange">{{ summaryProses }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-black text-gray-500">BELUM</span>
                <span class="text-2xl font-black text-qurban-red">{{ summaryBelum }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tengah: Progress Setiap Tahap -->
        <div class="flex-grow border-2 border-qurban-dark rounded-2xl flex flex-col bg-white overflow-hidden relative shadow-sm">
          <div class="bg-qurban-dark text-white text-center py-1.5 font-extrabold uppercase text-base tracking-wider">PROGRESS SETIAP TAHAP</div>
          <div class="flex justify-around items-center h-full pt-1 pb-5">

            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-blue font-black text-sm tracking-wide mb-1">1. KEDATANGAN</div>
              <div
                class="progress-circle mb-1"
                :style="`background: conic-gradient(#2b78e4 ${progKedatangan.pct}%, #e2e8f0 0); color: #2b78e4;`"
              ><span>{{ progKedatangan.pct }}%</span></div>
              <div class="text-qurban-dark font-black text-lg flex items-center gap-1 mt-1">
                <i class="fas fa-truck text-step-blue text-xs"></i> {{ progKedatangan.frac }}
              </div>
            </div>

            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-green font-black text-sm tracking-wide mb-1">2. SEMBELIHAN</div>
              <div
                class="progress-circle mb-1"
                :style="`background: conic-gradient(#27a844 ${progSembelihan.pct}%, #e2e8f0 0); color: #27a844;`"
              ><span>{{ progSembelihan.pct }}%</span></div>
              <div class="text-qurban-dark font-black text-lg flex items-center gap-1 mt-1">
                <i class="fas fa-utensils text-step-green text-xs"></i> {{ progSembelihan.frac }}
              </div>
            </div>

            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-orange font-black text-sm tracking-wide mb-1">3. PENGULITAN</div>
              <div
                class="progress-circle mb-1"
                :style="`background: conic-gradient(#fd7e14 ${progPengulitan.pct}%, #e2e8f0 0); color: #fd7e14;`"
              ><span>{{ progPengulitan.pct }}%</span></div>
              <div class="text-qurban-dark font-black text-lg flex items-center gap-1 mt-1">
                <i class="fas fa-scroll text-step-orange text-xs"></i> {{ progPengulitan.frac }}
              </div>
            </div>

            <div class="text-center flex flex-col items-center justify-center">
              <div class="text-step-purple font-black text-sm tracking-wide mb-1">4. SIAP DISTRIBUSI</div>
              <div
                class="progress-circle mb-1"
                :style="`background: conic-gradient(#6f42c1 ${progPengemasan.pct}%, #e2e8f0 0); color: #6f42c1;`"
              ><span>{{ progPengemasan.pct }}%</span></div>
              <div class="text-qurban-dark font-black text-lg flex items-center gap-1 mt-1">
                <i class="fas fa-box-open text-step-purple text-xs"></i> {{ progPengemasan.frac }}
              </div>
            </div>

          </div>
          <div class="absolute bottom-1 left-0 right-0 text-center text-xs italic text-slate-400 font-bold tracking-wide">
            *Data akan otomatis ter-update sesuai perkembangan di lapangan, <br>bila merasa namanya tidak ada disini bisa hubungi Tim Qurban AhsanTV
          </div>
        </div>

        <!-- Kanan: Keterangan Status + Info Halaman -->
        <div class="w-1/5 border-2 border-qurban-dark rounded-2xl flex flex-col bg-white overflow-hidden shadow-sm">
          <div class="bg-qurban-dark text-white text-center py-1.5 font-extrabold uppercase text-base tracking-wider">KETERANGAN STATUS</div>
          <div class="p-3 flex flex-col gap-3 justify-center h-full">
            <div class="flex items-center gap-3">
              <i class="fas fa-check-circle text-2xl text-qurban-green shrink-0"></i>
              <span class="font-bold text-slate-700 text-base">Selesai</span>
            </div>
            <div class="flex items-center gap-3">
              <i class="fas fa-clock text-2xl text-qurban-orange shrink-0"></i>
              <span class="font-bold text-slate-700 text-base">Sedang Proses</span>
            </div>
            <div class="flex items-center gap-3">
              <i class="fas fa-times-circle text-2xl text-qurban-red shrink-0"></i>
              <span class="font-bold text-slate-700 text-base">Belum Dimulai</span>
            </div>
            <div class="mt-1 pt-2 border-t border-slate-200 flex items-center gap-2">
              <i class="fas fa-tv text-qurban-dark text-base shrink-0"></i>
              <span class="text-sm font-black text-slate-600">
                HAL <span class="text-qurban-dark text-xl">{{ activePage }}</span>
                <span class="text-xs text-slate-400 ml-1">/ {{ totalPages }}</span>
              </span>
            </div>
          </div>
        </div>

      </div>

      <!-- ── FOOTER ── -->
      <div class="bg-qurban-dark text-white p-2 flex justify-between items-center px-6 mt-auto flex-shrink-0">
        <div class="flex items-center gap-4 text-xl font-medium">
          <i class="fas fa-book-open text-xl text-qurban-orange"></i>
          <span class="italic text-base font-semibold">
            "Maka laksanakanlah shalat karena Tuhanmu; dan berkurbanlah."
            <span class="text-sm text-slate-300 ml-2 font-normal">(QS. Al-Kautsar: 2)</span>
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
html, body {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

#viewport-wrapper {
  width: 100vw !important;
  height: 100vh !important;
  overflow: hidden !important;
}

.dashboard-container {
  width: 100vw;
  height: 100vh;
  background: white;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 12px solid #0f4c3a;
}

/* ── Table ── */
.qurban-table th {
  background-color: #0f4c3a;
  color: white;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 1.25rem;
  padding: 1vh 8px;
  border: 2px solid #1a6b52;
  text-align: center;
  vertical-align: middle;
}
.qurban-table td {
  padding: 0.2vh 4px !important;
  border: 2px solid #cbd5e1;
  text-align: center;
  vertical-align: middle;
  font-size: 1.4rem;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}
.qurban-table tr:nth-child(even) { background-color: #f1f5f9; }

/* ── Status badges ── */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 30px;
  font-size: 1.45rem;
  font-weight: 800;
}
.status-selesai   { color: #198754; }
.status-proses    { color: #f39c12; }
.status-belum     { color: #dc3545; }
.status-dibagikan { color: #20c997; }

/* ── Progress circles ── */
.progress-circle {
  position: relative;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.8rem;
  margin: 0 auto;
}
.progress-circle::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: white;
}
.progress-circle span { position: relative; z-index: 1; }

/* ── Step arrow ── */
.step-card { position: relative; }
.step-arrow {
  position: absolute;
  right: -24px;
  top: 50%;
  transform: translateY(-50%);
  width: 0; height: 0;
  border-top: 18px solid transparent;
  border-bottom: 18px solid transparent;
  border-left: 18px solid #cbd5e1;
  z-index: 10;
}

/* ── Logo wrapper ── */
.logo-img-wrapper {
  width: 237px;
  height: 130px;
  overflow: hidden;
  flex-shrink: 0;
}
.logo-img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

/* ── Date/time box ── */
#dt-box {
  border: 2px solid #0f4c3a;
  border-radius: 12px;
  overflow: hidden;
  width: 240px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  background: white;
}
#dt-box .dt-header {
  background: #0f4c3a;
  color: white;
  text-align: center;
  padding: 5px 0;
  font-weight: 700;
  letter-spacing: .12em;
  font-size: 0.8rem;
}
#dt-box .dt-body { padding: 10px 14px; }
#dt-box .dt-date-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
  color: #0f4c3a;
  font-weight: 600;
}
#dt-box .dt-date-row i { font-size: 1.5rem; margin-top: 2px; }
#dt-box .dt-masehi  { font-size: 1.05rem; line-height: 1.3; }
#dt-box .dt-hijri   { font-size: 0.8rem; opacity: .78; font-weight: 400; }
#dt-box .dt-time-row {
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #0f4c3a;
  font-weight: 700;
  font-size: 1.25rem;
}

/*
  ══════════════════════════════════════════
  SHIMMER REVEAL EFFECT — Master/Client Sync
  ══════════════════════════════════════════
*/

/* Layer sinar yang menyapu */
.animate-shimmer {
  position: relative;
  overflow: hidden;
}
.animate-shimmer::after {
  content: "";
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0)   0%,
    rgba(255, 255, 255, 0.3) 20%,
    rgba(255, 255, 255, 0.6) 50%,
    rgba(255, 255, 255, 0.3) 80%,
    rgba(255, 255, 255, 0)   100%
  );
  animation: shimmerSweep 0.9s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  pointer-events: none;
  z-index: 5;
}

/* Teks muncul dengan delay setelah sinar lewat */
.animate-text-reveal {
  opacity: 0;
  animation: textReveal 0.7s cubic-bezier(0.25, 1, 0.5, 1) 0.4s forwards;
}

/* Saat shimmer tidak aktif, konten harus tetap visible */
tbody:not(.animate-shimmer) .animate-text-reveal {
  opacity: 1;
  animation: none;
}

@keyframes shimmerSweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(110%); }
}

@keyframes textReveal {
  0%   { opacity: 0; transform: translateY(6px); filter: blur(3px); }
  100% { opacity: 1; transform: translateY(0);   filter: blur(0);   }
}
</style>