<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useStateLock } from '@/composables/useQurbanEngine';

definePageMeta({ layout: 'lapangan' });

useHead({
  title: 'Qurban Scan | Scanner Lapangan',
  meta: [
    { name: 'theme-color', content: '#ffffff' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
  ],
});

// ─── Composable ───────────────────────────────────────────────────────────────
const {
  currentGrup, activeAction, isLoading, isSubmitting,
  hasError, errorMessage, actorName, actorId, actorRole,
  onQrCodeScanned, executeAction, setActorIdentity, resetToScanMode,
} = useStateLock();

// ─── Role helpers ─────────────────────────────────────────────────────────────
// Maps each role to the phases it is allowed to advance
type UserRole = 'sembelihan' | 'pengulitan' | 'ketua';

/**
 * Returns which "next action" the current actor's role permits on this grup.
 *
 * Phase flow (QR-scan driven transitions only):
 *   1. Kedatangan  : Belum → Diterima        (all roles)
 *   2. Sembelihan  : Kedatangan=Diterima → Sembelihan=Selesai  (sembelihan | ketua)
 *   3. Pengulitan  : Sembelihan=Selesai → Pengulitan=Proses    (pengulitan | ketua)
 *
 * Pengulitan Proses→Selesai and Distribusi are handled by timers on another page.
 */
type AllowedAction =
  | { key: 'kedatangan';  label: string }
  | { key: 'sembelihan';  label: string }
  | { key: 'pengulitan';  label: string }
  | { disabled: true;     reason: string };

const resolvedAction = computed<AllowedAction | null>(() => {
  if (!currentGrup.value) return null;

  const role = (actorRole.value ?? '') as UserRole | '';
  const g    = currentGrup.value;

  const isKetua      = role === 'ketua';
  const isSembelihan = role === 'sembelihan';
  const isPengulitan = role === 'pengulitan';

  // ── Step 1: Kedatangan — accessible by ALL roles ──────────────────────────
  if (g.status_kedatangan !== 'Diterima' && g.status_kedatangan !== 'Selesai') {
    // Any valid role may confirm arrival
    if (isKetua || isSembelihan || isPengulitan) {
      return { key: 'kedatangan', label: 'KONFIRMASI KEDATANGAN' };
    }
    return { disabled: true, reason: 'Anda tidak memiliki akses untuk fase ini' };
  }

  // ── Step 2: Sembelihan — only 'sembelihan' or 'ketua' ────────────────────
  if (g.status_kedatangan === 'Diterima' && g.status_sembelihan !== 'Selesai') {
    if (isKetua || isSembelihan) {
      return { key: 'sembelihan', label: 'KONFIRMASI SEMBELIHAN' };
    }
    // Pengulitan role: show disabled with reason
    return {
      disabled: true,
      reason: isPengulitan
        ? 'Hewan belum melewati fase Sembelihan. Tunggu petugas Sembelihan.'
        : 'Anda tidak memiliki akses untuk fase Sembelihan',
    };
  }

  // ── Step 3: Pengulitan (Proses) — only 'pengulitan' or 'ketua' ───────────
  if (g.status_sembelihan === 'Selesai' && g.status_pengulitan !== 'Proses' && g.status_pengulitan !== 'Selesai') {
    if (isKetua || isPengulitan) {
      return { key: 'pengulitan', label: 'MULAI PENGULITAN' };
    }
    return {
      disabled: true,
      reason: isSembelihan
        ? 'Hewan sudah selesai disembelih. Serahkan ke area Pengulitan.'
        : 'Anda tidak memiliki akses untuk fase Pengulitan',
    };
  }

  // ── All QR-driven phases complete ─────────────────────────────────────────
  return { disabled: true, reason: 'Semua fase QR telah selesai ✓' };
});

// ─── Operator name ────────────────────────────────────────────────────────────
const operatorNameInput = ref<string>('');
onMounted(() => { operatorNameInput.value = actorName.value ?? 'Panitia Lapangan'; });

function commitOperatorName() {
  const name = operatorNameInput.value.trim() || 'Panitia Lapangan';
  operatorNameInput.value = name;
  setActorIdentity(actorId.value || 'anonymous', name);
}

// ─── QR Scanner ──────────────────────────────────────────────────────────────
const READER_ID         = 'qr-reader-scan-gate';
const readerEl          = ref<HTMLElement | null>(null);
const camError          = ref<string>('');
const isScannerRunning  = ref(false);
const isScannerMounting = ref(false);
let Html5QrcodeCtor: any = null;
let scannerInstance: any = null;
const router = useRouter();

// Flash & camera switch state
const isFlashOn        = ref(false);
const isFrontCamera    = ref(false);
const availableCameras = ref<{ id: string; label: string }[]>([]);
const currentCamIndex  = ref(0);

async function initLibrary(): Promise<boolean> {
  if (Html5QrcodeCtor) return true;
  try {
    const mod = await import('html5-qrcode');
    Html5QrcodeCtor = mod.Html5Qrcode;
    return true;
  } catch {
    camError.value = 'Library html5-qrcode tidak ditemukan. Jalankan: npm i html5-qrcode';
    return false;
  }
}

async function loadCameras() {
  try {
    const cams = await Html5QrcodeCtor.getCameras();
    if (cams && cams.length > 0) availableCameras.value = cams;
  } catch {}
}

function getActiveCameraConfig(): { deviceId: string } | { facingMode: string } {
  const cams = availableCameras.value;
  if (cams.length === 0) {
    return isFrontCamera.value ? { facingMode: 'user' } : { facingMode: 'environment' };
  }
  if (cams.length === 1) return { deviceId: cams[0].id };
  const backs  = cams.filter((c) => /back|rear|environment/i.test(c.label));
  const fronts = cams.filter((c) => /front|user|face/i.test(c.label));
  if (isFrontCamera.value) {
    return fronts.length > 0 ? { deviceId: fronts[0].id } : { facingMode: 'user' };
  }
  if (backs.length > 0) return { deviceId: backs[currentCamIndex.value % backs.length].id };
  return { deviceId: cams[currentCamIndex.value % cams.length].id };
}

function getQrboxSize(): number {
  if (typeof window === 'undefined') return 240;
  const shortest = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(180, Math.min(280, Math.floor(shortest * 0.65)));
}

async function startScanner() {
  if (isScannerRunning.value || isScannerMounting.value) return;
  if (typeof window === 'undefined') return;
  camError.value = '';
  isFlashOn.value = false;
  isScannerMounting.value = true;
  const ok = await initLibrary();
  if (!ok || !Html5QrcodeCtor) { isScannerMounting.value = false; return; }
  await loadCameras();
  let attempts = 0;
  while (attempts < 20) {
    await nextTick();
    if (readerEl.value && readerEl.value.offsetWidth > 0 && readerEl.value.offsetHeight > 0) break;
    await new Promise((r) => setTimeout(r, 50));
    attempts++;
  }
  if (!readerEl.value || readerEl.value.offsetWidth === 0) {
    camError.value = 'Kontainer kamera belum siap. Coba lagi.';
    isScannerMounting.value = false;
    return;
  }
  const cameraConfig = getActiveCameraConfig();
  const qrboxSize    = getQrboxSize();
  scannerInstance    = new Html5QrcodeCtor(READER_ID, false);
  try {
    await scannerInstance.start(
      cameraConfig,
      { fps: 10, qrbox: { width: qrboxSize, height: qrboxSize }, aspectRatio: 1.333, disableFlip: false },
      async (decodedText: string) => { await stopScanner(); handleQrScanned(decodedText); },
      () => {},
    );
    isScannerRunning.value  = true;
    isScannerMounting.value = false;
  } catch (err) {
    isScannerMounting.value = false;
    isScannerRunning.value  = false;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('NotFoundError') || msg.includes('not granted')) {
      camError.value = 'Izin kamera ditolak. Buka Pengaturan browser → Izin Situs → aktifkan Kamera untuk halaman ini.';
    } else if (msg.includes('Overconstrained') || msg.includes('OverconstrainedError')) {
      try {
        await scannerInstance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: qrboxSize, height: qrboxSize } },
          async (decodedText: string) => { await stopScanner(); handleQrScanned(decodedText); },
          () => {},
        );
        isScannerRunning.value = true;
      } catch (fallbackErr) {
        const fb = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        camError.value = `Kamera tidak dapat dibuka: ${fb}`;
      }
    } else {
      camError.value = `Kamera error: ${msg}`;
    }
  }
}

