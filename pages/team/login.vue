<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSupabaseClient } from '#imports'
import { useStateLock } from '@/composables/useQurbanEngine'
import type { UserRole } from '@/composables/useQurbanEngine'

// ─── Page meta ────────────────────────────────────────────────────────────────
definePageMeta({ layout: false })

const router   = useRouter()
const supabase = useSupabaseClient()
const { setActorIdentity } = useStateLock()

// ─── Modal visibility ─────────────────────────────────────────────────────────
const isVisible = ref(false)

// ─── Guard: skip modal if already logged in ───────────────────────────────────
onMounted(() => {
  const name = (window.localStorage.getItem('qurban_actor_name') ?? '').trim()
  if (name) {
    router.replace('/team')
    return
  }
  // Small delay so the backdrop transition plays on entry
  requestAnimationFrame(() => { isVisible.value = true })
})

// ─── Dismiss: back to /team ───────────────────────────────────────────────────
function dismiss() {
  isVisible.value = false
  setTimeout(() => router.replace('/team'), 250)
}

// ─── Form state ───────────────────────────────────────────────────────────────
const operatorCodename = ref<string>('')
const isLoading    = ref(false)
const errorMsg     = ref<string | null>(null)

// ─── Submit ───────────────────────────────────────────────────────────────────
async function handleSubmit() {
  errorMsg.value = null

  const codename = operatorCodename.value.trim()

  if (!codename) {
    errorMsg.value = 'Kode masuk tidak boleh kosong.'
    return
  }

  isLoading.value = true

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, nama, codename, role')
      // case-insensitive exact match (escape LIKE wildcards in user input)
      .ilike('codename', codename.replace(/[\%_]/g, '\$&'))
      .single()

    if (error || !data) {
      errorMsg.value = 'Kode masuk tidak ditemukan. Pastikan sudah terdaftar.'
      return
    }

    localStorage.setItem(
      'qurban_team_session',
      JSON.stringify({ id: data.id, nama: data.nama, role: data.role })
    )

    setActorIdentity(data.id, data.nama, data.role as UserRole)

    window.location.href = '/team'
  } catch (err: any) {
    errorMsg.value = err?.message ?? 'Terjadi kesalahan. Silakan coba lagi.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <!-- Backdrop — tap outside = dismiss -->
  <Transition name="backdrop">
    <div v-if="isVisible" class="backdrop" @click.self="dismiss">

      <!-- Sheet — slides up from bottom -->
      <Transition name="sheet">
        <div v-if="isVisible" class="sheet" @click.stop>

          <!-- Drag handle -->
          <div class="sheet-handle" />

          <!-- Back button row -->
          <div class="sheet-topbar">
            <button class="back-btn" @click="dismiss">
              <span class="back-label">Kembali</span>
            </button>
            <span class="team-pill">TIM LAPANGAN</span>
          </div>

          <!-- Header -->
          <header class="login-header">
            <div class="login-icon-wrap">
              <span class="material-symbols-outlined login-icon">person</span>
            </div>
            <h1 class="login-title">AhsanTV Qurban</h1>
            <p class="login-subtitle">Portal Login Tim Lapangan</p>
          </header>

          <!-- Form -->
          <div class="login-form">

            <!-- Input -->
            <div class="field-group">
              <label class="field-label" for="operator_codename">Nama Sandi</label>
              <div class="field-input-wrap">
                <span class="material-symbols-outlined field-icon">person</span>
                <input
                  id="operator_codename"
                  v-model="operatorCodename"
                  class="field-input"
                  type="text"
                  placeholder="Masukkan nama sandi..."
                  @keyup.enter="handleSubmit"
                />
              </div>
            </div>

            <!-- Error -->
            <p v-if="errorMsg" class="login-error">{{ errorMsg }}</p>

            <!-- Submit -->
            <button
              type="button"
              class="login-btn"
              :class="{ 'login-btn--loading': isLoading }"
              :disabled="isLoading"
              @click="handleSubmit"
            >
              <span v-if="isLoading" class="material-symbols-outlined btn-spinner">progress_activity</span>
              <span v-else class="material-symbols-outlined btn-icon">arrow_forward</span>
              <span class="btn-label">{{ isLoading ? 'MEMVERIFIKASI...' : 'Verifikasi Akses' }}</span>
            </button>

          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

/* ── Backdrop ────────────────────────────────────────────────────────────────── */
.backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(10, 14, 19, 0.94);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

/* ── Bottom sheet ────────────────────────────────────────────────────────────── */
.sheet {
  width: 100%;
  max-width: 480px;
  box-sizing: border-box;
  background-color: #11171E;
  border: none;
  border-radius: 28px 28px 0 0;
  padding: 20px 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.55);
  color: #ffffff;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Drag handle ─────────────────────────────────────────────────────────────── */
.sheet-handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background-color: #1B2530;
  margin: 0 auto;
  flex: 0 0 auto;
}

