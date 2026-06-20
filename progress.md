# AhsanTV Qurban Monitor System V2 — Progress & Handoff

## Project Identity
- **App**: AhsanTV Qurban Monitor System V2
- **Stack**: Nuxt 3, Supabase (Postgres + Realtime + Storage), TypeScript, Tailwind CSS
- **Design system**: Emerald Governance (`design.md`) — Inter font only, deep green primary `#003527`, teal secondary `#006a61`, sidebar-dark `#022C22`
- **Owner**: Kakuy (frontend/fullstack dev, works independently)
- **Working preference**: Full untruncated file outputs, max 4 files per batch, Indonesian + technical English mixed

---

## Pages Produced

### `pages/index.vue` — TV Monitor Display (public, fullscreen)
- **Purpose**: Fullscreen TV display shown at the event. Read-only, no interaction.
- **Data**: `grup_hewan.select('*, sohibul_qurban(*)')`. One row per grup.
- **Layout** (preserved from V1 exactly):
  - Header: AhsanTV logo left, large title + Hijri/Masehi date badge center, date+time box right
  - Step cards row: 4 phase cards with step-arrow connectors; turns `bg-emerald-800` at 100%
  - Full-height table: 10 rows per page, zebra stripe, shimmer animation on page change
  - Bottom 3-panel row: summary counts, conic-gradient progress circles, legend + page indicator
  - Footer: Quranic quote (QS. Al-Kautsar: 2)
- **Pagination**: `visibleGrups` (filtered by `hiddenGroupIds`) chunked by 10. `totalPages = ceil(n / 10)`.
- **Composables**: `use12ValueScore` → `phaseMetrics`, `globalPercentage`, `totalScore`, `maxTotalScore`; `useQurbanRealtime`
- **Broadcast channel**: `page-sync-channel` — listens: `PAGE_CHANGED`, `MANUAL_PAGE_CHANGE`, `update-hidden-groups`, `remote-reload`
- **Colors**: Full Emerald Governance tokens. Last column is "Skor" (X/4 bar) — V2 has no `keterangan` field.

### `pages/admin.vue` — Admin Dashboard (password-protected)
- **Purpose**: CRUD panel — update statuses, control TV page, hide grups, export Excel, view activity log.
- **Guard**: `definePageMeta({ middleware: 'admin-auth' })` — bounces to `/admin-login` if cookie missing.
- **Data**: Same query. Admin table shows ALL `filteredRows` (scrollable, not paginated). `chunkedGrup` drives TV page buttons only.
- **TV pagination (`chunkedGrup`)**: Chunks `grup_hewan` rows (NOT sohibul members) by 10. 21 grups → 3 page buttons. Mirrors `index.vue` exactly.
- **Desktop**: auto-timer cycles pages every 6s, broadcasts `PAGE_CHANGED`
- **Mobile**: timer disabled, sends `MANUAL_PAGE_CHANGE`, receives `PAGE_CHANGED` passively
- **Mutation**: Optimistic update + rollback on error, in-flight lock `isMutatingId`, ripple on click, `insertLog` after every write
- **Hidden groups**: Persisted to `localStorage` (`qurban_hidden_group_ids`), broadcast via `update-hidden-groups`
- **Activity Log Feed (`.alf-root`)**: Width `480px` (user confirmed). Auto-scrolls to top on new entries, pause on manual scroll. `overflow-x:auto` per row — no clipping.
- **Export**: XLSX via `xlsx`, `filteredRows` expanded per sohibul member
- **Composables**: `useQurbanRealtime`, `use12ValueScore`, `useActivityLog`

### `pages/admin-login.vue` — Login Gate
- **Purpose**: Password entry page protecting `/admin`.
- **Design**: Emerald Governance — `#003527` full-page bg with radial glow, white card max-width 420px, Inter only.
- **Features**: Show/hide toggle, shake on wrong password, loading spinner, Enter key submits, auto-focus on mount.
- **Flow**: `POST /api/admin-auth` → server sets cookie → `navigateTo('/admin')` on success
- **Error**: Displays 401 `statusMessage`, clears input, refocuses

