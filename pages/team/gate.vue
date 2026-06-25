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

    localStorage.setItem(
      'qurban_team_session',
      JSON.stringify({ id: data.id, nama: data.nama, role: data.role })
    )

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
        <div class="gate-badge">SISTEM MONITOR</div>
        <h1 class="gate-title">AHSANTV QURBAN 2</h1>
        <p class="gate-subtitle">Portal Tim Media Lapangan</p>
      </div>

      <!-- Divider -->
      <div class="gate-divider" />

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

  <!-- Blank fallback -->
  <div v-else class="gate-blank" />
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');

/* ── Tokens ─────────────────────────────────────────────────────────────────── */
:root {
  --color-bg:                  #0a1a14;
  --color-bg-mid:              #0f2318;
  --color-surface-card:        #111f18;
  --color-surface-input:       #0d1a13;
  --color-on-surface:          #ffffff;
  --color-on-surface-muted:    #6b9980;
  --color-outline-subtle:      #1e3a2b;
  --color-outline:             #2a5040;
  --color-primary:             #10B981;
  --color-primary-dim:         #059669;
  --color-primary-glow:        rgba(16, 185, 129, 0.15);
  --color-accent:              #FFB84A;
  --color-danger:              #f87171;
}

/* ── Root / Page ─────────────────────────────────────────────────────────────── */
.gate-root {
  font-family: 'Inter', sans-serif;
  background-color: var(--color-bg);
  background-image:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 70%),
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(0,53,39,0.4) 0%, transparent 70%);
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
  border: 1px solid var(--color-outline-subtle);
  border-radius: 1rem;
  box-shadow:
    0 0 0 1px rgba(16,185,129,0.06),
    0 25px 50px -12px rgba(0,0,0,0.6),
    0 0 60px -20px rgba(16,185,129,0.1);
  padding: 1.25rem;
  position: relative;
  overflow: hidden;
}

/* subtle top edge glow */
.gate-card::before {
  content: '';
  position: absolute;
  inset: 0;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(16,185,129,0.5), transparent);
  pointer-events: none;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.gate-header {
  text-align: center;
  margin-bottom: 1rem;
}

.gate-badge {
  display: inline-block;
  background-color: rgba(16,185,129,0.12);
  color: var(--color-primary);
  border: 1px solid rgba(16,185,129,0.25);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 0.2rem 0.75rem;
  margin-bottom: 0.75rem;
  text-transform: uppercase;
}

.gate-title {
  color: var(--color-on-surface);
  font-size: 22px;
  line-height: 28px;
  font-weight: 800;
  letter-spacing: 0.06em;
  margin-bottom: 0.35rem;
}

.gate-subtitle {
  color: var(--color-on-surface-muted);
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
}

/* ── Divider ─────────────────────────────────────────────────────────────────── */
.gate-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-outline), transparent);
  margin-bottom: 1rem;
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
  color: var(--color-on-surface-muted);
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.field-input {
  width: 100%;
  background-color: var(--color-surface-input);
  border: 1px solid var(--color-outline-subtle);
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
  color: #3d6652;
}

.field-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-glow);
}

/* ── Radio Group ─────────────────────────────────────────────────────────────── */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.radio-card {
  display: flex;
  align-items: center;
  width: 100%;
  background-color: var(--color-surface-input);
  border: 1px solid var(--color-outline-subtle);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}

.radio-card:hover {
  border-color: var(--color-outline);
  background-color: rgba(16,185,129,0.04);
}

.radio-card--checked {
  border-color: var(--color-primary);
  background-color: var(--color-primary-glow);
  box-shadow: 0 0 0 1px rgba(16,185,129,0.15);
}

.radio-icon {
  font-family: 'Material Symbols Outlined';
  font-size: 20px;
  color: var(--color-primary);
  margin-right: 0.75rem;
  flex-shrink: 0;
  font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
}

.radio-label {
  color: var(--color-on-surface);
  font-size: 13px;
  line-height: 20px;
  font-weight: 400;
  flex: 1;
}

.radio-dot {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 2px solid var(--color-outline);
  flex-shrink: 0;
  transition: border-color 0.15s, background-color 0.15s;
}

.radio-dot--checked {
  border-color: var(--color-primary);
  background-color: var(--color-accent);
}

/* ── Error ───────────────────────────────────────────────────────────────────── */
.gate-error {
  font-size: 12px;
  color: var(--color-danger);
  text-align: center;
  margin: 0;
  background-color: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.2);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
}

/* ── Button ──────────────────────────────────────────────────────────────────── */
.gate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: var(--color-primary);
  color: #021a10;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: none;
  border-radius: 0.5rem;
  padding: 0.875rem 1.5rem;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s, opacity 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 20px -4px rgba(16,185,129,0.4);
  margin-top: 0.5rem;
}

.gate-btn:hover {
  background-color: #34d399;
  box-shadow: 0 4px 24px -4px rgba(16,185,129,0.6);
}

.gate-btn:active {
  transform: scale(0.97);
}

.gate-btn:disabled,
.gate-btn--loading {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
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