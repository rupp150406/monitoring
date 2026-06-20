<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue';

definePageMeta({ layout: false });

useHead({
  title: 'Admin Login — Qurban Monitor',
  meta: [
    { name: 'theme-color', content: '#003527' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'robots', content: 'noindex, nofollow' },
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css' },
  ],
});

// ─── State ────────────────────────────────────────────────────────────────────
const password   = ref('');
const showPass   = ref(false);
const isLoading  = ref(false);
const errorMsg   = ref('');
const inputRef   = ref<HTMLInputElement | null>(null);

// ─── Submit ───────────────────────────────────────────────────────────────────
async function handleSubmit(): Promise<void> {
  if (!password.value.trim() || isLoading.value) return;

  isLoading.value = true;
  errorMsg.value  = '';

  try {
    await $fetch('/api/admin-auth', {
      method: 'POST',
      body: { password: password.value },
    });

    // Cookie is set server-side; navigate to admin dashboard
    await navigateTo('/admin');
  } catch (err: unknown) {
    const msg = (err as { data?: { statusMessage?: string } })?.data?.statusMessage;
    errorMsg.value = msg ?? 'Terjadi kesalahan. Silakan coba lagi.';
    password.value = '';
    await nextTick();
    inputRef.value?.focus();
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  inputRef.value?.focus();
});
</script>

<template>
  <div class="login-root">

    <!-- Background decoration -->
    <div class="login-bg-pattern" aria-hidden="true"></div>

    <div class="login-card">

      <!-- Brand -->
      <div class="login-brand">
        <div class="login-brand-icon">
          <img src="https://ahsan.tv/wp-content/uploads/2026/05/Logo-Ahsan-TV.webp"/>
        </div>
        <div class="login-brand-text">
          <h1 class="login-title">Qurban Admin</h1>
          <p class="login-subtitle">AhsanTV Monitor System V2.0</p>
        </div>
      </div>

      <div class="login-divider"></div>

      <!-- Heading -->
      <div class="login-heading">
        <h2 class="login-heading-title">Masuk ke Dashboard</h2>
        <p class="login-heading-sub">Masukkan password admin untuk melanjutkan.</p>
      </div>

      <!-- Form -->
      <div class="login-form">

        <!-- Password field -->
        <div class="login-field">
          <label class="login-label" for="admin-password">
            <i class="fas fa-lock"></i>Password Admin
          </label>
          <div class="login-input-wrap" :class="{ 'login-input-wrap--error': errorMsg }">
            <i class="fas fa-key login-input-icon"></i>
            <input
              id="admin-password"
              ref="inputRef"
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              class="login-input"
              placeholder="Masukkan password..."
              autocomplete="current-password"
              :disabled="isLoading"
              @keydown.enter="handleSubmit"
            />
            <button
              type="button"
              class="login-toggle-pass"
              :title="showPass ? 'Sembunyikan password' : 'Tampilkan password'"
              @click="showPass = !showPass"
            >
              <i :class="showPass ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
            </button>
          </div>

          <!-- Error message -->
          <div v-if="errorMsg" class="login-error">
            <i class="fas fa-circle-exclamation"></i>
            {{ errorMsg }}
          </div>
        </div>

        <!-- Submit -->
        <button
          class="login-btn"
          :class="{ 'login-btn--loading': isLoading }"
          :disabled="isLoading || !password.trim()"
          @click="handleSubmit"
        >
          <i v-if="isLoading" class="fas fa-circle-notch fa-spin"></i>
          <i v-else class="fas fa-arrow-right-to-bracket"></i>
          {{ isLoading ? 'Memeriksa...' : 'Masuk ke Dashboard' }}
        </button>
      </div>

      <!-- Footer note -->
      <p class="login-note">
        <i class="fas fa-shield-halved"></i>
        Akses terbatas — hanya untuk Tim Qurban AhsanTV
      </p>

    </div>

    <!-- Bottom brand -->
    <p class="login-bottom-brand">AhsanTV Qurban Monitor System V2.0</p>

  </div>
</template>

<style>
/* ── Reset ─────────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; font-family: 'Inter', sans-serif; }

/* ── Root ───────────────────────────────────────────────────────────────────── */
.login-root {
  min-height: 100vh;
  background-color: #003527; /* primary */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

/* ── Subtle radial background pattern ──────────────────────────────────────── */
.login-bg-pattern {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%,   rgba(149,211,186,0.08) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 100% 100%, rgba(134,242,228,0.06) 0%, transparent 60%);
  pointer-events: none;
}

