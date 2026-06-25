<script setup lang="ts">

const props = defineProps<{
  error: {
    statusCode: number
    statusMessage?: string
    message?: string
  }
}>()
const is404 = computed(() => props.error?.statusCode === 404)

const title = computed(() =>
  is404.value ? 'Halaman Tidak Ditemukan' : 'Terjadi Kesalahan'
)

const description = computed(() =>
  is404.value
    ? 'Maaf, tautan pos lapangan atau data grup hewan yang Anda cari tidak tersedia atau salah ketik.'
    : props.error?.message || 'Terjadi kesalahan yang tidak terduga. Silakan coba lagi.'
)

const statusCode = computed(() => props.error?.statusCode ?? 500)

function handleBack() {
  window.location.href = '/team'
}
</script>

<template>
  <div
    class="
      text-white font-sans antialiased
      w-full min-h-screen flex flex-col items-center justify-center
      bg-cover bg-center bg-fixed px-6
    "
    :style="{
      backgroundImage:
        'linear-gradient(to bottom, rgba(2,5,2,0.4), rgba(2,5,2,0.8)), url(https://ahsan.tv/wp-content/uploads/2026/06/sky.webp)',
    }"
  >
    <main
      class="w-full max-w-sm mx-auto flex flex-col items-center justify-center text-center z-10 gap-6"
    >
      <!-- Error Code -->
      <h1
        class="
          text-[80px] md:text-[120px]
          font-black tracking-tighter leading-none
          select-none opacity-90
        "
      >
        {{ statusCode }}
      </h1>

      <!-- Content -->
      <div class="space-y-3">
        <h2 class="text-xl md:text-3xl font-bold tracking-tight">
          {{ title }}
        </h2>
        <p class="text-[#9CA3AF] text-sm md:text-base leading-relaxed">
          {{ description }}
        </p>
      </div>

      <!-- Action Button -->
      <button
        class="
          mt-2
          bg-[#10B981] hover:bg-emerald-400
          text-[#020502] font-extrabold text-sm md:text-base tracking-wide
          py-3 px-10 rounded-full
          transition-all duration-200 uppercase
          focus:outline-none focus:ring-4 focus:ring-emerald-500/50
          shadow-lg shadow-emerald-900/20
          cursor-pointer whitespace-nowrap
        "
        @click="handleBack"
      >
        KEMBALI KE BERANDA
      </button>
    </main>
  </div>
</template>