### `pages/scan.index.vue` — One-Gate QR Scanner (field PWA)
- **Purpose**: Mobile PWA for field operators (panitia lapangan). Scan QR → see grup info → execute next locked phase action in one tap. No free-form editing — action determined by `useStateLock` server-side.
- **Layout**: `definePageMeta({ layout: 'lapangan' })` — fullscreen fixed, portrait mobile, safe-area-inset padded.
- **Font**: Inter exclusively (replaced original VT323 + IBM Plex Mono terminal fonts per Emerald Governance).
- **Color transformation** (old CRT phosphor-green → Emerald Governance):
  | Old | New | Token |
  |---|---|---|
  | `#020502` bg | `#022C22` | sidebar-dark |
  | `#0A0D0A` card | `#003527` | primary |
  | `#4AFF8A` phosphor | `#95d3ba` / `#ffffff` | inverse-primary |
  | `#2D8F4E` dim | `#80bea6` | on-primary-container |
  | `#FFB84A` amber accent | `#86f2e4` | secondary-container |
  | amber execute btn | `#006a61` bg + white text | secondary |
  | `#4AFF8A` crosshair | `#95d3ba` | inverse-primary |
  | `#4AFF8A` sweep line | `#86f2e4` | secondary-container |
  | `#4AFF8A` success icon | `#16A34A` | status-completed |
- **Status display**: Replaced inline `style="{color:statusColor()}"` with design.md chip classes (`pill-selesai`, `pill-proses`, `pill-belum`) — light bg + bold text + pill border.
- **Shapes**: Cards `rounded-lg (0.5rem)`, inputs/buttons `rounded-md (0.375rem)`, chips `9999px`
- **Spinner**: CSS border-spin `div` replaces `◌` character animation
- **All logic preserved 100%**: `useStateLock`, `html5-qrcode` scanner, `resolveBackCamera`, audio beep, vibrate, success overlay timer, error banner, operator name, `handleReset`, `handleExecuteAction` — zero changes.

---

## Auth System

### `server/api/admin-auth.post.ts`
- Reads `ADMIN_PASSWORD` from `process.env` (`.env`: `ADMIN_PASSWORD=ahsantvadminqurban`)
- Throws 401 on mismatch; on success sets `qurban_admin_auth=granted`
  - `httpOnly: false` — **intentional**: `useCookie()` reads `document.cookie` client-side; `httpOnly` would make it invisible to JS and break the middleware check. The value `'granted'` is not sensitive — the actual secret never leaves the server.
  - `sameSite: strict`, `secure: true` (prod), `maxAge: 8 hours`, `path: /`

### `middleware/admin-auth.ts`
- `useCookie('qurban_admin_auth')` — if not `'granted'` → redirect to `/admin-login`
- Works SSR (reads request headers) and client-side after hydration

### Fixed Bug
Original had `httpOnly: true` → cookie invisible to JS → `useCookie()` always returned `null` → middleware always redirected even after correct password. Fixed: `httpOnly: false`.

---

## V2 Composables (pre-existing, not regenerated this session)
All in `composables/useQurbanEngine.ts` (may be split files):
- `useQurbanRealtime(rawData, options)` — Supabase Realtime subscription, reconnect, `isSyncing`
- `use12ValueScore(grupList)` — `phaseMetrics`, `globalPercentage`, `totalScore`, `maxTotalScore`. Scoring: Belum=0, Proses=1, Selesai/Diterima=3 (max 12 per grup)
- `useActivityLog()` — `liveLogs`, `insertLog`, `loadRecentHistory`, `subscribe`, `unsubscribe`, `clearView`
- `useStateLock()` — used by `scan.index.vue`. Exposes: `currentGrup`, `activeAction`, `isLoading`, `isSubmitting`, `hasError`, `errorMessage`, `actorName`, `actorId`, `onQrCodeScanned`, `executeAction`, `setActorIdentity`, `resetToScanMode`. **Not produced this session — verify it exists before running scan page.**

---

