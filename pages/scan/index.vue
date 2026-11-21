<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useStateLock } from '@/composables/useQurbanEngine';

definePageMeta({ layout: 'lapangan' });

useHead({
  title: 'Qurban Scan | Scanner Lapangan',
  meta: [
    { name: 'theme-color', content: '#0A0E13' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  ],
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap' },
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

// ─── Completion state ─────────────────────────────────────────────────────────
// True once every QR-driven phase has closed. Drives the dedicated "complete"
// layout (green banner + LENGKAP badge + SCAN LAGI) instead of the locked
// action bar, which would otherwise read as an error when nothing is left to do.
const isComplete = computed(() => {
  const g = currentGrup.value;
  if (!g) return false;
  return g.status_kedatangan === 'Diterima'
    && g.status_sembelihan === 'Selesai'
    && g.status_pengulitan === 'Selesai';
});

// ─── Status dot ───────────────────────────────────────────────────────────────
// Mint when the view is trustworthy (camera streaming, or a freshly loaded
// result), amber while data is still being fetched, grey when the camera is
// idle without a result.
const statusDot = computed<'mint' | 'amber' | 'idle'>(() => {
  if (isLoading.value) return 'amber';
  if (showCameraZone.value) return isScannerRunning.value ? 'mint' : 'idle';
  return 'mint';
});

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
  <div class="scan-root">
    <div class="mx-auto flex h-full w-full max-w-[430px] flex-col px-5 pt-5">

      <!-- ── TOPBAR ──────────────────────────────────────────────────────── -->
      <header class="flex h-[29px] shrink-0 items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2.5">
          <h1 class="scan-display truncate text-[24px] font-black leading-none tracking-[-0.01em] text-white">
            {{ showCameraZone ? 'SCAN QR' : 'HASIL SCAN' }}
          </h1>
          <span class="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span v-if="statusDot === 'mint'" class="live-ping"></span>
            <span class="live-dot" :class="`live-dot--${statusDot}`"></span>
          </span>
        </div>

        <span class="role-badge shrink-0" :class="roleLabel.cls">{{ roleLabel.text }}</span>
      </header>

      <!-- ── ERROR BANNER ────────────────────────────────────────────────── -->
      <Transition name="fade">
        <div v-if="hasError" class="mt-3.5 flex shrink-0 items-start gap-2 rounded-[18px] bg-[#2A1218] p-3">
          <span class="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-[#FDA4AF]">error</span>
          <span class="min-w-0 flex-1 text-[12px] font-semibold leading-[1.4] text-[#FDA4AF]">{{ errorMessage }}</span>
          <button
            type="button"
            class="shrink-0 text-[10px] font-extrabold tracking-[0.06em] text-[#FDA4AF]/80 transition-colors hover:text-[#FDA4AF]"
            @click="handleReset"
          >TUTUP</button>
        </div>
      </Transition>

      <!-- ── MAIN ────────────────────────────────────────────────────────── -->
      <main class="hide-scrollbar mt-3.5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">

        <!-- ══════════════ CAMERA STATE ══════════════ -->
        <template v-if="showCameraZone">

          <div class="camera-card">
            <div class="camera-viewport">
              <div :id="READER_ID" ref="readerEl" class="block h-full w-full" />

              <!-- mounting -->
              <div v-if="isScannerMounting && !camError" class="cam-overlay">
                <span class="spinner-ring"></span>
                <span class="cam-overlay-text">Membuka kamera...</span>
              </div>

              <!-- error -->
              <Transition name="fade">
                <div v-if="camError" class="cam-overlay cam-overlay--error">
                  <span class="material-symbols-outlined text-[28px] text-[#FDA4AF]">no_photography</span>
                  <span class="cam-overlay-text max-w-[280px] text-center">{{ camError }}</span>
                  <button type="button" class="retry-btn" @click="() => { camError = ''; startScanner(); }">
                    <span class="material-symbols-outlined text-[16px]">refresh</span>
                    COBA LAGI
                  </button>
                </div>
              </Transition>
            </div>

            <div class="grid shrink-0 grid-cols-2 gap-2.5">
              <button
                type="button"
                class="cam-btn"
                :class="{ 'cam-btn--active': isFlashOn }"
                :disabled="!isScannerRunning"
                @click="toggleFlash"
              >
                <span class="material-symbols-outlined text-[18px]">{{ isFlashOn ? 'flash_on' : 'flash_off' }}</span>
                FLASH
              </button>
              <button type="button" class="cam-btn" :disabled="!isScannerRunning" @click="switchCamera">
                <span class="material-symbols-outlined text-[18px]">cameraswitch</span>
                {{ isFrontCamera ? 'KAMERA DEPAN' : 'GANTI KAMERA' }}
              </button>
            </div>
          </div>

          <div class="hint-strip">
            <span class="material-symbols-outlined text-[18px] text-[#5B6776]">qr_code_2</span>
            <p class="text-[12px] leading-[1.4] text-[#7D8A99]">Arahkan QR Code ke bingkai untuk memindai</p>
          </div>
        </template>

        <!-- ══════════════ LOADING ══════════════ -->
        <div v-else-if="isLoading" class="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <span class="spinner-ring spinner-ring--mint"></span>
          <span class="text-[12px] font-semibold text-[#7D8A99]">Mengambil data dari server...</span>
        </div>

        <!-- ══════════════ RESULT STATE ══════════════ -->
        <template v-else-if="currentGrup">

          <!-- Identity card -->
          <section class="flex shrink-0 flex-col gap-2.5 rounded-[24px] bg-[#11171E] p-4">
            <div class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2.5">
                <span class="id-chip">{{ currentGrup.id_grup }}</span>
                <span class="scan-display truncate text-[22px] font-extrabold leading-[27px] text-white">
                  {{ currentGrup.jenis_hewan ?? '—' }}
                </span>
              </div>

              <div class="flex shrink-0 items-center gap-1.5">
                <span class="ok-badge">
                  <span class="ok-dot"></span>
                  TERPINDAI
                </span>
                <span v-if="isComplete" class="complete-badge">
                  <span class="material-symbols-outlined text-[13px]">check</span>
                  LENGKAP
                </span>
              </div>
            </div>

            <p v-if="currentGrup.label_tampilan" class="text-[12px] font-bold leading-[15px] text-[#5B6776]">
              {{ currentGrup.label_tampilan }}
            </p>
          </section>

          <!-- Complete banner -->
          <section
            v-if="isComplete"
            class="flex shrink-0 flex-col items-center gap-2.5 rounded-[24px] bg-[#0F2D25] px-5 py-6 text-center"
          >
            <span class="flex h-14 w-14 items-center justify-center rounded-full bg-[#34D399]">
              <span class="material-symbols-outlined text-[30px] text-[#052E22]" style="font-variation-settings:'wght' 700">check</span>
            </span>
            <span class="scan-display text-[16px] font-extrabold leading-[20px] text-white">SEMUA FASE SELESAI</span>
            <span class="text-[12px] leading-[15px] text-[#6EE7B7]">Kedatangan · Sembelihan · Pengulitan</span>
          </section>

          <!-- Detail row -->
          <div class="grid shrink-0 grid-cols-2 gap-2.5">
            <div class="flex flex-col gap-1.5 rounded-[24px] bg-[#11171E] p-3.5">
              <span class="text-[10px] font-bold uppercase leading-[12px] text-[#7D8A99]">
                {{ isComplete ? 'STATUS' : 'FASE BERIKUTNYA' }}
              </span>
              <span
                class="scan-display text-[13px] font-extrabold leading-[16px]"
                :class="isComplete ? 'text-[#6EE7B7]' : 'text-[#FCD34D]'"
              >
                {{ isComplete ? 'LENGKAP' : grupActionLabel }}
              </span>
            </div>
            <div class="flex flex-col gap-1.5 rounded-[24px] bg-[#11171E] p-3.5">
              <span class="text-[10px] font-bold uppercase leading-[12px] text-[#7D8A99]">OPERATOR</span>
              <span class="scan-display truncate text-[13px] font-extrabold leading-[16px] text-white">
                {{ operatorNameInput || 'Panitia' }}
              </span>
              <span class="role-badge role-badge--sm self-start" :class="roleLabel.cls">{{ roleLabel.text }}</span>
            </div>
          </div>

          <!-- Sohibul -->
          <section class="flex shrink-0 flex-col gap-2.5 rounded-[24px] bg-[#11171E] p-4">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold uppercase leading-[12px] tracking-[0.06em] text-[#7D8A99]">
                SOHIBUL QURBAN
              </span>
              <span v-if="currentGrup.sohibul_qurban?.length" class="count-chip">
                {{ currentGrup.sohibul_qurban.length }}
              </span>
            </div>
            <div class="rounded-[16px] bg-[#1B2530] px-3.5 py-3">
              <p v-if="currentGrup.sohibul_qurban?.length" class="text-[13px] leading-[16px] text-[#E5ECF3]">
                {{ currentGrup.sohibul_qurban.map((s: any) => s.nama).join(', ') }}
              </p>
              <p v-else class="text-[12px] italic leading-[15px] text-[#5B6776]">Belum ada anggota tercatat</p>
            </div>
          </section>

          <!-- Status fase -->
          <span class="shrink-0 text-[12px] font-bold leading-[15px] text-[#7D8A99]">STATUS FASE</span>

          <div class="flex shrink-0 flex-col gap-2.5">

            <!-- Fase 1 -->
            <div class="phase-row" :class="phaseRowClass(phaseStatus(currentGrup.status_kedatangan))">
              <div class="min-w-0 flex-1">
                <p class="phase-eyebrow" :class="phaseEyebrowClass(phaseStatus(currentGrup.status_kedatangan))">
                  {{ phaseStatus(currentGrup.status_kedatangan) === 'active' ? 'FASE BERIKUTNYA' : 'FASE 1' }}
                </p>
                <p
                  class="scan-display font-extrabold text-white"
                  :class="phaseStatus(currentGrup.status_kedatangan) === 'active' ? 'text-[17px] leading-[21px]' : 'text-[15px] leading-[18px]'"
                >Kedatangan</p>
                <p class="mt-0.5 text-[11px] leading-[13px] text-[#5B6776]">Semua petugas</p>
              </div>
              <span class="phase-badge shrink-0" :class="phaseBadgeClass(phaseStatus(currentGrup.status_kedatangan))">
                {{ phaseStatus(currentGrup.status_kedatangan) === 'active' ? 'DALAM ANTRIAN' : currentGrup.status_kedatangan }}
              </span>
            </div>

            <!-- Fase 2 -->
            <div class="phase-row" :class="phaseRowClass(phaseStatus(currentGrup.status_sembelihan))">
              <div class="min-w-0 flex-1">
                <p class="phase-eyebrow" :class="phaseEyebrowClass(phaseStatus(currentGrup.status_sembelihan))">
                  {{ phaseStatus(currentGrup.status_sembelihan) === 'active' ? 'FASE BERIKUTNYA' : 'FASE 2' }}
                </p>
                <p
                  class="scan-display font-extrabold text-white"
                  :class="phaseStatus(currentGrup.status_sembelihan) === 'active' ? 'text-[17px] leading-[21px]' : 'text-[15px] leading-[18px]'"
                >Sembelihan</p>
                <p class="mt-0.5 text-[11px] leading-[13px] text-[#5B6776]">Petugas Sembelihan / Ketua</p>
              </div>
              <span class="phase-badge shrink-0" :class="phaseBadgeClass(phaseStatus(currentGrup.status_sembelihan))">
                {{ phaseStatus(currentGrup.status_sembelihan) === 'active' ? 'DALAM ANTRIAN' : currentGrup.status_sembelihan }}
              </span>
            </div>

            <!-- Fase 3 -->
            <div class="phase-row" :class="phaseRowClass(phaseStatus(currentGrup.status_pengulitan))">
              <div class="min-w-0 flex-1">
                <p class="phase-eyebrow" :class="phaseEyebrowClass(phaseStatus(currentGrup.status_pengulitan))">
                  {{ phaseStatus(currentGrup.status_pengulitan) === 'active' ? 'SEDANG BERJALAN' : 'FASE 3' }}
                </p>
                <p
                  class="scan-display font-extrabold text-white"
                  :class="phaseStatus(currentGrup.status_pengulitan) === 'active' ? 'text-[17px] leading-[21px]' : 'text-[15px] leading-[18px]'"
                >Pengulitan</p>
                <p class="mt-0.5 text-[11px] leading-[13px] text-[#5B6776]">Petugas Pengulitan / Ketua</p>
              </div>
              <span class="phase-badge shrink-0" :class="phaseBadgeClass(phaseStatus(currentGrup.status_pengulitan))">
                {{ phaseStatus(currentGrup.status_pengulitan) === 'active' ? 'PROSES' : currentGrup.status_pengulitan }}
              </span>
            </div>

          </div>

          <!-- Locked notice (only when NOT complete) -->
          <Transition name="fade">
            <div
              v-if="!isComplete && resolvedAction && 'disabled' in resolvedAction"
              class="flex shrink-0 items-start gap-2.5 rounded-[24px] bg-[#2A1218] p-4"
            >
              <span class="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-[#FDA4AF]">lock</span>
              <div class="min-w-0">
                <p class="scan-display text-[12px] font-extrabold leading-[15px] text-[#FDA4AF]">AKSES DIBATASI</p>
                <p class="mt-1 text-[11px] leading-[15px] text-[#FDA4AF]/80">{{ resolvedAction.reason }}</p>
              </div>
            </div>
          </Transition>
        </template>
      </main>

      <!-- ── FOOTER · camera ─────────────────────────────────────────────── -->
      <footer
        v-if="showCameraZone"
        class="mt-3.5 flex h-[69px] shrink-0 items-center justify-between gap-3 rounded-[28px] bg-[#11171E] px-3.5"
      >
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[10px] font-bold uppercase leading-[12px] text-[#7D8A99]">Operator</span>
          <span class="scan-display truncate text-[16px] font-extrabold leading-[20px] text-white">
            {{ operatorNameInput || 'Petugas' }}
          </span>
        </div>
        <button type="button" class="pill-btn" @click="goBack">
          <span class="scan-display text-[12px] font-extrabold leading-none text-white">KEMBALI</span>
        </button>
      </footer>

      <!-- ── FOOTER · complete ───────────────────────────────────────────── -->
      <footer
        v-else-if="isComplete"
        class="mt-3.5 flex h-[69px] shrink-0 items-center justify-between gap-3 rounded-[28px] bg-[#11171E] px-3.5"
      >
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[10px] font-bold uppercase leading-[12px] text-[#7D8A99]">Operator</span>
          <span class="scan-display truncate text-[16px] font-extrabold leading-[20px] text-white">
            {{ operatorNameInput || 'Petugas' }}
          </span>
        </div>
        <button type="button" class="scan-again-btn" @click="handleReset">
          <span class="scan-display text-[12px] font-extrabold leading-none text-[#052E22]">SCAN LAGI</span>
        </button>
      </footer>

      <!-- ── FOOTER · result ─────────────────────────────────────────────── -->
      <footer
        v-else-if="currentGrup && !isLoading"
        class="mt-3.5 flex shrink-0 flex-col gap-2 rounded-[28px] bg-[#11171E] p-3.5"
      >
        <button
          type="button"
          class="cta-btn"
          :class="{ 'cta-btn--muted': isActionDisabled }"
          :disabled="isActionDisabled"
          @click="handleExecuteAction"
        >
          <span v-if="isSubmitting" class="material-symbols-outlined confirm-spinner text-[20px]">progress_activity</span>
          <span v-else-if="resolvedAction && 'disabled' in resolvedAction" class="material-symbols-outlined text-[20px]">lock</span>
          <span v-else class="material-symbols-outlined text-[20px]">done_all</span>
          <span class="scan-display truncate text-[13px] font-extrabold leading-none">
            {{ isSubmitting ? 'MENYIMPAN...' : grupActionLabel }}
          </span>
        </button>

        <p class="text-center text-[11px] leading-[13px] text-[#7D8A99]">
          <template v-if="resolvedAction && !('disabled' in resolvedAction)">
            Mengonfirmasi akan mencatat stempel waktu
          </template>
          <template v-else>
            Tidak ada akses untuk <span class="font-bold text-[#FCD34D]">{{ roleLabel.text }}</span> pada fase ini
          </template>
        </p>

        <button type="button" class="ghost-btn" :disabled="isSubmitting" @click="handleReset">
          <span class="material-symbols-outlined text-[16px]">arrow_back</span>
          <span class="scan-display text-[11px] font-extrabold leading-none text-white">BATAL / SCAN ULANG</span>
        </button>
      </footer>

    </div>

    <!-- ── SUCCESS OVERLAY ───────────────────────────────────────────────── -->
    <Transition name="success">
      <div v-if="showSuccessOverlay" class="success-overlay">
        <span class="flex h-20 w-20 items-center justify-center rounded-full bg-[#34D399]">
          <span class="material-symbols-outlined text-[42px] text-[#052E22]" style="font-variation-settings:'wght' 700">check</span>
        </span>
        <span class="scan-display text-[26px] font-black leading-none text-white">TERCATAT!</span>
        <span class="scan-display max-w-[280px] text-center text-[12px] font-extrabold leading-[1.5] tracking-[0.04em] text-[#6EE7B7]">
          {{ successLabel }}
        </span>
        <span class="animate-pulse text-[11px] tracking-[0.04em] text-[#7D8A99]">Kembali ke mode scan...</span>
      </div>
    </Transition>
  </div>
</template>

<style>
/* ── html5-qrcode suppression ─────────────────────────────────────────────── */
#qr-reader-scan-gate > img,
#qr-reader-scan-gate__header_message,
#qr-reader-scan-gate__dashboard,
#qr-reader-scan-gate__status_span,
#qr-reader-scan-gate select,
#qr-reader-scan-gate input,
#qr-reader-scan-gate button {
  display: none !important;
}
#qr-reader-scan-gate video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
  border-radius: 20px;
}
#qr-reader-scan-gate canvas {
  display: none !important;
}

/* ── Material Symbols ────────────────────────────────────────────────────────── */
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  display: inline-flex;
  align-items: center;
  line-height: 1;
  text-transform: none;
  letter-spacing: normal;
  word-wrap: normal;
  white-space: nowrap;
  direction: ltr;
  font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
  user-select: none;
}

@keyframes qc-ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
@keyframes qc-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Scrollbar hide ─────────────────────────────────────────────────────────── */
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

body {
  overscroll-behavior-y: none;
  background-color: #0A0E13;
  color: #E6EDF3;
  margin: 0;
  padding: 0;
}
</style>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════════
   ROOT
   ═══════════════��══════════════════════════════════════════════════════════════ */
.scan-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #0A0E13;
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #E6EDF3;
  padding-top: env(safe-area-inset-top);
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

.scan-display {
  font-family: 'Montserrat', 'Inter', sans-serif;
}

/* ══════════════════════════════════════════════════════════════════════════════
   LIVE DOT
   ══════════════════════════════════════════════════════════════════════════════ */
.live-ping {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #34D399;
  opacity: 0.7;
  animation: qc-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.live-dot {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
}
.live-dot--mint  { background: #34D399; }
.live-dot--amber { background: #FCD34D; }
.live-dot--idle  { background: #5B6776; }

/* ══════════════════════════════════════════════════════════════════════════════
   ROLE BADGE
   ══════════════════════════════════════════════════════════════════════════════ */
.role-badge {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0 10px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.role-badge--sm {
  height: 19px;
  padding: 0 8px;
  font-size: 9px;
}
.role-badge--ketua       { background: #10253C; color: #93C5FD; }
.role-badge--sembelihan  { background: #33260C; color: #FCD34D; }
.role-badge--pengulitan  { background: #271F45; color: #C4B5FD; }
.role-badge--guest       { background: #1B2530; color: #9AA7B5; }

/* ══════════════════════════════════════════════════════════════════════════════
   CAMERA
   ══════════════════════════════════════════════════════════════════════════════ */
.camera-card {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  border-radius: 28px;
  background: #11171E;
  padding: 10px;
}

.camera-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 240px;
  overflow: hidden;
  border-radius: 20px;
  background: #070C11;
}

.cam-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(7, 12, 17, 0.92);
  padding: 20px;
}
.cam-overlay--error { background: rgba(7, 12, 17, 0.97); }
.cam-overlay-text {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: #7D8A99;
}

.cam-btn {
  display: flex;
  height: 41px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 20px;
  background: #1B2530;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #E6EDF3;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.cam-btn:hover:not(:disabled)  { background: #223040; }
.cam-btn:active:not(:disabled) { transform: scale(0.98); }
.cam-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cam-btn--active {
  background: #33260C;
  color: #FCD34D;
}

.retry-btn {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 18px;
  background: #34D399;
  padding: 0 18px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #052E22;
  cursor: pointer;
}

.hint-strip {
  display: flex;
  height: 56px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 20px;
  padding: 0 16px;
  text-align: center;
}

/* ══════════════════════════════════════════════════════════════════════════════
   SPINNERS
   ══════════════════════════════════════════════════════════════════════════════ */
.spinner-ring {
  width: 26px;
  height: 26px;
  border: 3px solid rgba(52, 211, 153, 0.18);
  border-top-color: #34D399;
  border-radius: 9999px;
  animation: qc-spin 0.9s linear infinite;
}
.spinner-ring--mint {
  width: 30px;
  height: 30px;
  border-color: rgba(52, 211, 153, 0.18);
  border-top-color: #34D399;
}
.confirm-spinner { animation: qc-spin 0.9s linear infinite; }

/* ══════════════════════════════════════════════════════════════════════════════
   RESULT CARDS
   ═══════════════��══════════════════════════════════════════════════════════════ */
.id-chip {
  display: inline-flex;
  height: 33px;
  flex-shrink: 0;
  align-items: center;
  border-radius: 12px;
  background: #1B2530;
  padding: 0 8px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 900;
  line-height: 17px;
  color: #FFFFFF;
}

.ok-badge {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 6px;
  border-radius: 9999px;
  background: #0F2D25;
  padding: 0 10px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.04em;
  color: #6EE7B7;
  white-space: nowrap;
}
.ok-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #6EE7B7;
}

.complete-badge {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 4px;
  border-radius: 9999px;
  background: #34D399;
  padding: 0 10px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.04em;
  color: #052E22;
  white-space: nowrap;
}

.count-chip {
  display: inline-flex;
  height: 21px;
  align-items: center;
  border-radius: 9999px;
  background: #0F2D25;
  padding: 0 8px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  color: #6EE7B7;
}

/* ══════════════════════════════════════════════════════════════════════════════
   PHASE ROWS
   ══════════════════════════════════════════════════════════════════════════════ */
.phase-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 20px;
  background: #11171E;
  padding: 14px 16px;
  transition: background 0.2s;
}
.phase-row--completed { background: #11171E; }
.phase-row--active    { background: #141A22; }
.phase-row--pending   { background: #0E141A; }

.phase-eyebrow {
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 9px;
  font-weight: 800;
  line-height: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.phase-badge {
  display: inline-flex;
  height: 28px;
  align-items: center;
  border-radius: 9999px;
  padding: 0 8px;
  font-family: 'Montserrat', 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
}
.phase-badge--completed { background: #0F2D25; color: #6EE7B7; }
.phase-badge--active    { background: #33260C; color: #FCD34D; }
.phase-badge--pending   { background: #1B2530; color: #9AA7B5; }

/* accent + eyebrow colour helpers (returned by the script helpers) */
.bg-green  { background-color: #34D399; }
.bg-amber  { background-color: #FCD34D; }
.bg-muted  { background-color: #5B6776; }
.clr-amber  { color: #FCD34D; }
.clr-muted  { color: #7D8A99; }
.clr-subtle { color: #5B6776; }

/* ══════════════���═══════════════════════════════════════════════════════════════
   FOOTER BUTTONS
   ══════════════════════════���═══════════════════════════════════════════════════ */
.pill-btn {
  display: flex;
  height: 41px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 20px;
  background: #1B2530;
  padding: 0 13px;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.pill-btn:hover  { background: #223040; }
.pill-btn:active { transform: scale(0.98); }

.scan-again-btn {
  display: flex;
  height: 41px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 20px;
  background: #34D399;
  padding: 0 16px;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.scan-again-btn:hover  { background: #3EE0A5; }
.scan-again-btn:active { transform: scale(0.98); }

.cta-btn {
  display: flex;
  width: 100%;
  height: 52px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: 20px;
  background: #34D399;
  color: #052E22;
  padding: 0 12px;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.cta-btn:hover:not(:disabled)  { background: #3EE0A5; }
.cta-btn:active:not(:disabled) { transform: scale(0.99); }
.cta-btn--muted,
.cta-btn:disabled {
  background: #1B2530;
  color: #5B6776;
  cursor: not-allowed;
}

.ghost-btn {
  display: flex;
  width: 100%;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 20px;
  background: #1B2530;
  color: #FFFFFF;
  cursor: pointer;
  transition: background 0.15s, transform 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.ghost-btn:hover:not(:disabled)  { background: #223040; }
.ghost-btn:active:not(:disabled) { transform: scale(0.98); }
.ghost-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ══════════════════════════════════════════════════════════════════════════════
   SUCCESS OVERLAY
   ══════════════════════════════════════════════════════════════════════════════ */
.success-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(10, 14, 19, 0.97);
  padding: 24px;
  text-align: center;
}

.success-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.success-leave-active { transition: opacity 0.22s ease; }
.success-enter-from   { opacity: 0; transform: scale(0.97); }
.success-leave-to     { opacity: 0; }

/* ══════════════════════════════════════════════════════════════════════════════
   TRANSITIONS
   ══════════════════════════���═══════════════════════════════════════════════════ */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .live-ping, .spinner-ring, .confirm-spinner { animation: none; }
}
</style>