/* ── Topbar (back button + team pill) ────────────────────────────────────────── */
.sheet-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 29px;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.login-icon-wrap {
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  border-radius: 100px;
  background-color: #1B2530;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 24px;
  color: #34D399;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.login-title {
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-size: 24px;
  line-height: 29px;
  font-weight: 900;
  letter-spacing: 0;
  color: #FFFFFF;
}

.login-subtitle {
  margin: 0;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: #9AA7B5;
}

/* ── Form ────────────────────────────────────────────────────────────────────── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  line-height: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7D8A99;
}

.field-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  box-sizing: border-box;
  padding: 0 16px;
  background-color: #0A0E13;
  border: 1px solid transparent;
  border-radius: 24px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field-input-wrap:focus-within {
  border-color: rgba(52, 211, 153, 0.6);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.15);
}

.field-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 16px;
  color: #7D8A99;
  flex: 0 0 auto;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.field-input {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  outline: none;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
  color: #EDF2F7;
  box-sizing: border-box;
}

.field-input::placeholder {
  color: #5B6776;
  font-size: 13px;
  font-weight: 400;
}

/* ── Error ───────────────────────────────────────────────────────────────────── */
.login-error {
  margin: 0;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 500;
  color: #F87171;
  text-align: center;
  background-color: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.22);
  border-radius: 12px;
  padding: 10px 12px;
}

/* ── Submit button ───────────────────────────────────────────────────────────── */
.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 58px;
  box-sizing: border-box;
  padding: 0 18px;
  background-color: #34D399;
  color: #052E22;
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  line-height: 17px;
  font-weight: 800;
  letter-spacing: 0.04em;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s;
}

.login-btn:hover { background-color: #4ADE80; }
.login-btn:active { transform: scale(0.98); }
.login-btn:disabled,
.login-btn--loading { opacity: 0.55; cursor: not-allowed; }

.btn-label {
  display: inline-block;
}

.btn-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 16px;
  color: #052E22;
  flex: 0 0 auto;
  font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

/* ── Spinner ─────────────────────────────────────────────────────────────────── */
.btn-spinner {
  font-family: 'Material Symbols Outlined';
  font-size: 18px;
  color: #052E22;
  flex: 0 0 auto;
  animation: spin 1s linear infinite;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Back button ─────────────────────────────────────────────────────────────── */
.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: #34D399;
  transition: color 0.2s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}
.back-btn:hover  { color: #6EE7B7; }
.back-btn:active { transform: scale(0.95); }

.back-label {
  font-family: 'Montserrat', sans-serif;
  font-size: 12px;
  line-height: 15px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ── Team pill ───────────────────────────────────────────────────────────────── */
.team-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background-color: #271F45;
  color: #C4B5FD;
  font-family: 'Montserrat', sans-serif;
  font-size: 10px;
  line-height: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* ── Transitions ─────────────────────────────────────────────────────────────── */
.backdrop-enter-active { transition: opacity 0.4s ease; }
.backdrop-leave-active { transition: opacity 0.2s ease; }
.backdrop-enter-from,
.backdrop-leave-to     { opacity: 0; }

/* Sheet slides up slowly from below the viewport */
.sheet-enter-active {
  transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}
/* Exit stays under the 250ms dismiss timeout so it is never cut off */
.sheet-leave-active {
  transition: transform 0.22s cubic-bezier(0.4, 0, 1, 1);
  will-change: transform;
}
.sheet-enter-from,
.sheet-leave-to     { transform: translateY(100%); }
</style>