## Database Schema (V2)
- `grup_hewan`: `id_grup`, `jenis_hewan`, `label_tampilan`, `status_kedatangan`, `status_sembelihan`, `status_pengulitan`, `status_pengemasan`, `is_timer_active`, `qr_code_string`, `updated_by`
- `sohibul_qurban`: `id`, `nama`, `id_grup` (FK → grup_hewan)
- `activity_log`: `id`, `id_grup`, `actor_id`, `actor_name`, `fase`, `status_lama`, `status_baru`, `action_source`, `metadata`, `created_at`
- **Query pattern**: always `grup_hewan.select('*, sohibul_qurban(*)')` — grups primary, sohibul children

## Broadcast Events (`page-sync-channel`)
| Event | Sender | Receiver | Purpose |
|---|---|---|---|
| `PAGE_CHANGED` | Admin desktop | Monitor + Admin mobile | Auto-timer advance |
| `MANUAL_PAGE_CHANGE` | Admin mobile | Monitor + Admin desktop | Manual tap |
| `update-hidden-groups` | Admin (any) | Monitor TV | Sync hidden IDs |
| `remote-reload` | Admin | Monitor TV | Force reload |

---

---

## Session Log

### Session: Emerald Governance Color Migration — `sembelihan.vue` & `pengulitan.vue`
- **Task**: Apply `design.md` (Emerald Governance) color preset to both lapangan PWA pages, replacing old CRT phosphor-green aesthetic.
- **Status**: ✅ Complete

#### Color token mapping applied (both files):
| Old (CRT) | New (Emerald Governance) | Token |
|---|---|---|
| `#020502` root bg | `#022C22` | `sidebar-dark` |
| `#0A0D0A` card/header bg | `#003527` | `primary` |
| `#4AFF8A` phosphor accent | `#95d3ba` / `#ffffff` | `inverse-primary` |
| `#2D8F4E` dim/muted text | `#80bea6` | `on-primary-container` |
| `#FFB84A` amber accent (proses) | `#86f2e4` | `secondary-container` |
| amber execute button | `#006a61` bg + `#ffffff` text | `secondary` |
| `#FCA5A5` belum stat | `#EF4444` | `status-unpaid` |
| `#86EFAC` selesai stat | `#16A34A` | `status-completed` |
| VT323 + IBM Plex Mono fonts | Inter 400/500/600/700 | `typography` |

#### Per-file notes:

**`sembelihan.vue`**
- Root bg `#022C22`, header/card bg `#003527`
- Stats: belum=`#EF4444`, selesai=`#16A34A`, total=`#95d3ba`
- Execute button (KONFIRMASI SELESAI): `#006a61` solid + white text
- ID chips: pill `border-radius:9999px`, color `#95d3ba`
- Done badge: pill, color `#16A34A`
- Spinners: CSS border-spin `div` (replaces `◌` character)
- Skeleton shimmer: `#003527` base with `rgba(149,211,186,0.15)` highlight
- `theme-color` meta updated to `#022C22`
- Google Fonts link updated: Inter only (removed VT323 + IBM Plex Mono)

**`pengulitan.vue`**
- Same base palette as sembelihan
- Proses accent uses `#86f2e4` (secondary-container) for section heading, dot, chip bg
- Chip `chip--proses`: bg `#86f2e4`, text `#006f66` (`on-secondary-container`) — matches design.md chip contrast rules
- Action buttons: `action-btn--belum` = `#006a61` (secondary); `action-btn--proses` = `#064e3b` (primary-container) + `#80bea6` text
- Status trail pills: `trail--active` uses `#86f2e4` bg / `#006f66` text; `trail--done` uses green semantic
- Timer urgency: ok=`#95d3ba`, warning=`#F59E0B` (status-pending), critical/expired=`#EF4444` (status-unpaid)
- Footer brand accent: `#86f2e4` (differentiates from sembelihan which uses `#95d3ba`)
- All logic (advanceStatus, timerDisplay, timerUrgencyClass, realtime, clock, locks) — zero changes

