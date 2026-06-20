/**
 * useQurbanEngine.ts
 *
 * Single-file engine for AhsanTV Qurban Monitor System V2.
 * Contains: all types (database + domain), all composables.
 *
 * Replaces:
 *   types/database.types.ts
 *   types/qurban.types.ts
 *   composables/use12ValueScore.ts
 *   composables/useActivityLog.ts
 *   composables/useAutoTimer.ts
 *   composables/useQurbanRealtime.ts
 *   composables/useStateLock.ts
 */

import { ref, computed, readonly } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ═════════════════════════════════════════════════════════════════════════════
// TYPES — Database layer  (formerly database.types.ts)
// ═════════════════════════════════════════════════════════════════════════════

export type StatusKedatanganEnum  = 'Belum' | 'Diterima'
export type StatusSembelihanEnum  = 'Belum' | 'Selesai'
export type StatusPenguliutanEnum = 'Belum' | 'Proses' | 'Selesai'
export type StatusPengemasanEnum  = 'Belum' | 'Proses' | 'Selesai'
export type JenisHewanEnum        = 'Sapi' | 'Kambing' | 'Domba'
export type FaseEnum              = 'kedatangan' | 'sembelihan' | 'pengulitan' | 'pengemasan'
export type ActionSourceEnum      = 'manual' | 'qr_scan' | 'auto_timer'

/**
 * Roles sourced from public.users.role (user_role_enum).
 * - sembelihan : can advance kedatangan→diterima AND sembelihan→selesai
 * - pengulitan  : can advance kedatangan→diterima AND pengulitan→proses
 * - ketua       : full access to all QR-driven phases
 */
export type UserRoleEnum = 'sembelihan' | 'pengulitan' | 'ketua'

export interface GrupHewanRow {
  id_grup: string
  label_tampilan: string
  jenis_hewan: JenisHewanEnum | string
  qr_code_string: string
  status_kedatangan: StatusKedatanganEnum | string
  status_sembelihan: StatusSembelihanEnum | string
  status_pengulitan: StatusPenguliutanEnum | string
  status_pengemasan: StatusPengemasanEnum | string
  sembelih_selesai_at: string | null
  pengulitan_selesai_at: string | null
  is_timer_active: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface GrupHewanInsert {
  id_grup: string
  label_tampilan: string
  jenis_hewan: JenisHewanEnum | string
  qr_code_string: string
  status_kedatangan?: StatusKedatanganEnum
  status_sembelihan?: StatusSembelihanEnum
  status_pengulitan?: StatusPenguliutanEnum
  status_pengemasan?: StatusPengemasanEnum
  sembelih_selesai_at?: string | null
  pengulitan_selesai_at?: string | null
  is_timer_active?: boolean
  updated_by?: string | null
}

export interface GrupHewanUpdate {
  label_tampilan?: string
  jenis_hewan?: JenisHewanEnum | string
  qr_code_string?: string
  status_kedatangan?: StatusKedatanganEnum | string
  status_sembelihan?: StatusSembelihanEnum | string
  status_pengulitan?: StatusPenguliutanEnum | string
  status_pengemasan?: StatusPengemasanEnum | string
  sembelih_selesai_at?: string | null
  pengulitan_selesai_at?: string | null
  is_timer_active?: boolean
  updated_by?: string | null
}

export interface SohibulQurbanRow {
  id: number
  nama: string
  jenis_hewan: string
  jatah: number
  id_grup: string | null
  created_at: string
}

export interface SohibulQurbanInsert {
  nama: string
  jenis_hewan: string
  jatah?: number
  id_grup?: string | null
}

export interface SohibulQurbanUpdate {
  nama?: string
  jenis_hewan?: string
  jatah?: number
  id_grup?: string | null
}

export interface ActivityLogRow {
  id: number
  created_at: string
  id_grup: string
  actor_id: string | null
  actor_name: string | null
  fase: FaseEnum | string
  status_lama: string | null
  status_baru: string | null
  action_source: ActionSourceEnum | string
  metadata: Record<string, unknown> | null
}

export interface ActivityLogInsert {
  id_grup: string
  actor_id?: string | null
  actor_name?: string | null
  fase: FaseEnum | string
  status_lama?: string | null
  status_baru: string
  action_source?: ActionSourceEnum | string
  metadata?: Record<string, unknown> | null
}

export interface FotoLapanganRow {
  id: number
  created_at: string
  id_grup: string
  fase: FaseEnum | string
  storage_path: string
  storage_url: string | null
  uploaded_by: string | null
  caption: string | null
}

export interface FotoLapanganInsert {
  id_grup: string
  fase: FaseEnum | string
  storage_path: string
  storage_url?: string | null
  uploaded_by?: string | null
  caption?: string | null
}

export interface FotoLapanganUpdate {
  storage_url?: string | null
  caption?: string | null
}

/**
 * Mirrors public.users from Supabase.
 */
export interface UserRow {
  id: string
  nama: string
  role: UserRoleEnum
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      grup_hewan: {
        Row: GrupHewanRow
        Insert: GrupHewanInsert
        Update: GrupHewanUpdate
      }
      sohibul_qurban: {
        Row: SohibulQurbanRow
        Insert: SohibulQurbanInsert
        Update: SohibulQurbanUpdate
      }
      activity_logs: {
        Row: ActivityLogRow
        Insert: ActivityLogInsert
        Update: Record<string, never>
      }
      foto_lapangan: {
        Row: FotoLapanganRow
        Insert: FotoLapanganInsert
        Update: FotoLapanganUpdate
      }
      users: {
        Row: UserRow
        Insert: Omit<UserRow, 'id' | 'created_at'>
        Update: Partial<Omit<UserRow, 'id' | 'created_at'>>
      }
    }
    Views: { [_: never]: never }
    Functions: { [_: never]: never }
    Enums: { [_: never]: never }
  }
}