/* ── Card ───────────────────────────────────────────────────────────────────── */
.login-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background-color: #ffffff;
  border-radius: 0.75rem; /* rounded-xl */
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Brand ──────────────────────────────────────────────────────────────────── */
.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}
.login-brand-icon {
  width: 80px; height: 80px;
  border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  color: #95d3ba;
  font-size: 20px;
  flex-shrink: 0;
}
.login-brand-text { display: flex; flex-direction: column; gap: 2px; }
.login-title   { font-size: 20px; font-weight: 700; color: #003527; letter-spacing: -0.01em; line-height: 1; }
.login-subtitle{ font-size: 12px; color: #707974; font-weight: 400; }

/* ── Divider ────────────────────────────────────────────────────────────────── */
.login-divider { height: 1px; background-color: #E2E8F0; }

/* ── Heading ────────────────────────────────────────────────────────────────── */
.login-heading { display: flex; flex-direction: column; gap: 4px; }
.login-heading-title { font-size: 18px; font-weight: 600; color: #171c1f; letter-spacing: -0.01em; line-height: 28px; }
.login-heading-sub   { font-size: 13px; color: #707974; line-height: 18px; }

/* ── Form ───────────────────────────────────────────────────────────────────── */
.login-form  { display: flex; flex-direction: column; gap: 16px; }
.login-field { display: flex; flex-direction: column; gap: 6px; }
.login-label {
  font-size: 12px; font-weight: 600; color: #404944;
  letter-spacing: 0.04em; text-transform: uppercase;
  display: flex; align-items: center; gap: 6px;
}
.login-label i { color: #006a61; font-size: 11px; }

/* Input wrapper */
.login-input-wrap {
  position: relative;
  display: flex; align-items: center;
  border: 1.5px solid #bfc9c3;
  border-radius: 0.375rem;
  background-color: #f6fafe;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}
.login-input-wrap:focus-within {
  border-color: #006a61;
  box-shadow: 0 0 0 3px rgba(0, 106, 97, 0.12);
  background-color: #ffffff;
}
.login-input-wrap--error {
  border-color: #EF4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.10);
}
.login-input-wrap--error:focus-within {
  border-color: #EF4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}

.login-input-icon {
  position: absolute; left: 12px;
  color: #707974; font-size: 12px; pointer-events: none;
  flex-shrink: 0;
}

.login-input {
  flex: 1;
  background: transparent;
  border: none; outline: none;
  font-family: 'Inter', sans-serif;
  font-size: 14px; color: #171c1f;
  padding: 10px 40px 10px 34px;
  width: 100%;
  letter-spacing: 0.04em;
}
.login-input::placeholder { color: #bfc9c3; letter-spacing: 0; }
.login-input:disabled     { opacity: 0.6; cursor: not-allowed; }

.login-toggle-pass {
  position: absolute; right: 10px;
  background: transparent; border: none; cursor: pointer;
  color: #707974; font-size: 13px; padding: 4px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 0.25rem;
  transition: color 0.15s ease;
}
.login-toggle-pass:hover { color: #006a61; }

/* Error text */
.login-error {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 500; color: #EF4444;
  padding: 6px 10px;
  background-color: #FEE2E2;
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 0.375rem;
  animation: login-shake 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
@keyframes login-shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-6px); }
  40%       { transform: translateX(6px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}

/* Submit button */
.login-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 11px 20px;
  background-color: #003527;
  color: #ffffff;
  border: none; border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  letter-spacing: 0.01em;
}
.login-btn:hover:not(:disabled) {
  background-color: #064e3b;
  box-shadow: 0 4px 12px rgba(0, 53, 39, 0.3);
}
.login-btn:active:not(:disabled) { transform: scale(0.98); }
.login-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.login-btn--loading { opacity: 0.75; cursor: wait; }

/* ── Footer note ────────────────────────────────────────────────────────────── */
.login-note {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 11px; color: #707974;
  text-align: center; line-height: 16px;
}
.login-note i { color: #006a61; font-size: 11px; flex-shrink: 0; }

/* ── Bottom brand ───────────────────────────────────────────────────────────── */
.login-bottom-brand {
  position: relative;
  margin-top: 24px;
  font-size: 11px; font-weight: 600;
  color: rgba(149, 211, 186, 0.5);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ── Scrollbar ──────────────────────────────────────────────────────────────── */
::-webkit-scrollbar       { width: 5px; }
::-webkit-scrollbar-track { background: #f0f4f8; }
::-webkit-scrollbar-thumb { background: #bfc9c3; border-radius: 3px; }
</style>