#### What was NOT changed (logic preserved 100%):
- All composable imports and calls
- All Supabase queries and realtime subscriptions
- All mutation logic, optimistic updates, rollbacks
- All audio (playBeep), vibration, success timers
- All computed properties and template structure
- `definePageMeta`, `useHead` (except font link + theme-color)

---

### Session: Photo Upload Removal + QR Nav Hook — `sembelihan.vue` & `pengulitan.vue`
- **Task**: Remove all V1 photo upload features; add QR scanner navigation button; preserve all core logic.
- **Status**: ✅ Complete

#### Removed (both files):
| Item | Type | Reason |
|---|---|---|
| `uploadingId`, `uploadError`, `uploadSuccessId`, `_uploadSuccessTimer` | state refs | photo upload state, no longer needed |
| `STORAGE_BUCKET` constant | const | supabase storage target, removed with upload |
| `handlePhotoUpload()` | function | file input handler + supabase storage upload + foto_lapangan insert |
| `.smb-photo-btn` / `.pgl-photo-btn` + variants | template + CSS | camera button UI, file input, upload/success labels |
| `photo-input-hidden` hidden `<input type="file">` | template | file picker trigger |
| `uploadSuccessId` checks in done-card section | template | "TAMBAH FOTO" button on completed cards |
| CSS classes: `.smb-photo-btn`, `.photo-btn--*`, `.photo-icon`, `.photo-spinner`, `.photo-label`, `.photo-input-hidden` | CSS | all photo button styling |
| `useStateLock` import (sembelihan) | import | was imported but only used for operator name init; replaced with direct `localStorage` pattern matching pengulitan |

#### Added (both files):
- **`openQrScanner()`** — `router.push('/scan?fase=sembelihan')` / `router.push('/scan?fase=pengulitan')`
- **`useRouter`** import from `vue-router`
- **QR CTA bar** — full-width `#006a61` button "BUKA KAMERA QR SCAN" placed between stats bar and banners
  - CSS classes: `.smb-qr-bar` / `.pgl-qr-bar`, `.smb-qr-btn` / `.pgl-qr-btn`, `.smb-qr-icon` / `.pgl-qr-icon`

#### Refactored (sembelihan.vue only):
- Operator identity now uses `localStorage` directly (`qurban_actor_name` / `qurban_actor_id`) — same pattern as pengulitan, removing the `useStateLock` dependency that was previously used only to seed the operator name on mount.
- Realtime handler now guards against in-flight mutations (skips update if `mutatingId === updated.id_grup`) — matches pengulitan's existing Set-based guard pattern.

#### Preserved 100% (both files):
- Optimistic update + rollback on error
- Mutation lock guard (`mutatingId` / `mutatingIds` Set)
- `insertLog` after every write
- Supabase realtime subscription + reconnect
- `playBeep` + `vibrate` feedback
- Success flash + timer
- Countdown timer display + urgency classes (pengulitan)
- `timerActiveCount` banner (pengulitan)
- `cancelTimersForGrup` call on Selesai (pengulitan)
- All computed sections (grupBelum, grupProses, grupSelesai)
- Status trail breadcrumb UI (pengulitan)
- Skeleton loading + empty state
- Emerald Governance color tokens (from previous session)

---

## File Map (all outputs across sessions)
```
pages/
  index.vue             ← TV monitor display (V1 UI + V2 data + design tokens)
  admin.vue             ← Admin dashboard (protected, full CRUD + activity log)
  admin-login.vue       ← Password gate (Emerald Governance design)
  scan.index.vue        ← One-Gate QR scanner PWA (Emerald Governance, mobile-first)
  sembelihan.vue        ← Sembelihan lapangan PWA (✅ Emerald Governance | ✅ Photo upload removed | ✅ QR nav added)
  pengulitan.vue        ← Pengulitan lapangan PWA (✅ Emerald Governance | ✅ Photo upload removed | ✅ QR nav added)

middleware/
  admin-auth.ts         ← Route guard (useCookie check)

server/api/
  admin-auth.post.ts    ← Password validation + cookie setter
```