// Convenience record aliases
export type GrupHewanRecord     = Database['public']['Tables']['grup_hewan']['Row']
export type SohibulQurbanRecord = Database['public']['Tables']['sohibul_qurban']['Row']
export type ActivityLogRecord   = Database['public']['Tables']['activity_logs']['Row']
export type FotoLapanganRecord  = Database['public']['Tables']['foto_lapangan']['Row']
export type UserRecord          = Database['public']['Tables']['users']['Row']

export interface GrupHewanWithSohibul extends GrupHewanRow {
  sohibul_qurban: SohibulQurbanRow[]
}

export interface GrupHewanStateLockResult {
  id_grup: string
  jenis_hewan: string
  label_tampilan: string
  qr_code_string: string
  status_kedatangan: string
  status_sembelihan: string
  status_pengulitan: string
  status_pengemasan: string
  is_timer_active: boolean
  sohibul_qurban: Array<{ nama: string }>
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPES — Domain layer  (formerly qurban.types.ts)
// ═════════════════════════════════════════════════════════════════════════════

export type Fase             = 'kedatangan' | 'sembelihan' | 'pengulitan' | 'pengemasan'
export type StatusKedatangan = 'Belum' | 'Diterima'
export type StatusSembelihan = 'Belum' | 'Selesai'
export type StatusPengulitan = 'Belum' | 'Proses' | 'Selesai'
export type StatusPengemasan = 'Belum' | 'Proses' | 'Selesai'
export type AnyStatus        = 'Belum' | 'Proses' | 'Selesai' | 'Diterima'
export type ActionSource     = 'manual' | 'qr_scan' | 'auto_timer'
export type JenisHewan       = 'Sapi' | 'Kambing' | 'Domba'

/** Matches user_role_enum in public.users */
export type UserRole = UserRoleEnum

export interface SohibulQurban {
  id: number
  id_grup: string
  nama: string
  jenis_hewan?: string | null
  created_at: string
}

export interface GrupHewan {
  id_grup: string
  jenis_hewan: JenisHewan | string | null
  label_tampilan: string | null
  status_kedatangan: StatusKedatangan | string
  status_sembelihan: StatusSembelihan | string
  status_pengulitan: StatusPengulitan | string
  status_pengemasan: StatusPengemasan | string
  sembelih_selesai_at: string | null
  pengulitan_selesai_at: string | null
  is_timer_active: boolean
  qr_code_string: string | null
  updated_by: string | null
  sohibul_qurban?: SohibulQurban[]
}

export interface ActivityLog {
  id: number
  created_at: string
  id_grup: string
  actor_id: string
  actor_name: string
  fase: Fase | string
  status_lama: string
  status_baru: string
  action_source: ActionSource | string
  metadata: Record<string, unknown> | null
}

export interface FotoLapangan {
  id: number
  created_at: string
  id_grup: string
  fase: Fase | string
  storage_path: string
  storage_url: string | null
  uploaded_by: string
  caption: string | null
}

export interface ScoreMetrics {
  globalPercentage: number
  totalScore: number
  maxTotalScore: number
  phaseMetrics: PhaseMetricsMap
}

export interface FaseMetric {
  belum: number
  proses: number
  selesai: number
}

export interface PhaseMetricsMap {
  kedatangan: FaseMetric
  sembelihan: FaseMetric
  pengulitan: FaseMetric
  pengemasan: FaseMetric
}

export interface ActionStep {
  id: Fase | 'done'
  label: string
  color: 'blue' | 'green' | 'orange' | 'purple' | 'gray'
  kondisi: (grup: GrupHewan) => boolean
  update: { kolom: keyof GrupHewan; nilai: string }
  postAction?: (idGrup: string) => Promise<void>
  disabled?: boolean
}

export interface PageChangedPayload {
  page: number
}

export interface HiddenGroupsPayload {
  hiddenIds: string[]
  totalVisible: number
  totalGroups: number
}

export interface AdminFilterState {
  jenisHewan: string[]
  kedatangan: string[]
  sembelihan: string[]
  pengulitan: string[]
  pengemasan: string[]
}

export type QuickFilterKey = 'all' | 'belum' | 'proses' | 'selesai'

export interface ProgressCardProps {
  fase: Fase
  label: string
  subtitle: string
  icon: string
  metrics: FaseMetric
  total: number
}

export interface StatusColumnConfig {
  field: keyof Pick<
    GrupHewan,
    | 'status_kedatangan'
    | 'status_sembelihan'
    | 'status_pengulitan'
    | 'status_pengemasan'
  >
  label: string
  options: readonly string[]
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSABLE 1: use12ValueScore
// ═════════════════════════════════════════════════════════════════════════════

const SCORE_MAP: Record<string, number> = {
  Belum: 0,
  Proses: 1,
  Selesai: 3,
  Diterima: 3,
}

const SCORE_FIELDS = [
  'status_kedatangan',
  'status_sembelihan',
  'status_pengulitan',
  'status_pengemasan',
] as const

const MAX_SCORE_PER_GRUP = 12

function scoreForGrup(grup: GrupHewan): number {
  return SCORE_FIELDS.reduce((total, field) => {
    const status = (grup as Record<string, unknown>)[field] as string | undefined
    return total + (SCORE_MAP[status ?? 'Belum'] ?? 0)
  }, 0)
}

export function use12ValueScore(
  grupList: Ref<GrupHewan[]> | ComputedRef<GrupHewan[]>
) {
  const totalScore = computed<number>(() =>
    grupList.value.reduce((sum, g) => sum + scoreForGrup(g), 0)
  )

  const maxTotalScore = computed<number>(
    () => grupList.value.length * MAX_SCORE_PER_GRUP
  )

  const globalPercentage = computed<number>(() => {
    if (maxTotalScore.value === 0) return 0
    return Math.round((totalScore.value / maxTotalScore.value) * 100)
  })

  const phaseMetrics = computed<PhaseMetricsMap>(() => {
    const m: PhaseMetricsMap = {
      kedatangan: { belum: 0, proses: 0, selesai: 0 },
      sembelihan: { belum: 0, proses: 0, selesai: 0 },
      pengulitan: { belum: 0, proses: 0, selesai: 0 },
      pengemasan: { belum: 0, proses: 0, selesai: 0 },
    }

    for (const grup of grupList.value) {
      const kd = grup.status_kedatangan ?? 'Belum'
      if (kd === 'Diterima') m.kedatangan.selesai++
      else if (kd === 'Proses') m.kedatangan.proses++
      else m.kedatangan.belum++

      const sb = grup.status_sembelihan ?? 'Belum'
      if (sb === 'Selesai') m.sembelihan.selesai++
      else m.sembelihan.belum++

      const pu = grup.status_pengulitan ?? 'Belum'
      if (pu === 'Selesai') m.pengulitan.selesai++
      else if (pu === 'Proses') m.pengulitan.proses++
      else m.pengulitan.belum++

      const pk = grup.status_pengemasan ?? 'Belum'
      if (pk === 'Selesai') m.pengemasan.selesai++
      else if (pk === 'Proses') m.pengemasan.proses++
      else m.pengemasan.belum++
    }

    return m
  })

  function scoreGrup(grup: GrupHewan): number {
    return scoreForGrup(grup)
  }

  return { globalPercentage, totalScore, maxTotalScore, phaseMetrics, scoreGrup }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSABLE 2: useActivityLog
// ═════════════════════════════════════════════════════════════════════════════

const MAX_LOGS = 100

export function useActivityLog() {
  const supabase = useSupabaseClient<Database>()
  const _logs = ref<ActivityLog[]>([])
  const isLoadingHistory = ref(false)
  let channel: RealtimeChannel | null = null

  async function loadRecentHistory(): Promise<void> {
    isLoadingHistory.value = true
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_LOGS)

      if (error) {
        console.error('[useActivityLog] loadRecentHistory error:', error)
        return
      }

      _logs.value = (data ?? []).reverse() as ActivityLog[]
    } catch (err) {
      console.error('[useActivityLog] loadRecentHistory unexpected error:', err)
    } finally {
      isLoadingHistory.value = false
    }
  }