async function stopScanner() {
  if (!scannerInstance) return;
  try { await scannerInstance.stop(); } catch {}
  try { scannerInstance.clear(); } catch {}
  scannerInstance         = null;
  isScannerRunning.value  = false;
  isScannerMounting.value = false;
  isFlashOn.value         = false;
}

// ─── Flash toggle ─────────────────────────────────────────────────────────────
async function toggleFlash() {
  if (!scannerInstance || !isScannerRunning.value) return;
  try {
    const caps  = await scannerInstance.getRunningTrackCameraCapabilities();
    const torch = caps.torchFeature();
    if (!torch.isSupported()) return;
    if (isFlashOn.value) {
      await torch.apply(false);
      isFlashOn.value = false;
    } else {
      await torch.apply(true);
      isFlashOn.value = true;
    }
  } catch {}
}

// ─── Switch camera ────────────────────────────────────────────────────────────
async function switchCamera() {
  const wasRunning = isScannerRunning.value;
  await stopScanner();
  isFrontCamera.value = !isFrontCamera.value;
  if (wasRunning) {
    await nextTick();
    await startScanner();
  }
}

const showCameraZone = computed(() => !currentGrup.value && !isLoading.value);

// ─── Success overlay ──────────────────────────────────────────────────────────
const showSuccessOverlay = ref(false);
const successLabel       = ref('');
let _successTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Audio ────────────────────────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      _audioCtx = new AC();
    }
    return _audioCtx;
  } catch { return null; }
}

async function playBeep(type: 'success' | 'error') {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'success' ? 880 : 280;
    osc.type = 'square';
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (type === 'success' ? 0.16 : 0.3));
    osc.start(t);
    osc.stop(t + (type === 'success' ? 0.18 : 0.32));
  } catch {}
}

function warmAudio() {
  getAudioContext();
  document.removeEventListener('touchstart', warmAudio);
  document.removeEventListener('click', warmAudio);
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

// ─── QR / Action handlers ─────────────────────────────────────────────────────
function handleQrScanned(qr: string) {
  showSuccessOverlay.value = false;
  vibrate(50);
  onQrCodeScanned(qr.trim().toUpperCase());
}

async function goBack() {
  await stopScanner();
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push('/team');
  }
}

