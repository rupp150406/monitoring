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
const operatorName = ref<string>('')
const isLoading    = ref(false)
const errorMsg     = ref<string | null>(null)

// ─── Submit ───────────────────────────────────────────────────────────────────
async function handleSubmit() {
  errorMsg.value = null

  if (!operatorName.value.trim()) {
    errorMsg.value = 'Nama tidak boleh kosong.'
    return
  }

  isLoading.value = true

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, nama, role')
      .ilike('nama', operatorName.value.trim())
      .single()

    if (error || !data) {
      errorMsg.value = 'Nama tidak ditemukan. Pastikan sudah terdaftar.'
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
              <span class="material-symbols-outlined back-icon">arrow_back</span>
              <span class="back-label">Kembali</span>
            </button>
          </div>

          <!-- Top glow line -->
          <div class="card-glow-line" />

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
              <label class="field-label" for="operator_name">Nama Petugas</label>
              <input
                id="operator_name"
                v-model="operatorName"
                class="field-input"
                type="text"
                placeholder="Masukkan nama lengkap..."
                @keyup.enter="handleSubmit"
              />
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
              {{ isLoading ? 'MEMVERIFIKASI...' : 'Verifikasi Akses' }}
            </button>

          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

/* ── Backdrop ────────────────────────────────────────────────────────────────── */
.backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

/* ── Bottom sheet ────────────────────────────────────────────────────────────── */
.sheet {
  width: 100%;
  max-width: 480px;
  background: linear-gradient(160deg, rgba(4,51,40,0.97) 0%, rgba(2,26,20,0.99) 100%);
  border: 1px solid rgba(255,255,255,0.06);
  border-bottom: none;
  border-radius: 1.5rem 1.5rem 0 0;
  padding: 0 1.5rem 2rem;
  position: relative;
  overflow: hidden;
  box-shadow:
    0 -8px 40px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Drag handle ─────────────────────────────────────────────────────────────── */
.sheet-handle {
  width: 2.5rem;
  height: 4px;
  border-radius: 9999px;
  background-color: rgba(255,255,255,0.2);
  margin: 0.75rem auto 0;
}

/* ── Topbar (back button row) ────────────────────────────────────────────────── */
.sheet-topbar {
  display: flex;
  align-items: center;
  padding: 0.75rem 0 0.25rem;
}

/* ── Top glow line ───────────────────────────────────────────────────────────── */
.card-glow-line {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(16,185,129,0.4), transparent);
  pointer-events: none;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin: 1rem 0 1.75rem;
}

.login-icon-wrap {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 1rem;
  background-color: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.login-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 26px;
  color: #10B981;
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.login-title {
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #ffffff;
  margin-bottom: 0.375rem;
}

.login-subtitle {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
}

/* ── Form ────────────────────────────────────────────────────────────────────── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.6);
  padding-left: 0.25rem;
}

.field-input {
  width: 100%;
  background-color: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.875rem;
  padding: 0.9rem 1.1rem;
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #ffffff;
  outline: none;
  transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.field-input::placeholder { color: rgba(255,255,255,0.25); }

.field-input:focus {
  background-color: rgba(255,255,255,0.1);
  border-color: #10B981;
  box-shadow: 0 0 0 3px rgba(16,185,129,0.15);
}

/* ── Error ───────────────────────────────────────────────────────────────────── */
.login-error {
  font-size: 12px;
  color: #f87171;
  text-align: center;
  background-color: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.2);
  border-radius: 0.75rem;
  padding: 0.625rem 1rem;
  margin: 0;
}

/* ── Submit button ───────────────────────────────────────────────────────────── */
.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  background-color: #10B981;
  color: #ffffff;
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  font-weight: 700;
  border: none;
  border-radius: 9999px;
  padding: 0.9rem 1.5rem;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s;
  box-shadow: 0 0 20px rgba(16,185,129,0.3);
  margin-top: 0.25rem;
}

.login-btn:hover  { background-color: #34D399; box-shadow: 0 0 28px rgba(16,185,129,0.5); }
.login-btn:active { transform: scale(0.97); }
.login-btn:disabled,
.login-btn--loading { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

/* ── Spinner ─────────────────────────────────────────────────────────────────── */
.btn-spinner {
  font-family: 'Material Symbols Outlined';
  font-size: 18px;
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
  gap: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  color: #80bea6;
  transition: color 0.2s, transform 0.1s;
  -webkit-tap-highlight-color: transparent;
}
.back-btn:hover  { color: #10B981; }
.back-btn:active { transform: scale(0.95); }

.back-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 20px;
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.back-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* ── Transitions ─────────────────────────────────────────────────────────────── */
.backdrop-enter-active,
.backdrop-leave-active { transition: opacity 0.25s ease; }
.backdrop-enter-from,
.backdrop-leave-to     { opacity: 0; }

.sheet-enter-active,
.sheet-leave-active { transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
.sheet-enter-from,
.sheet-leave-to     { transform: translateY(100%); }
</style>