  function subscribe(): void {
    if (channel) return

    channel = supabase
      .channel('activity-logs-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        (payload) => {
          const newLog = payload.new as ActivityLog
          _logs.value.unshift(newLog)
          if (_logs.value.length > MAX_LOGS) {
            _logs.value.splice(MAX_LOGS)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[useActivityLog] Realtime channel subscribed.')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[useActivityLog] Channel error:', status)
        }
      })
  }

  async function unsubscribe(): Promise<void> {
    if (!channel) return
    try {
      await supabase.removeChannel(channel)
    } catch (err) {
      console.warn('[useActivityLog] Error during unsubscribe:', err)
    } finally {
      channel = null
    }
  }

  function clearView(): void {
    _logs.value = []
  }

  async function insertLog(entry: ActivityLogInsert): Promise<void> {
    try {
      const { error } = await supabase
        .from('activity_logs')
        .insert(entry as Database['public']['Tables']['activity_logs']['Insert'])

      if (error) {
        console.error('[useActivityLog] insertLog error:', error)
      }
    } catch (err) {
      console.error('[useActivityLog] insertLog unexpected error:', err)
    }
  }

  return {
    liveLogs: readonly(_logs),
    isLoadingHistory,
    subscribe,
    unsubscribe,
    clearView,
    loadRecentHistory,
    insertLog,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSABLE 3: useAutoTimer
// ═════════════════════════════════════════════════════════════════════════════

// Pengulitan Belum→Proses is NOT timer-driven.
// It is triggered manually by the 'pengulitan' role via QR scan.
// The timer only takes over once the operator has started the phase (Proses).
const PENGULITAN_SELESAI_DELAY_MS = 10 * 60 * 1000
const PENGEMASAN_PROSES_DELAY_MS  = 0
const PENGEMASAN_SELESAI_DELAY_MS = 5 * 60 * 1000

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>()

function timerKey(idGrup: string, phase: string): string {
  return `${idGrup}:${phase}`
}

function clearTimer(idGrup: string, phase: string): void {
  const key = timerKey(idGrup, phase)
  const handle = activeTimers.get(key)
  if (handle !== undefined) {
    clearTimeout(handle)
    activeTimers.delete(key)
  }
}

async function writeStatus(
  supabase: ReturnType<typeof useSupabaseClient>,
  idGrup: string,
  kolom: keyof Pick<GrupHewan, 'status_pengulitan' | 'status_pengemasan'>,
  statusBaru: string,
  extraFields: Partial<GrupHewan> = {}
): Promise<void> {
  const { error } = await supabase
    .from('grup_hewan')
    .update({ [kolom]: statusBaru, updated_by: 'auto_timer', ...extraFields })
    .eq('id_grup', idGrup)

  if (error) {
    console.error(
      `[useAutoTimer] DB write failed for ${idGrup} ${kolom}=${statusBaru}:`,
      error.message
    )
    throw error
  }
}

async function logAutoAction(
  supabase: ReturnType<typeof useSupabaseClient>,
  idGrup: string,
  fase: string,
  statusLama: string,
  statusBaru: string
): Promise<void> {
  const { error } = await supabase.from('activity_logs').insert({
    id_grup: idGrup,
    actor_id: 'system',
    actor_name: 'Auto Timer',
    fase,
    status_lama: statusLama,
    status_baru: statusBaru,
    action_source: 'auto_timer',
    metadata: { triggered_at: new Date().toISOString() },
  })

  if (error) {
    console.error('[useAutoTimer] Log insert failed:', error.message)
  }
}

/**
 * Starts the automatic timer cascade beginning from pengulitan Proses → Selesai.
 *
 * Called by the 'pengulitan' role's QR scan AFTER they have manually set
 * status_pengulitan = 'Proses'. The timer is NOT responsible for Belum → Proses
 * — that transition is always a manual QR scan by the pengulitan operator.
 *
 * Cascade:
 *   [PENGULITAN_SELESAI_DELAY_MS]  → pengulitan  Proses  → Selesai
 *   [PENGEMASAN_PROSES_DELAY_MS]   → pengemasan  Belum   → Proses
 *   [PENGEMASAN_SELESAI_DELAY_MS]  → pengemasan  Proses  → Selesai
 */
export async function triggerAutoTimerPengulitan(idGrup: string): Promise<void> {
  const supabase = useSupabaseClient()
  cancelTimersForGrup(idGrup)

  // Step 1: pengulitan Proses → Selesai (after skinning timer elapses)
  const handle1 = setTimeout(async () => {
    activeTimers.delete(timerKey(idGrup, 'pengulitan_selesai'))

    try {
      await writeStatus(supabase, idGrup, 'status_pengulitan', 'Selesai', {
        pengulitan_selesai_at: new Date().toISOString() as unknown as undefined,
      })
      await logAutoAction(supabase, idGrup, 'pengulitan', 'Proses', 'Selesai')
    } catch {
      return
    }

    // Step 2: pengemasan Belum → Proses (immediately after pengulitan done)
    const handle2 = setTimeout(async () => {
      activeTimers.delete(timerKey(idGrup, 'pengemasan_proses'))

      try {
        await writeStatus(supabase, idGrup, 'status_pengemasan', 'Proses')
        await logAutoAction(supabase, idGrup, 'pengemasan', 'Belum', 'Proses')
      } catch {
        return
      }

      // Step 3: pengemasan Proses → Selesai (after packaging timer elapses)
      const handle3 = setTimeout(async () => {
        activeTimers.delete(timerKey(idGrup, 'pengemasan_selesai'))

        try {
          await writeStatus(supabase, idGrup, 'status_pengemasan', 'Selesai')
          await logAutoAction(supabase, idGrup, 'pengemasan', 'Proses', 'Selesai')
        } catch {
          // final phase — silent fail
        }
      }, PENGEMASAN_SELESAI_DELAY_MS)

      activeTimers.set(timerKey(idGrup, 'pengemasan_selesai'), handle3)
    }, PENGEMASAN_PROSES_DELAY_MS)

    activeTimers.set(timerKey(idGrup, 'pengemasan_proses'), handle2)
  }, PENGULITAN_SELESAI_DELAY_MS)

  activeTimers.set(timerKey(idGrup, 'pengulitan_selesai'), handle1)
}

export function cancelTimersForGrup(idGrup: string): void {
  const phases = [
    'pengulitan_proses',
    'pengulitan_selesai',
    'pengemasan_proses',
    'pengemasan_selesai',
  ]
  for (const phase of phases) {
    clearTimer(idGrup, phase)
  }
}

export function getActiveTimerKeys(): string[] {
  return Array.from(activeTimers.keys())
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSABLE 4: useQurbanRealtime
// ═════════════════════════════════════════════════════════════════════════════

export interface QurbanRealtimeOptions {
  channelSuffix: string
  onInsert?: () => void | Promise<void>
  onConnectionLost?: () => void | Promise<void>
}

export function useQurbanRealtime(
  rawData: Ref<GrupHewan[] | null | undefined>,
  opts: QurbanRealtimeOptions
) {
  const supabase = useSupabaseClient()
  const isSyncing = ref(false)
  let channel: RealtimeChannel | null = null

  function applyUpdate(newRow: Partial<GrupHewan> & { id_grup: string }): void {
    if (!rawData.value) return
    const idx = rawData.value.findIndex(
      (g) => String(g.id_grup) === String(newRow.id_grup)
    )
    if (idx === -1) return
    const existing = rawData.value[idx]
    rawData.value[idx] = { ...existing, ...newRow }
  }

  function connect(): void {
    if (channel) return

    const channelName = `grup-hewan-realtime-${opts.channelSuffix}`

    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'grup_hewan' },
        (payload) => {
          applyUpdate(payload.new as GrupHewan)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'grup_hewan' },
        () => {
          opts.onInsert?.()
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          isSyncing.value = true
          console.info(`[useQurbanRealtime:${opts.channelSuffix}] Channel SUBSCRIBED.`)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isSyncing.value = false
          console.warn(`[useQurbanRealtime:${opts.channelSuffix}] Channel ${status}:`, err)
          opts.onConnectionLost?.()
        } else if (status === 'CLOSED') {
          isSyncing.value = false
        }
      })
  }

  async function disconnect(): Promise<void> {
    if (!channel) return
    try {
      await supabase.removeChannel(channel)
    } catch (err) {
      console.warn(`[useQurbanRealtime:${opts.channelSuffix}] Error during disconnect:`, err)
    } finally {
      channel = null
      isSyncing.value = false
    }
  }

  return { connect, disconnect, isSyncing }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSABLE 5: useStateLock
