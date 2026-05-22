<template>
  <div class="flex h-screen overflow-hidden text-slate-800 bg-slate-50 dark:text-slate-100 dark:bg-slate-950 transition-colors duration-200">

    <!-- ── Main Content ── -->
    <main class="flex-1 flex flex-col w-full h-full bg-slate-50 dark:bg-slate-950 transition-colors duration-200">

      <!-- TopNavBar -->
      <header class="bg-white dark:bg-slate-900 flex justify-between items-center w-full px-6 py-3 max-w-container-max mx-auto border-b border-slate-200 dark:border-slate-800 z-10 shrink-0 transition-colors duration-200">
        <div class="flex items-center gap-4">
          <h1 class="text-headline-md font-headline-md font-bold text-emerald-700 dark:text-emerald-400">Qurban Admin Panel</h1>
        </div>
        <div class="flex items-center">
          <button
            class="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            @click="toggleTheme"
          >
            <span class="material-symbols-outlined" :class="{ 'hidden': isDark }">dark_mode</span>
            <span class="material-symbols-outlined" :class="{ 'hidden': !isDark }">light_mode</span>
          </button>
        </div>
      </header>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto p-gutter table-container">
        <div class="max-w-container-max mx-auto space-y-gutter">

          <!-- Live Sync State Bar -->
          <div class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm transition-colors duration-200">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-emerald-600 dark:text-emerald-400">cast</span>
              <span class="text-data-mono font-data-mono text-emerald-700 dark:text-emerald-400 font-bold">
                TV DISPLAY MONITOR: HALAMAN [ {{ activePage }} ]
              </span>
            </div>
            <div class="flex gap-1 overflow-x-auto pb-1 max-w-full">
              <button
                v-for="p in 11"
                :key="p"
                class="w-8 h-8 rounded text-label-bold font-label-bold flex items-center justify-center shrink-0 transition-colors duration-200"
                :class="p === activePage
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
                @click="activePage = p"
              >
                {{ p }}
              </button>
            </div>
          </div>

          <!-- Stat Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              v-for="stat in stats"
              :key="stat.label"
              class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-200"
            >
              <div class="text-body-sm font-body-sm text-slate-500 dark:text-slate-400 mb-1">{{ stat.label }}</div>
              <div class="text-headline-lg font-headline-lg" :class="stat.colorClass">{{ stat.value }}</div>
            </div>
          </div>

          <!-- Search -->
          <div class="relative">
            <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari ID Grup, Nama Shohibul, atau Jenis Hewan..."
              class="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-body-md font-body-md text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-sm transition-all duration-200"
            />
          </div>

          <!-- Data Table -->
          <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors duration-200">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
                    <th class="py-3 px-4 text-label-bold font-label-bold text-slate-500 dark:text-slate-400 w-12 text-center">NO</th>
                    <th class="py-3 px-4 text-label-bold font-label-bold text-slate-500 dark:text-slate-400 w-32">ID GRUP</th>
                    <th class="py-3 px-4 text-label-bold font-label-bold text-slate-500 dark:text-slate-400 w-64">INFO HEWAN &amp; PESERTA</th>
                    <th class="py-3 px-4 text-label-bold font-label-bold text-slate-500 dark:text-slate-400 text-center w-48">
                      <i class="fa-solid fa-knife mr-1"></i> PENYEMBELIHAN
                    </th>
                    <th class="py-3 px-4 text-label-bold font-label-bold text-slate-500 dark:text-slate-400 text-center w-48">
                      <i class="fa-solid fa-skin mr-1"></i> PENGAKAPAN
                    </th>
                    <th class="py-3 px-4 text-label-bold font-label-bold text-slate-500 dark:text-slate-400 text-center w-48">
                      <i class="fa-solid fa-box mr-1"></i> PENCACAHAN
                    </th>
                    <th class="py-3 px-4 text-label-bold font-label-bold text-slate-500 dark:text-slate-400 text-center w-48">
                      <i class="fa-solid fa-truck mr-1"></i> DISTRIBUSI
                    </th>
                  </tr>
                </thead>
                <tbody class="text-body-sm font-body-sm text-slate-700 dark:text-slate-300">
                  <tr
                    v-for="(hewan, i) in filteredRows"
                    :key="hewan.id_grup"
                    class="border-b border-slate-200 dark:border-slate-800 transition-colors duration-200"
                    :class="i % 2 === 1
                      ? 'bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'"
                  >
                    <td class="py-4 px-4 text-center text-data-mono font-data-mono text-slate-500 dark:text-slate-400">{{ i + 1 }}</td>
                    <td class="py-4 px-4">
                      <div class="inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-2 py-1 rounded text-label-bold font-label-bold transition-colors duration-200">
                        {{ hewan.id_grup }}
                      </div>
                    </td>
                    <td class="py-4 px-4">
                      <div class="font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2 transition-colors duration-200">
                        <i :class="['fa-solid', hewan.jenis_hewan === 'sapi' ? 'fa-cow' : 'fa-sheep', hewan.jenis_hewan === 'sapi' ? 'text-emerald-600 dark:text-emerald-500' : 'text-status-pending']"></i>
                        {{ hewan.nama_grup }}
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight transition-colors duration-200">
                        {{ hewan.peserta }}
                      </div>
                    </td>
                    <!-- Status columns -->
                    <td v-for="(statusKey, si) in ['status_sembelihan', 'status_pengulitan', 'status_pencacahan', 'status_distribusi']" :key="si" class="py-4 px-2">
                      <div class="flex justify-center bg-slate-100 dark:bg-slate-950 rounded-lg p-1 w-fit mx-auto border border-slate-200 dark:border-slate-800 transition-colors duration-200">
                        <button
                          v-for="opt in ['belum', 'proses', 'selesai']"
                          :key="opt"
                          class="status-btn px-2 py-1 text-[11px] rounded-md"
                          :class="[opt, { active: hewan[statusKey] === opt }, opt !== 'belum' ? 'mx-1' : '']"
                          @click="updateStatus(hewan.id_grup, statusKey, opt)"
                        >
                          {{ opt.charAt(0).toUpperCase() + opt.slice(1) }}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