async function handleExecuteAction() {
  if (!resolvedAction.value || 'disabled' in resolvedAction.value) return;

  // Pass the resolved action key so the composable knows which phase to advance
  await executeAction(resolvedAction.value.key);

  if (!hasError.value && currentGrup.value) {
    successLabel.value       = resolvedAction.value.label;
    showSuccessOverlay.value = true;
    playBeep('success');
    vibrate([60, 40, 120]);
    if (_successTimer) clearTimeout(_successTimer);
    _successTimer = setTimeout(async () => {
      showSuccessOverlay.value = false;
      resetToScanMode();
      await nextTick();
      await nextTick();
      startScanner();
    }, 2800);
  } else if (hasError.value) {
    playBeep('error');
    vibrate([80, 30, 80]);
  }
}

async function handleReset() {
  if (_successTimer) clearTimeout(_successTimer);
  showSuccessOverlay.value = false;
  await stopScanner();
  resetToScanMode();
  await nextTick();
  await nextTick();
  startScanner();
}

// ─── Computed labels & states ─────────────────────────────────────────────────
const grupActionLabel = computed(() => {
  if (!resolvedAction.value) return 'MEMUAT DATA...';
  if ('disabled' in resolvedAction.value) return resolvedAction.value.reason;
  return resolvedAction.value.label;
});

const isActionDisabled = computed(() =>
  !resolvedAction.value ||
  'disabled' in resolvedAction.value ||
  isSubmitting.value
);

// Role display helpers
const roleLabel = computed(() => {
  const r = actorRole.value as UserRole | null;
  if (r === 'ketua')      return { text: 'Ketua',      cls: 'role-badge--ketua' };
  if (r === 'sembelihan') return { text: 'Sembelihan', cls: 'role-badge--sembelihan' };
  if (r === 'pengulitan') return { text: 'Pengulitan', cls: 'role-badge--pengulitan' };
  return { text: 'Tamu',  cls: 'role-badge--guest' };
});

// ─── Phase status helpers ─────────────────────────────────────────────────────
function phaseStatus(val: string): 'completed' | 'active' | 'pending' {
  if (val === 'Selesai' || val === 'Diterima') return 'completed';
  if (val === 'Proses') return 'active';
  return 'pending';
}
function phaseRowClass(status: string): string {
  if (status === 'completed') return 'phase-row--completed';
  if (status === 'active')    return 'phase-row--active';
  return 'phase-row--pending';
}
function phaseAccentClass(status: string): string {
  if (status === 'completed') return 'bg-green';
  if (status === 'active')    return 'bg-amber';
  return 'bg-muted';
}
function phaseEyebrowClass(status: string): string {
  if (status === 'active')    return 'clr-amber';
  if (status === 'completed') return 'clr-muted';
  return 'clr-subtle';
}
function phaseBadgeClass(status: string): string {
  if (status === 'completed') return 'phase-badge--completed';
  if (status === 'active')    return 'phase-badge--active';
  return 'phase-badge--pending';
}

function animalIcon(j?: string | null): string {
  const jl = (j ?? '').toLowerCase();
  if (jl === 'sapi')    return '🐄';
  if (jl === 'kambing') return '🐐';
  if (jl === 'domba')   return '🐑';
  return '🐾';
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  if (typeof window === 'undefined') return;
  document.addEventListener('touchstart', warmAudio, { passive: true, once: true });
  document.addEventListener('click', warmAudio, { once: true });
  nextTick(() => startScanner());
});

onUnmounted(async () => {
  if (_successTimer) clearTimeout(_successTimer);
  document.removeEventListener('touchstart', warmAudio);
  document.removeEventListener('click', warmAudio);
  await stopScanner();
  if (_audioCtx) { try { await _audioCtx.close(); } catch {} _audioCtx = null; }
});
</script>