// ═════════════════════════════════════════════════════════════════════════════

export type ActionColor = 'blue' | 'green' | 'orange' | 'purple' | 'gray'

export interface ActiveAction {
  label: string
  color: ActionColor
  kolom: keyof Pick<
    GrupHewan,
    | 'status_kedatangan'
    | 'status_sembelihan'
    | 'status_pengulitan'
    | 'status_pengemasan'
  >
  statusBaru: string
  fase: string
  statusLama: string
  isDisabled: boolean
  triggerAutoTimer: boolean
  cancelTimer: boolean
}

/**
 * The three QR-scan-driven action keys used by the scan gate page.
 * pengemasan is intentionally absent — it is timer-only on the scan gate.
 */
export type ScanGateActionKey = 'kedatangan' | 'sembelihan' | 'pengulitan'

/**
 * Describes which step the scan gate component resolved for the current grup
 * and the current actor role.
 */
export interface ScanGateAction {
  key: ScanGateActionKey
  label: string
}

export interface UseStateLockReturn {
  currentGrup:  Ref<GrupHewan | null>
  /**
   * `activeAction` is preserved for backwards-compatible use on admin/ketua
   * pages that still call executeAction() without a key. The scan gate page
   * uses `resolvedScanAction` + `executeAction(key)` instead.
   */
  activeAction: ComputedRef<ActiveAction | null>
  isLoading:    Ref<boolean>
  isSubmitting: Ref<boolean>
  hasError:     Ref<boolean>
  errorMessage: Ref<string>
  actorName:    Ref<string>
  actorId:      Ref<string>
  /** Role sourced from public.users. Null until setActorIdentity is called. */
  actorRole:    Ref<UserRole | null>
  onQrCodeScanned(qr: string): Promise<void>
  /**
   * Dual-mode executeAction:
   * - Called with a ScanGateActionKey: role-validated, scan-gate path.
   * - Called with no argument: legacy path used by admin/ketua pages that
   *   rely on the `activeAction` computed directly.
   */
  executeAction(actionKey?: ScanGateActionKey): Promise<void>
  /**
   * Stores actor identity (id, name, role) in memory and localStorage.
   * Call this during the onboarding gate after looking up the user in
   * public.users.
   */
  setActorIdentity(id: string, name: string, role?: UserRole | null): void
  resetToScanMode(): void
}

