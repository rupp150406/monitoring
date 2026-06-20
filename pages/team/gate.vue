<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabaseClient } from '#imports'
import { useStateLock } from '@/composables/useQurbanEngine'
import type { UserRole } from '@/composables/useQurbanEngine'

// ─── Route Guard ──────────────────────────────────────────────────────────────
const route  = useRoute()
const router = useRouter()

const isAuthorized = ref(false)

onMounted(() => {
  if (route.query.access !== 'mediapass') {
    isAuthorized.value = false
    router.push('/')
    return
  }
  isAuthorized.value = true
})

// ─── Form State ───────────────────────────────────────────────────────────────
const operatorName = ref<string>('')
const selectedRole = ref<UserRole>('sembelihan')

// ─── Composable (for setActorIdentity) ────────────────────────────────────────
const { setActorIdentity } = useStateLock()

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = useSupabaseClient()

const isLoading = ref(false)
const errorMsg  = ref<string | null>(null)

// ─── Submit Handler ───────────────────────────────────────────────────────────
async function handleSubmit() {
  errorMsg.value = null

  if (!operatorName.value.trim()) {
    alert('Nama petugas tidak boleh kosong.')
    return
  }

  isLoading.value = true

  try {
    const { data, error } = await supabase
      .from('users')
      .insert([{ nama: operatorName.value.trim(), role: selectedRole.value }])
      .select()
      .single()

    if (error) throw error

    // ── Persist session ────────────────────────────────────────────────────
    // Full session blob (used by gate itself / future pages)
    localStorage.setItem(
      'qurban_team_session',
      JSON.stringify({ id: data.id, nama: data.nama, role: data.role })
    )

    // setActorIdentity writes all three flat keys:
    //   qurban_actor_id, qurban_actor_name, qurban_actor_role
    // This is the single source of truth — useStateLock reads these on mount.
    setActorIdentity(data.id, data.nama, data.role as UserRole)

    router.push('/team')
  } catch (err: any) {
    errorMsg.value = err?.message ?? 'Terjadi kesalahan. Silakan coba lagi.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <!-- Authorised view -->
  <div v-if="isAuthorized" class="gate-root">
    <main class="gate-card">

      <!-- Header -->
      <div class="gate-header">
        <h1 class="gate-title">AHSANTV QURBAN 2</h1>
        <p class="gate-subtitle">Portal Tim Media Lapangan</p>
      </div>

      <!-- Form -->
      <div class="gate-form">

        <!-- Nama Petugas -->
        <div class="field-group">
          <label class="field-label" for="operator-name">NAMA PETUGAS</label>
          <input
            id="operator-name"
            v-model="operatorName"
            class="field-input"
            name="operator-name"
            type="text"
            placeholder="Masukkan nama lengkap..."
          />
        </div>

        <!-- Pos Tugas -->
        <div class="field-group">
          <label class="field-label">POS TUGAS LAPANGAN</label>
          <div class="radio-group">

            <!-- Penyembelihan -->
            <label class="radio-card" :class="{ 'radio-card--checked': selectedRole === 'sembelihan' }">
              <input v-model="selectedRole" class="sr-only" name="post-selection" type="radio" value="sembelihan" />
              <span class="material-symbols-outlined radio-icon">agriculture</span>
              <span class="radio-label">Pos Area Penyembelihan</span>
              <div class="radio-dot" :class="{ 'radio-dot--checked': selectedRole === 'sembelihan' }"></div>
            </label>

            <!-- Pengulitan -->
            <label class="radio-card" :class="{ 'radio-card--checked': selectedRole === 'pengulitan' }">
              <input v-model="selectedRole" class="sr-only" name="post-selection" type="radio" value="pengulitan" />
              <span class="material-symbols-outlined radio-icon">content_cut</span>
              <span class="radio-label">Pos Area Pengulitan</span>
              <div class="radio-dot" :class="{ 'radio-dot--checked': selectedRole === 'pengulitan' }"></div>
            </label>

          </div>
        </div>

        <!-- Error -->
        <p v-if="errorMsg" class="gate-error">{{ errorMsg }}</p>

        <!-- Submit -->
        <button
          type="button"
          class="gate-btn"
          :class="{ 'gate-btn--loading': isLoading }"
          :disabled="isLoading"
          @click="handleSubmit"
        >
          <span v-if="isLoading" class="material-symbols-outlined btn-spinner">progress_activity</span>
          {{ isLoading ? 'MEMPROSES...' : 'MASUK POS TUGAS' }}
        </button>

      </div>
    </main>
  </div>

  <!-- Blank fallback — no UI flash on unauthorised redirect -->
  <div v-else class="gate-blank" />
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

/* ── Tokens ─────────────────────────────────────────────────────────────────── */
:root {
  --color-surface:             #f6fafe;
  --color-surface-low:         #f0f4f8;
  --color-surface-card:        #ffffff;
  --color-on-surface:          #171c1f;
  --color-on-surface-variant:  #404944;
  --color-outline-variant:     #bfc9c3;
  --color-outline:             #707974;
  --color-primary:             #003527;
  --color-primary-container:   #064e3b;
  --color-on-primary:          #ffffff;
  --color-border-subtle:       #E2E8F0;
}

/* ── Root / Page ─────────────────────────────────────────────────────────────── */
.gate-root {
  font-family: 'Inter', sans-serif;
  background-color: var(--color-surface);
  min-height: max(884px, 100dvh);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  -webkit-font-smoothing: antialiased;
}

.gate-blank {
  min-height: 100dvh;
  background-color: #000;
}

/* ── Card ────────────────────────────────────────────────────────────────────── */
.gate-card {
  width: 100%;
  max-width: 340px;
  background-color: var(--color-surface-card);
  border: 1px solid var(--color-border-subtle);
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
  padding: 1rem;
  position: relative;
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.gate-header {
  text-align: center;
  margin-bottom: 1rem;
}

.gate-title {
  color: var(--color-on-surface);
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.gate-subtitle {
  color: #9ca3af;
  font-size: 13px;
  line-height: 18px;
  font-weight: 400;
}

/* ── Form ────────────────────────────────────────────────────────────────────── */
.gate-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Field ───────────────────────────────────────────────────────────────────── */
.field-group {
  display: flex;
  flex-direction: column;
}

.field-label {
  display: block;
  color: var(--color-on-surface-variant);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.field-input {
  width: 100%;
  background-color: var(--color-surface-low);
  border: 1px solid var(--color-outline-variant);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  color: var(--color-on-surface);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 20px;
  transition: box-shadow 0.15s, border-color 0.15s;
  outline: none;
  box-sizing: border-box;
}

.field-input::placeholder {
  color: #6b7280;
}

.field-input:focus {
  border-color: transparent;
  box-shadow: 0 0 0 2px var(--color-primary);
}

/* ── Radio Group ─────────────────────────────────────────────────────────────── */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.radio-card {
  display: flex;
  align-items: center;
  width: 100%;
  background-color: var(--color-surface-low);
  border: 2px solid var(--color-outline-variant);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  box-sizing: border-box;
}

.radio-card:hover {
  border-color: var(--color-outline);
}

.radio-card--checked {
  border-color: var(--color-primary-container);
  background-color: rgba(149, 211, 186, 0.12);
}

.radio-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 22px;
  color: var(--color-on-surface-variant);
  margin-right: 0.75rem;
  flex-shrink: 0;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.radio-label {
  color: var(--color-on-surface);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  flex: 1;
}

.radio-dot {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 2px solid #4b5563;
  flex-shrink: 0;
  transition: border-color 0.15s, background-color 0.15s;
}

.radio-dot--checked {
  border-color: #10B981;
  background-color: #FFB84A;
}

/* ── Error ───────────────────────────────────────────────────────────────────── */
.gate-error {
  font-size: 13px;
  color: #ef4444;
  text-align: center;
  margin: 0;
}

/* ── Button ──────────────────────────────────────────────────────────────────── */
.gate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: var(--color-primary);
  color: var(--color-on-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: none;
  border-radius: 0.5rem;
  padding: 0.75rem 1.5rem;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s, opacity 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  margin-top: 1rem;
}

.gate-btn:hover {
  background-color: var(--color-primary-container);
}

.gate-btn:active {
  transform: scale(0.95);
}

.gate-btn:disabled,
.gate-btn--loading {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Spinner ─────────────────────────────────────────────────────────────────── */
.btn-spinner {
  font-family: 'Material Symbols Outlined';
  font-size: 16px;
  margin-right: 0.5rem;
  animation: spin 1s linear infinite;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Accessibility: visually hidden ──────────────────────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>