<template>
  <div class="page-root">

    <!-- ── TOP NAV ─────────────────────────────────────────────────────────── -->
    <nav class="topnav">
      <div class="topnav-inner">
        <!-- Left: back + operator -->
        <div class="flex items-center gap-2">
          <button class="back-btn" type="button" aria-label="Kembali" @click="goBack">
            <span class="material-symbols-outlined" style="font-size:22px">arrow_back</span>
          </button>
          <!-- Operator name + role badge (desktop) -->
          <div class="op-badge-wrap hidden sm:flex">
            <span class="op-badge">{{ operatorNameInput || 'Panitia Lapangan' }}</span>
            <div class="flex items-center gap-1.5">
              <span class="op-badge-sub">Operator</span>
              <span class="role-badge" :class="roleLabel.cls">{{ roleLabel.text }}</span>
            </div>
          </div>
        </div>

        <!-- Center: title -->
        <span class="topnav-title">QURBAN SCANNER</span>

        <!-- Right: operator badge (mobile) -->
        <div class="flex items-center gap-1.5 sm:hidden">
          <span 
            v-if="operatorNameInput" 
            class="role-badge" 
            :class="roleLabel.cls"
          >
            {{ roleLabel.text }}
          </span>
          
          <span class="op-badge-pill">
            {{ operatorNameInput || 'Jamaah' }}
          </span>
        </div>
      </div>
    </nav>

    <!-- ── ERROR BANNER ──────────────────────────────────────────────────────── -->
    <Transition name="banner">
      <div v-if="hasError" class="error-banner">
        <span class="error-icon">!</span>
        <span class="error-msg">{{ errorMessage }}</span>
        <button class="error-dismiss" @click="handleReset">TUTUP</button>
      </div>
    </Transition>

    <!-- ── SCROLLABLE MAIN ───────────────────────────────────────────────────── -->
    <main class="main-scroll">

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!--  CAMERA ZONE                                                        -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <div v-if="showCameraZone">

        <div class="camera-block">
          <!-- Live badge -->
          <div class="live-badge">
            <span class="live-dot"></span>
            <span class="live-label">LIVE</span>
          </div>

          <!-- QR reader viewport (4:3) -->
          <div class="camera-viewport">
            <div :id="READER_ID" ref="readerEl" class="w-full h-full block" />

            <!-- Mounting spinner -->
            <div v-if="isScannerMounting && !camError" class="cam-state-overlay">
              <div class="spinner-ring"></div>
              <span class="cam-state-text">Membuka kamera...</span>
            </div>

            <!-- Camera error -->
            <Transition name="fade">
              <div v-if="camError" class="cam-state-overlay cam-error-bg">
                <div class="cam-error-icon-wrap">
                  <span class="material-symbols-outlined" style="font-size:28px;color:#ef4444">no_photography</span>
                </div>
                <span class="cam-error-msg">{{ camError }}</span>
                <button class="retry-btn" @click="() => { camError = ''; startScanner(); }">
                  <span class="material-symbols-outlined" style="font-size:16px">refresh</span>
                  Coba Lagi
                </button>
              </div>
            </Transition>
          </div>

          <!-- Camera controls strip -->
          <div class="cam-controls">
            <button
              class="cam-ctrl-btn"
              :class="{ 'cam-ctrl-btn--active': isFlashOn }"
              :disabled="!isScannerRunning"
              @click="toggleFlash"
            >
              <span class="material-symbols-outlined" style="font-size:20px">
                {{ isFlashOn ? 'flash_on' : 'flash_off' }}
              </span>
              Flash
            </button>
            <button
              class="cam-ctrl-btn"
              :disabled="!isScannerRunning"
              @click="switchCamera"
            >
              <span class="material-symbols-outlined" style="font-size:20px">cameraswitch</span>
              {{ isFrontCamera ? 'Depan' : 'Ubah' }}
            </button>
          </div>
        </div>

        <!-- Hint text below camera -->
        <div class="scan-hint-strip">
          <span class="material-symbols-outlined hint-icon">qr_code_2</span>
          <p class="hint-text">Arahkan QR Code ke bingkai untuk memindai</p>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!--  LOADING STATE                                                      -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <div v-if="isLoading" class="loading-state">
        <div class="spinner-ring spinner-ring--green"></div>
        <span class="loading-text">Mengambil data dari server...</span>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!--  DETAIL ZONE (after scan)                                          -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <div v-if="currentGrup && !isLoading" class="detail-zone">

        <!-- ── Identity card ──────────────────────────────────────────────── -->
        <div class="card">
          <div class="flex items-start justify-between mb-3">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="id-chip">{{ currentGrup.id_grup }}</span>
                <span v-if="currentGrup.is_timer_active" class="timer-badge">
                  <span class="material-symbols-outlined" style="font-size:12px">hourglass_bottom</span>
                  TIMER AKTIF
                </span>
              </div>
              <div class="flex items-center gap-2.5">
                <span style="font-size:2rem;line-height:1">{{ animalIcon(currentGrup.jenis_hewan) }}</span>
                <h1 class="animal-name">{{ currentGrup.jenis_hewan ?? '—' }}</h1>
              </div>
            </div>
            <span class="scan-ok-badge">
              <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1">check_circle</span>
              Terpindai
            </span>
          </div>
          <p v-if="currentGrup.label_tampilan" class="label-tampilan">{{ currentGrup.label_tampilan }}</p>
        </div>

        <!-- ── Scan detail: fase + operator + role ───────────────────────── -->
        <div class="card">
          <div class="grid grid-cols-2 gap-3">
            <div class="detail-cell">
              <p class="detail-cell-label">Fase Berikutnya</p>
              <p class="detail-cell-value">
                <template v-if="resolvedAction && !('disabled' in resolvedAction)">
                  {{ resolvedAction.label }}
                </template>
                <template v-else>
                  <span class="text-muted-sm">{{ resolvedAction ? resolvedAction.reason : '—' }}</span>
                </template>
              </p>
            </div>
            <div class="detail-cell">
              <p class="detail-cell-label">Operator</p>
              <p class="detail-cell-value">{{ operatorNameInput || 'Panitia' }}</p>
              <span class="role-badge mt-1" :class="roleLabel.cls">{{ roleLabel.text }}</span>
            </div>
          </div>
        </div>

        <!-- ── Role access notice (shown when action is blocked) ──────────── -->
        <Transition name="fade">
          <div
            v-if="resolvedAction && 'disabled' in resolvedAction"
            class="role-notice"
          >
            <span class="material-symbols-outlined role-notice-icon">lock</span>
            <div>
              <p class="role-notice-title">Akses Dibatasi</p>
              <p class="role-notice-msg">{{ resolvedAction.reason }}</p>
            </div>
          </div>
        </Transition>

        <!-- ── Sohibul card ────────────────────────────────────────────────── -->
        <div class="card">
          <p class="card-section-label">
            Sohibul Qurban
            <span v-if="currentGrup.sohibul_qurban?.length" class="text-[#006a61] font-bold">
              ({{ currentGrup.sohibul_qurban.length }})
            </span>
          </p>
          <div v-if="currentGrup.sohibul_qurban && currentGrup.sohibul_qurban.length > 0" class="sohibul-box">
            <p class="sohibul-names">
              {{ currentGrup.sohibul_qurban.map((s: any) => s.nama).join(', ') }}
            </p>
          </div>
          <p v-else class="empty-text">Belum ada anggota tercatat</p>
        </div>

        <!-- ── Phase status ────────────────────────────────────────────────── -->
        <div>
          <p class="section-heading">Status Fase</p>
          <div class="flex flex-col gap-3">

            <!-- Fase 1: Kedatangan -->
            <div class="phase-row" :class="phaseRowClass(phaseStatus(currentGrup.status_kedatangan))">
              <div class="phase-accent" :class="phaseAccentClass(phaseStatus(currentGrup.status_kedatangan))"></div>
              <div
                v-if="phaseStatus(currentGrup.status_kedatangan) === 'active'"
                class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 border-white animate-pulse"
                :class="phaseAccentClass(phaseStatus(currentGrup.status_kedatangan))"
              ></div>
              <div class="phase-body">
                <p class="phase-eyebrow" :class="phaseEyebrowClass(phaseStatus(currentGrup.status_kedatangan))">
                  {{ phaseStatus(currentGrup.status_kedatangan) === 'active' ? 'FASE BERIKUTNYA' : 'FASE 1' }}
                </p>
                <p class="phase-title" :class="phaseStatus(currentGrup.status_kedatangan) === 'active' ? 'phase-title--active' : ''">
                  Kedatangan
                </p>
                <p class="phase-access-hint">Semua petugas</p>
              </div>
              <span class="phase-badge" :class="phaseBadgeClass(phaseStatus(currentGrup.status_kedatangan))">
                {{ phaseStatus(currentGrup.status_kedatangan) === 'active' ? 'Dalam Antrian' : currentGrup.status_kedatangan }}
              </span>
            </div>

            <!-- Fase 2: Sembelihan -->
            <div class="phase-row" :class="phaseRowClass(phaseStatus(currentGrup.status_sembelihan))">
              <div class="phase-accent" :class="phaseAccentClass(phaseStatus(currentGrup.status_sembelihan))"></div>
              <div
                v-if="phaseStatus(currentGrup.status_sembelihan) === 'active'"
                class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 border-white animate-pulse"
                :class="phaseAccentClass(phaseStatus(currentGrup.status_sembelihan))"
              ></div>
              <div class="phase-body">
                <p class="phase-eyebrow" :class="phaseEyebrowClass(phaseStatus(currentGrup.status_sembelihan))">
                  {{ phaseStatus(currentGrup.status_sembelihan) === 'active' ? 'FASE BERIKUTNYA' : 'FASE 2' }}
                </p>
                <p class="phase-title" :class="phaseStatus(currentGrup.status_sembelihan) === 'active' ? 'phase-title--active' : ''">
                  Sembelihan
                </p>
                <p class="phase-access-hint">Petugas Sembelihan / Ketua</p>
              </div>
              <span class="phase-badge" :class="phaseBadgeClass(phaseStatus(currentGrup.status_sembelihan))">
                {{ phaseStatus(currentGrup.status_sembelihan) === 'active' ? 'Dalam Antrian' : currentGrup.status_sembelihan }}
              </span>
            </div>

            <!-- Fase 3: Pengulitan (QR-scan starts it; timer finishes it) -->
            <div class="phase-row" :class="phaseRowClass(phaseStatus(currentGrup.status_pengulitan))">
              <div class="phase-accent" :class="phaseAccentClass(phaseStatus(currentGrup.status_pengulitan))"></div>
              <div
                v-if="phaseStatus(currentGrup.status_pengulitan) === 'active'"
                class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 border-white animate-pulse"
                :class="phaseAccentClass(phaseStatus(currentGrup.status_pengulitan))"
              ></div>
              <div class="phase-body">
                <p class="phase-eyebrow" :class="phaseEyebrowClass(phaseStatus(currentGrup.status_pengulitan))">
                  {{ phaseStatus(currentGrup.status_pengulitan) === 'active' ? 'SEDANG BERJALAN' : 'FASE 3' }}
                </p>
                <p class="phase-title" :class="phaseStatus(currentGrup.status_pengulitan) === 'active' ? 'phase-title--active' : ''">
                  Pengulitan
                </p>
                <p class="phase-access-hint">Petugas Pengulitan / Ketua · selesai via timer</p>
              </div>
              <span class="phase-badge" :class="phaseBadgeClass(phaseStatus(currentGrup.status_pengulitan))">
                {{ phaseStatus(currentGrup.status_pengulitan) === 'active' ? 'Proses' : currentGrup.status_pengulitan }}
              </span>
            </div>

          </div>
        </div>

        <!-- Bottom spacer so content clears the fixed action bar -->
        <div style="height: 140px"></div>

      </div><!-- /detail-zone -->

      <!-- ── SUCCESS OVERLAY ──────────────────────────────────────────────── -->
      <Transition name="success">
        <div v-if="showSuccessOverlay" class="success-overlay">
          <div class="success-icon-wrap">
            <span class="material-symbols-outlined success-icon" style="font-variation-settings:'FILL' 1">check_circle</span>
          </div>
          <span class="success-title">TERCATAT!</span>
          <span class="success-label">{{ successLabel }}</span>
          <span class="success-sub">Kembali ke mode scan...</span>
        </div>
      </Transition>

    </main>

    <!-- ── FIXED BOTTOM ACTION BAR ──────────────────────────────────────────── -->
    <div v-if="currentGrup && !isLoading" class="action-bar">
      <button
        class="exec-btn"
        :class="{
          'exec-btn--disabled': isActionDisabled,
          'exec-btn--loading':  isSubmitting,
          'exec-btn--locked':   resolvedAction && 'disabled' in resolvedAction && !isSubmitting,
        }"
        :disabled="isActionDisabled"
        @click="handleExecuteAction"
      >
        <span v-if="isSubmitting" class="material-symbols-outlined animate-spin" style="font-size:22px">progress_activity</span>
        <span
          v-else-if="resolvedAction && 'disabled' in resolvedAction"
          class="material-symbols-outlined"
          style="font-size:20px"
        >lock</span>
        <span
          v-else-if="!isActionDisabled"
          class="material-symbols-outlined"
          style="font-size:22px;font-variation-settings:'FILL' 1"
        >done_all</span>
        {{ isSubmitting ? 'Menyimpan...' : grupActionLabel }}
      </button>
      <p class="exec-hint">
        <template v-if="resolvedAction && !('disabled' in resolvedAction)">
          Mengonfirmasi akan mencatat stempel waktu
        </template>
        <template v-else>
          Tidak ada akses yang tersedia untuk <strong>{{ roleLabel.text }}</strong> pada fase ini
        </template>
      </p>
      <button v-if="!isSubmitting" class="cancel-btn" @click="handleReset">
        <span class="material-symbols-outlined" style="font-size:18px">arrow_back</span>
        Batal / Scan Ulang
      </button>
    </div>

  </div>