const LS_ACTOR_NAME = 'qurban_actor_name'
const LS_ACTOR_ID   = 'qurban_actor_id'
const LS_ACTOR_ROLE = 'qurban_actor_role'

// ─── Role permission helpers ──────────────────────────────────────────────────

/** Returns true if the given role may perform the given scan-gate action. */
function roleCanPerformAction(role: UserRole | null, key: ScanGateActionKey): boolean {
  if (role === 'ketua') return true           // ketua can do everything

  switch (key) {
    case 'kedatangan':
      // All three roles can confirm arrival
      return role === 'sembelihan' || role === 'pengulitan'

    case 'sembelihan':
      // Only the sembelihan team marks slaughter as done
      return role === 'sembelihan'

    case 'pengulitan':
      // Only the pengulitan team starts skinning
      return role === 'pengulitan'

    default:
      return false
  }
}

// ─── Scan-gate action resolution ─────────────────────────────────────────────

/**
 * Resolves which scan-gate action is next for a grup, regardless of role.
 * Returns null when all QR-driven phases are complete.
 *
 * Phase order (QR-scan driven only):
 *   1. Kedatangan  : Belum → Diterima
 *   2. Sembelihan  : kedatangan=Diterima → Selesai
 *   3. Pengulitan  : sembelihan=Selesai  → Proses   (Proses→Selesai is timer)
 */