const supabase = useSupabaseClient()
useHead({
  title: 'Qurban Workflow Admin',
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
    },
    {
      rel: 'stylesheet',
      href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    },
  ],
})

// ── Dark mode ──
const isDark = ref(false)

onMounted(() => {
  const saved = localStorage.getItem('color-theme')
  isDark.value = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark.value)
})

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('color-theme', isDark.value ? 'dark' : 'light')
}

// ── Page selector ──
const activePage = ref(1)

// ── Stats ──
const stats = [
  { label: 'Total Hewan',         value: 124, colorClass: 'text-emerald-700 dark:text-emerald-400' },
  { label: 'Sembelihan Selesai',  value: 89,  colorClass: 'text-status-completed' },
  { label: 'Proses Pencacahan',   value: 15,  colorClass: 'text-status-pending' },
  { label: 'Menunggu',            value: 20,  colorClass: 'text-status-unpaid' },
]

const { data: dataGrup, refresh } = useAsyncData('grup_hewan', async () => {
  const { data, error } = await supabase
    .from('grup_hewan')
    .select('*')
    .order('id_grup', { ascending: true })
  if (error) console.error(error)
  return data
})

// ── Search ──
const searchQuery = ref('')
const filteredRows = computed(() => {
  if (!searchQuery.value) return tableRows
  const q = searchQuery.value.toLowerCase()
  return tableRows.filter(r =>
    r.id.toLowerCase().includes(q) ||
    r.name.toLowerCase().includes(q) ||
    r.participants.toLowerCase().includes(q)
  )
})

// ── Status update ──
async function updateStatus(idGrup, kolom, statusBaru) {
  const { error } = await supabase
    .from('grup_hewan')
    .update({ [kolom]: statusBaru })
    .eq('id_grup', idGrup)
  if (error) console.error(error)
  else refresh()
}
</script>

<style scoped>
.material-symbols-outlined {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.table-container::-webkit-scrollbar { width: 8px; height: 8px; }
.table-container::-webkit-scrollbar-track { background: #334155; }
.table-container::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
.table-container::-webkit-scrollbar-thumb:hover { background: #64748b; }

:global(html:not(.dark)) .table-container::-webkit-scrollbar-track { background: #e2e8f0; }
:global(html:not(.dark)) .table-container::-webkit-scrollbar-thumb { background: #cbd5e1; }
:global(html:not(.dark)) .table-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

.status-btn {
  border: 1px solid #334155;
  background-color: transparent;
  color: #94A3B8;
  transition: all 0.2s ease;
  cursor: pointer;
}
:global(html:not(.dark)) .status-btn {
  border: 1px solid #cbd5e1;
  color: #64748b;
}

.status-btn.belum.active  { background-color: rgba(239, 68, 68, 0.2); color: #FCA5A5; border-color: #EF4444; font-weight: 600; }
.status-btn.proses.active { background-color: rgba(217, 119, 6, 0.2); color: #FCD34D; border-color: #D97706; font-weight: 600; }
.status-btn.selesai.active{ background-color: rgba(22, 163, 74, 0.2); color: #86EFAC; border-color: #16A34A; font-weight: 600; }

:global(html:not(.dark)) .status-btn.belum.active  { background-color: rgba(239, 68, 68, 0.1); color: #DC2626; border-color: #EF4444; }
:global(html:not(.dark)) .status-btn.proses.active { background-color: rgba(217, 119, 6, 0.1); color: #D97706; border-color: #D97706; }
:global(html:not(.dark)) .status-btn.selesai.active{ background-color: rgba(22, 163, 74, 0.1); color: #16A34A; border-color: #16A34A; }
</style>