</template>



<style>
/* ── html5-qrcode suppression ─────────────────────────────────────────────── */
#qr-reader-scan-gate > img,
#qr-reader-scan-gate__header_message,
#qr-reader-scan-gate__dashboard,
#qr-reader-scan-gate__status_span,
#qr-reader-scan-gate select,
#qr-reader-scan-gate button { display: none !important; }
#qr-reader-scan-gate__scan_region { border: none !important; padding: 0 !important; }
#qr-reader-scan-gate video {
  width: 100% !important; height: 100% !important;
  object-fit: cover !important; transform: none !important;
}
</style>

<style scoped>
/* ════════════════════════════════════════════════════════════════════════════ */
/*  ROOT & LAYOUT                                                               */
/* ════════════════════════════════════════════════════════════════════════════ */
.page-root {
  height: 100dvh;
  max-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f6fafe;
  color: #171c1f;
  font-family: 'Inter', sans-serif;
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TOP NAV                                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */
.topnav {
  position: sticky; top: 0; z-index: 50;
  background: #ffffff;
  border-bottom: 1px solid #E2E8F0;
  flex-shrink: 0;
}
.topnav-inner {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; padding: 0 16px; width: 100%;
}
.topnav-title { font-size: 18px; font-weight: 700; color: #003527; letter-spacing: -0.01em; }
.back-btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; color: #003527; cursor: pointer;
  border-radius: 9999px; transition: background 0.15s; flex-shrink: 0;
}
.back-btn:active { background: #eaeef2; }

/* Operator badge (mobile) */
.op-badge-pill {
  background: #eaeef2; border: 1px solid #E2E8F0; border-radius: 9999px;
  color: #171c1f; font-size: 12px; font-weight: 600; padding: 3px 12px;
  max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* Operator badge (desktop) */
.op-badge-wrap { flex-direction: column; gap: 2px; align-items: flex-start; }
.op-badge {
  font-size: 13px; font-weight: 600; color: #171c1f;
  background: #eaeef2; border: 1px solid #E2E8F0;
  border-radius: 0.375rem; padding: 3px 10px;
}
.op-badge-sub { font-size: 10px; color: #707974; padding-left: 2px; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ROLE BADGES                                                                 */
/* ════════════════════════════════════════════════════════════════════════════ */
.role-badge {
  display: inline-flex; align-items: center;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  border-radius: 9999px; padding: 2px 8px;
  border: 1px solid transparent; text-transform: uppercase;
}
.role-badge--ketua      { background: #DBEAFE; color: #1D4ED8; border-color: rgba(29,78,216,0.25); }
.role-badge--sembelihan { background: #FEE2E2; color: #B91C1C; border-color: rgba(185,28,28,0.25); }
.role-badge--pengulitan { background: #FEF3C7; color: #B45309; border-color: rgba(180,83,9,0.25); }
.role-badge--guest      { background: #f0f4f8; color: #707974; border-color: #bfc9c3; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ROLE ACCESS NOTICE                                                          */
/* ════════════════════════════════════════════════════════════════════════════ */
.role-notice {
  display: flex; align-items: flex-start; gap: 12px;
  background: #FFFBEB; border: 1px solid rgba(245,158,11,0.35);
  border-radius: 0.75rem; padding: 14px 16px;
}
.role-notice-icon { font-size: 20px; color: #D97706; flex-shrink: 0; margin-top: 1px; }
.role-notice-title { font-size: 13px; font-weight: 700; color: #92400E; margin-bottom: 3px; }
.role-notice-msg   { font-size: 12px; color: #B45309; line-height: 1.5; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ERROR BANNER                                                                */
/* ════════════════════════════════════════════════════════════════════════════ */
.error-banner {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 16px;
  background: rgba(239,68,68,0.06); border-bottom: 1px solid rgba(239,68,68,0.3);
  flex-shrink: 0; z-index: 40;
}
.error-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: #EF4444; color: #fff; border-radius: 9999px;
  font-size: 11px; font-weight: 700; font-style: normal; margin-top: 1px;
}
.error-msg { font-size: 12px; color: #b91c1c; flex: 1; line-height: 1.5; }
.error-dismiss {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  color: #b91c1c; border: 1px solid rgba(185,28,28,0.3);
  background: transparent; padding: 4px 10px; cursor: pointer;
  border-radius: 0.25rem; flex-shrink: 0; min-height: 36px;
  display: flex; align-items: center; transition: background 0.15s;
}
.error-dismiss:active { background: rgba(185,28,28,0.06); }
.banner-enter-active, .banner-leave-active { transition: all 0.2s ease; }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-6px); }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MAIN SCROLL                                                                 */
/* ════════════════════════════════════════════════════════════════════════════ */
.main-scroll {
  flex: 1; min-height: 0;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain; position: relative;
}
.main-scroll::-webkit-scrollbar { width: 3px; }
.main-scroll::-webkit-scrollbar-track { background: transparent; }
.main-scroll::-webkit-scrollbar-thumb { background: #bfc9c3; border-radius: 3px; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CAMERA BLOCK                                                                */
/* ════════════════════════════════════════════════════════════════════════════ */
.camera-block { background: #022C22; position: relative; width: 100%; }

.live-badge {
  position: absolute; top: 12px; right: 12px; z-index: 20;
  display: flex; align-items: center; gap: 6px;
  background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 9999px; padding: 4px 12px;
}
.live-dot {
  width: 8px; height: 8px; border-radius: 9999px;
  background: #16A34A; animation: pulse 1.5s ease-in-out infinite;
}
.live-label { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.1em; }

.camera-viewport {
  position: relative; width: 100%; aspect-ratio: 4/3;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
}

.cam-state-overlay {
  position: absolute; inset: 0; z-index: 30;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 14px; padding: 24px; text-align: center;
  background: rgba(2,44,34,0.88); pointer-events: none;
}
.cam-error-bg { background: rgba(2,44,34,0.97); pointer-events: all; }
.cam-error-icon-wrap {
  width: 56px; height: 56px; border-radius: 9999px;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
  display: flex; align-items: center; justify-content: center;
}
.cam-error-msg { font-size: 13px; color: #fca5a5; line-height: 1.6; max-width: 300px; }
.retry-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
  color: #fff; background: #006a61; border: none; border-radius: 0.5rem;
  padding: 12px 24px; cursor: pointer; min-height: 44px; transition: background 0.15s;
}
.retry-btn:active { background: #005049; }
.cam-state-text { font-size: 12px; font-weight: 500; color: #80bea6; letter-spacing: 0.04em; }

.cam-controls {
  display: flex; gap: 12px; padding: 10px 12px;
  background: #ffffff; border-top: 1px solid #E2E8F0;
}
.cam-ctrl-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
  color: #171c1f; background: #f0f4f8; border: 1px solid #E2E8F0;
  border-radius: 0.5rem; height: 44px; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.cam-ctrl-btn:active { background: #eaeef2; }
.cam-ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cam-ctrl-btn--active { color: #D97706; border-color: rgba(245,158,11,0.35); background: #FEF3C7; }

.scan-hint-strip {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px; padding: 40px 24px; min-height: 180px;
  text-align: center; background: #f6fafe;
}
.hint-icon { font-size: 3rem; color: #bfc9c3; }
.hint-text { font-size: 13px; color: #707974; font-weight: 500; max-width: 260px; line-height: 1.5; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  LOADING STATE                                                               */
/* ════════════════════════════════════════════════════════════════════════════ */
.loading-state {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px; padding: 80px 24px;
}
.loading-text {
  font-size: 13px; font-weight: 500; color: #707974;
  animation: pulse-op 1.2s ease-in-out infinite;
}
@keyframes pulse-op { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  DETAIL ZONE                                                                 */
/* ════════════════════════════════════════════════════════════════════════════ */
.detail-zone {
  display: flex; flex-direction: column;
  gap: 12px; padding: 16px;
}

.card {
  background: #ffffff; border: 1px solid #E2E8F0;
  border-radius: 0.75rem; padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

/* Identity card */
.id-chip {
  font-size: 13px; font-weight: 700; color: #003527;
  border: 1px solid #064e3b; background: rgba(6,78,59,0.06);
  border-radius: 0.25rem; padding: 3px 10px; letter-spacing: 0.05em;
}
.timer-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 600; color: #D97706;
  background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3);
  border-radius: 9999px; padding: 2px 8px;
  animation: pulse-op 1.6s ease-in-out infinite;
}
.animal-name { font-size: 26px; font-weight: 700; color: #171c1f; letter-spacing: -0.02em; text-transform: capitalize; }
.scan-ok-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; color: #16A34A; flex-shrink: 0;
}
.label-tampilan { font-size: 11px; color: #707974; letter-spacing: 0.03em; }

/* Detail grid cells */
.detail-cell { background: #f0f4f8; padding: 10px 12px; border-radius: 0.5rem; }
.detail-cell-label { font-size: 10px; font-weight: 600; color: #707974; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
.detail-cell-value { font-size: 13px; font-weight: 600; color: #171c1f; }
.text-muted-sm { font-size: 11px; font-weight: 500; color: #B45309; }

/* Sohibul */
.card-section-label { font-size: 10px; font-weight: 600; color: #707974; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.sohibul-box { background: #f0f4f8; border: 1px solid #E2E8F0; border-radius: 0.5rem; padding: 10px 12px; }
.sohibul-names { font-size: 13px; color: #171c1f; line-height: 1.6; }
.empty-text { font-size: 12px; color: #707974; font-style: italic; }

/* Section heading */
.section-heading { font-size: 18px; font-weight: 600; color: #003527; margin-bottom: 12px; padding: 0 2px; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PHASE ROWS                                                                  */
/* ════════════════════════════════════════════════════════════════════════════ */
.phase-row {
  background: #ffffff; border: 1px solid #E2E8F0; border-radius: 0.75rem;
  padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
  position: relative; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.phase-row--completed { border-color: #16A34A; }
.phase-row--active    { border-color: #F59E0B; border-width: 2px; box-shadow: 0 2px 8px rgba(245,158,11,0.12); }
.phase-row--pending   { opacity: 0.65; }

/* Left accent bar */
.phase-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; }

.phase-body { margin-left: 12px; }
.phase-eyebrow {
  font-size: 9px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.1em; margin-bottom: 3px;
}
.phase-title       { font-size: 16px; font-weight: 600; color: #171c1f; }
.phase-title--active { font-size: 18px; font-weight: 700; }
.phase-access-hint { font-size: 10px; color: #707974; margin-top: 4px; }

/* Phase badge pills */
.phase-badge {
  border-radius: 9999px; padding: 5px 12px;
  font-size: 11px; font-weight: 600; border: 1px solid transparent; flex-shrink: 0;
}
.phase-badge--completed { background: #DCFCE7; color: #16A34A; border-color: rgba(22,163,74,0.3); }
.phase-badge--active    { background: #FEF3C7; color: #D97706; border-color: rgba(245,158,11,0.3); }
.phase-badge--pending   { background: #f0f4f8; color: #707974; border-color: #bfc9c3; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SPINNERS                                                                    */
/* ════════════════════════════════════════════════════════════════════════════ */
.spinner-ring {
  width: 28px; height: 28px;
  border: 3px solid rgba(255,255,255,0.15); border-top-color: #95d3ba;
  border-radius: 9999px; animation: spin 0.9s linear infinite;
}
.spinner-ring--green { border-color: rgba(0,106,97,0.15); border-top-color: #006a61; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  FIXED ACTION BAR                                                            */
/* ════════════════════════════════════════════════════════════════════════════ */
.action-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #ffffff; border-top: 1px solid #E2E8F0;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  box-shadow: 0 -4px 10px rgba(0,0,0,0.06);
  z-index: 40; display: flex; flex-direction: column; gap: 6px;
}

.exec-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; height: 56px;
  font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 700;
  letter-spacing: 0.02em; border: none; border-radius: 0.75rem;
  background: #003527; color: #ffffff; cursor: pointer;
  box-shadow: 0 4px 6px rgba(0,0,0,0.12);
  transition: background 0.15s, transform 0.08s, box-shadow 0.15s;
  touch-action: manipulation;
}
.exec-btn:not(.exec-btn--disabled):not(.exec-btn--loading):not(.exec-btn--locked):active {
  transform: scale(0.98); background: #022C22;
}
.exec-btn:not(.exec-btn--disabled):not(.exec-btn--loading):not(.exec-btn--locked):hover {
  background: #022C22; box-shadow: 0 4px 12px rgba(0,53,39,0.3);
}
.exec-btn--disabled { background: #eaeef2; color: #bfc9c3; cursor: not-allowed; box-shadow: none; }
.exec-btn--locked   { background: #f0f4f8; color: #9ca3af; cursor: not-allowed; box-shadow: none; border: 1px dashed #d1d5db; }
.exec-btn--loading  { background: rgba(0,53,39,0.6); cursor: wait; }

.exec-hint {
  text-align: center; font-size: 11px; color: #707974;
  margin: 0; padding: 0 8px; line-height: 1.4;
}
.exec-hint strong { color: #B45309; }

.cancel-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; min-height: 40px;
  font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
  color: #707974; background: transparent;
  border: 1px solid #E2E8F0; border-radius: 0.5rem; cursor: pointer;
  transition: border-color 0.15s, color 0.15s; touch-action: manipulation;
}
.cancel-btn:active { border-color: #003527; color: #003527; }

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SUCCESS OVERLAY                                                             */
/* ════════════════════════════════════════════════════════════════════════════ */
.success-overlay {
  position: fixed; inset: 0; z-index: 60;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(246,250,254,0.97);
  gap: 14px; text-align: center; padding: 24px;
}
.success-icon-wrap {
  width: 80px; height: 80px; border-radius: 9999px;
  background: rgba(22,163,74,0.1); border: 2px solid rgba(22,163,74,0.3);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 28px rgba(22,163,74,0.2), 0 0 56px rgba(22,163,74,0.08);
}
.success-icon  { font-size: 88px; color: #16A34A; }
.success-title { font-size: 30px; font-weight: 700; color: #003527; letter-spacing: -0.02em; }
.success-label { font-size: 13px; font-weight: 600; color: #006a61; letter-spacing: 0.04em; text-transform: uppercase; max-width: 280px; line-height: 1.5; }
.success-sub   { font-size: 11px; color: #707974; letter-spacing: 0.04em; animation: pulse-op 1s ease-in-out infinite; }

.success-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.success-leave-active { transition: opacity 0.22s ease; }
.success-enter-from   { opacity: 0; transform: scale(0.97); }
.success-leave-to     { opacity: 0; }

/* Accent colors */
.bg-green  { background-color: #16A34A; }
.bg-amber  { background-color: #F59E0B; }
.bg-muted  { background-color: #bfc9c3; }
.clr-amber  { color: #D97706; }
.clr-muted  { color: #707974; }
.clr-subtle { color: #bfc9c3; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>