function resolveNextScanGateAction(grup: GrupHewan): ScanGateActionKey | null {
  if (grup.status_kedatangan !== 'Diterima') return 'kedatangan'

  if (grup.status_sembelihan !== 'Selesai') return 'sembelihan'

  // QR scan only takes pengulitan from Belum → Proses.
  // Proses and Selesai are handled by the timer page.
  if (grup.status_pengulitan === 'Belum') return 'pengulitan'

  return null // nothing left for QR scan
}

// ─── Legacy full-pipeline action derivation (used by admin/ketua pages) ───────

function deriveAction(grup: GrupHewan): ActiveAction | null {
  const {
    status_kedatangan,
    status_sembelihan,
    status_pengulitan,
    status_pengemasan,
  } = grup

  // All phases complete
  if (
    status_kedatangan === 'Diterima' &&
    status_sembelihan === 'Selesai' &&
    status_pengulitan === 'Selesai' &&
    status_pengemasan === 'Selesai'
  ) {
    return {
      label: 'SELESAI SEMUA FASE',
      color: 'gray',
      kolom: 'status_pengemasan',
      statusBaru: 'Selesai',
      fase: 'pengemasan',
      statusLama: 'Selesai',
      isDisabled: true,
      triggerAutoTimer: false,
      cancelTimer: false,
    }
  }

  // Phase: Kedatangan
  if (status_kedatangan === 'Belum') {
    return {
      label: 'Konfirmasi Kedatangan',
      color: 'blue',
      kolom: 'status_kedatangan',
      statusBaru: 'Diterima',
      fase: 'kedatangan',
      statusLama: 'Belum',
      isDisabled: false,
      triggerAutoTimer: false,
      cancelTimer: false,
    }
  }

  // Phase: Sembelihan
  if (status_kedatangan === 'Diterima' && status_sembelihan === 'Belum') {
    return {
      label: 'Konfirmasi Selesai Sembelihan',
      color: 'green',
      kolom: 'status_sembelihan',
      statusBaru: 'Selesai',
      fase: 'sembelihan',
      statusLama: 'Belum',
      isDisabled: false,
      triggerAutoTimer: true,
      cancelTimer: false,
    }
  }

  // Phase: Pengulitan (manual override for admin/ketua)
  if (
    status_sembelihan === 'Selesai' &&
    (status_pengulitan === 'Belum' || status_pengulitan === 'Proses')
  ) {
    return {
      label: 'Selesaikan Pengulitan (Manual Override)',
      color: 'orange',
      kolom: 'status_pengulitan',
      statusBaru: 'Selesai',
      fase: 'pengulitan',
      statusLama: status_pengulitan,
      isDisabled: false,
      triggerAutoTimer: false,
      cancelTimer: true,
    }
  }

  // Phase: Pengemasan / Distribusi (manual override for admin/ketua)
  if (
    status_pengulitan === 'Selesai' &&
    (status_pengemasan === 'Belum' || status_pengemasan === 'Proses')
  ) {
    return {
      label: 'Selesaikan Distribusi (Manual Override)',
      color: 'purple',
      kolom: 'status_pengemasan',
      statusBaru: 'Selesai',
      fase: 'pengemasan',
      statusLama: status_pengemasan,
      isDisabled: false,
      triggerAutoTimer: false,
      cancelTimer: true,
    }
  }

  return null
}

// ─── Action execution specs ───────────────────────────────────────────────────

interface ScanGateExecutionSpec {
  kolom: keyof Pick<
    GrupHewan,
    'status_kedatangan' | 'status_sembelihan' | 'status_pengulitan'
  >
  statusLama: string
  statusBaru: string
  fase: ScanGateActionKey
  /** Write sembelih_selesai_at timestamp after this action? */
  writeSembelihAt: boolean
  /** Trigger the auto-timer cascade after this action? */
  triggerAutoTimer: boolean
}

function buildScanGateSpec(
  key: ScanGateActionKey,
  grup: GrupHewan
): ScanGateExecutionSpec | null {
  switch (key) {
    case 'kedatangan':
      return {
        kolom: 'status_kedatangan',
        statusLama: grup.status_kedatangan,
        statusBaru: 'Diterima',
        fase: 'kedatangan',
        writeSembelihAt: false,
        triggerAutoTimer: false,
      }

    case 'sembelihan':
      // Guard: kedatangan must already be Diterima
      if (grup.status_kedatangan !== 'Diterima') return null
      return {
        kolom: 'status_sembelihan',
        statusLama: grup.status_sembelihan,
        statusBaru: 'Selesai',
        fase: 'sembelihan',
        writeSembelihAt: true,
        triggerAutoTimer: true,
      }

    case 'pengulitan':
      // Guard: sembelihan must already be Selesai, pengulitan must be Belum
      if (grup.status_sembelihan !== 'Selesai') return null
      if (grup.status_pengulitan !== 'Belum') return null
      return {
        kolom: 'status_pengulitan',
        statusLama: grup.status_pengulitan,
        statusBaru: 'Proses',
        fase: 'pengulitan',
        writeSembelihAt: false,
        triggerAutoTimer: false,
      }

    default:
      return null
  }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useStateLock(): UseStateLockReturn {
  const supabase = useSupabaseClient<Database>()
  const { insertLog } = useActivityLog()

  const currentGrup  = ref<GrupHewan | null>(null)
  const isLoading    = ref(false)
  const isSubmitting = ref(false)
  const hasError     = ref(false)
  const errorMessage = ref('')

  // ── Actor identity (persisted via localStorage) ───────────────────────────
  function readLS(key: string): string {
    if (typeof localStorage === 'undefined') return ''
    return localStorage.getItem(key) ?? ''
  }

  const actorName = ref<string>(readLS(LS_ACTOR_NAME))
  const actorId   = ref<string>(readLS(LS_ACTOR_ID))
  const actorRole = ref<UserRole | null>(
    (readLS(LS_ACTOR_ROLE) as UserRole | '') || null
  )

  // ── Legacy computed (for admin/ketua pages) ───────────────────────────────
  const activeAction = computed<ActiveAction | null>(() => {
    if (!currentGrup.value) return null
    return deriveAction(currentGrup.value)
  })

  // ── Error helpers ─────────────────────────────────────────────────────────
  function setError(msg: string): void {
    hasError.value = true
    errorMessage.value = msg
  }

  function clearError(): void {
    hasError.value = false
    errorMessage.value = ''
  }

  // ── Role refresh: always pull live role from public.users ────────────────
  /**
   * Fetches the actor's current role from public.users by their stored id
   * and updates actorRole + localStorage. Called on every QR scan so that
   * role changes made directly in Supabase are always reflected immediately,
   * without requiring the operator to log out and back in.
   *
   * Runs in parallel with the grup fetch — a failure here is non-fatal;
   * the last known role is kept so the UI stays functional.
   */
  async function refreshActorRole(): Promise<void> {
    const id = actorId.value
    if (!id) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('role, nama')
        .eq('id', id)
        .single()

      if (error || !data) return

      const freshRole = data.role as UserRole
      const freshName = data.nama as string

      // Only write if something actually changed, to avoid unnecessary renders
      if (freshRole !== actorRole.value) {
        actorRole.value = freshRole
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LS_ACTOR_ROLE, freshRole)
        }
      }
      if (freshName && freshName !== actorName.value) {
        actorName.value = freshName
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LS_ACTOR_NAME, freshName)
        }
      }
    } catch {
      // Network or DB error — silently keep existing cached role
    }
  }

  // ── QR scan: load grup from DB + refresh actor role in parallel ───────────
  async function onQrCodeScanned(qr: string): Promise<void> {
    clearError()
    currentGrup.value = null
    isLoading.value = true

    try {
      // Fire both requests simultaneously; role refresh is best-effort
      const [grupResult] = await Promise.all([
        supabase
          .from('grup_hewan')
          .select('*, sohibul_qurban(*)')
          .eq('qr_code_string', qr)
          .single(),
        refreshActorRole(),
      ])

      const { data, error } = grupResult

      if (error || !data) {
        setError(`QR tidak dikenali: ${qr}`)
        return
      }

      currentGrup.value = data as GrupHewan
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Gagal memuat data: ${msg}`)
    } finally {
      isLoading.value = false
    }
  }

  // ── Execute action ────────────────────────────────────────────────────────
  /**
   * Called WITHOUT a key → legacy path for admin/ketua pages.
   * Called WITH a ScanGateActionKey → role-validated scan gate path.
   */
  async function executeAction(actionKey?: ScanGateActionKey): Promise<void> {
    if (!currentGrup.value) return
    clearError()
    isSubmitting.value = true

    try {
      if (actionKey !== undefined) {
        // ── Scan gate path ────────────────────────────────────────────────
        await executeScanGateAction(actionKey)
      } else {
        // ── Legacy path (admin/ketua pages) ───────────────────────────────
        await executeLegacyAction()
      }
    } finally {
      isSubmitting.value = false
    }
  }

  async function executeScanGateAction(key: ScanGateActionKey): Promise<void> {
    const grup = currentGrup.value!

    // 1. Role check
    if (!roleCanPerformAction(actorRole.value, key)) {
      setError(
        `Role "${actorRole.value ?? 'tidak diketahui'}" tidak memiliki izin untuk aksi ini.`
      )
      return
    }

    // 2. Verify the action is still valid against live grup state
    const nextKey = resolveNextScanGateAction(grup)
    if (nextKey !== key) {
      setError(
        nextKey === null
          ? 'Semua fase QR sudah selesai untuk grup ini.'
          : `Fase berikutnya yang diharapkan adalah "${nextKey}", bukan "${key}".`
      )
      return
    }

    // 3. Build execution spec
    const spec = buildScanGateSpec(key, grup)
    if (!spec) {
      setError('Data grup tidak memenuhi prasyarat untuk aksi ini.')
      return
    }

    // 4. Extra fields
    const extraFields: Record<string, unknown> = {}
    if (spec.writeSembelihAt) {
      extraFields.sembelih_selesai_at = new Date().toISOString()
    }

    // 5. DB update
    const { error: updateError } = await supabase
      .from('grup_hewan')
      .update({
        [spec.kolom]: spec.statusBaru,
        updated_by: actorName.value || 'Lapangan',
        ...extraFields,
      })
      .eq('id_grup', grup.id_grup)

    if (updateError) {
      setError(`Gagal menyimpan: ${updateError.message}`)
      return
    }

    // 6. Activity log
    await insertLog({
      id_grup: grup.id_grup,
      actor_id: actorId.value || 'lapangan',
      actor_name: actorName.value || 'Petugas Lapangan',
      fase: spec.fase,
      status_lama: spec.statusLama,
      status_baru: spec.statusBaru,
      action_source: 'qr_scan',
      metadata: {
        role: actorRole.value,
        qr_code_string: grup.qr_code_string,
        label_tampilan: grup.label_tampilan,
      },
    })

    // 7. Auto-timer (only for sembelihan → triggers pengulitan cascade)
    if (spec.triggerAutoTimer) {
      await triggerAutoTimerPengulitan(grup.id_grup)
    }

    // 8. Optimistic local update
    currentGrup.value = {
      ...grup,
      [spec.kolom]: spec.statusBaru,
      ...extraFields,
    } as GrupHewan
  }

  async function executeLegacyAction(): Promise<void> {
    const grup   = currentGrup.value!
    const action = activeAction.value
    if (!action || action.isDisabled) return

    const extraFields: Record<string, unknown> = {}
    if (action.fase === 'sembelihan' && action.statusBaru === 'Selesai') {
      extraFields.sembelih_selesai_at = new Date().toISOString()
    }
    if (action.fase === 'pengulitan' && action.statusBaru === 'Selesai') {
      extraFields.pengulitan_selesai_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('grup_hewan')
      .update({
        [action.kolom]: action.statusBaru,
        updated_by: actorName.value || 'Lapangan',
        ...extraFields,
      })
      .eq('id_grup', grup.id_grup)

    if (updateError) {
      setError(`Error: ${updateError.message}`)
      return
    }

    await insertLog({
      id_grup: grup.id_grup,
      actor_id: actorId.value || 'lapangan',
      actor_name: actorName.value || 'Petugas Lapangan',
      fase: action.fase,
      status_lama: action.statusLama,
      status_baru: action.statusBaru,
      action_source: 'qr_scan',
      metadata: {
        qr_code_string: grup.qr_code_string,
        label_tampilan: grup.label_tampilan,
      },
    })

    if (action.cancelTimer) {
      cancelTimersForGrup(grup.id_grup)
    }
    if (action.triggerAutoTimer) {
      await triggerAutoTimerPengulitan(grup.id_grup)
    }

    currentGrup.value = {
      ...grup,
      [action.kolom]: action.statusBaru,
      ...extraFields,
    } as GrupHewan
  }

  // ── Identity ──────────────────────────────────────────────────────────────
  function setActorIdentity(id: string, name: string, role?: UserRole | null): void {
    actorId.value   = id
    actorName.value = name
    actorRole.value = role ?? null

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_ACTOR_ID,   id)
      localStorage.setItem(LS_ACTOR_NAME, name)
      localStorage.setItem(LS_ACTOR_ROLE, role ?? '')
    }
  }

  function resetToScanMode(): void {
    currentGrup.value  = null
    isLoading.value    = false
    isSubmitting.value = false
    clearError()
  }

  return {
    currentGrup,
    activeAction,
    isLoading,
    isSubmitting,
    hasError,
    errorMessage,
    actorName,
    actorId,
    actorRole,
    onQrCodeScanned,
    executeAction,
    setActorIdentity,
    resetToScanMode,
  }
}