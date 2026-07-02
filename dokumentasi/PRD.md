# PRD — Care Pulse Frontend (fe-care-pulse)

**Produk:** Care Pulse — Sistem Manajemen CSSD & Clinical Pathway Rumah Sakit
**Komponen:** Frontend (Web App)
**Framework:** Next.js 16 (App Router) + React 19 + TypeScript 5
**Styling:** Tailwind CSS v4 · Radix UI · ikon Lucide React (outline)
**State:** Redux Toolkit + react-redux (per-resource slices dengan cache)
**HTTP:** Axios (Bearer token interceptor + 401 handler)
**Realtime:** Laravel Echo + Pusher · **QR:** html5-qrcode + qrcode.react · **Excel:** xlsx
**Backend:** be-care-pulse (Laravel 12 REST API), base URL `/api`
**Versi Dokumen:** 1.0
**Tanggal:** 2026-07-01
**Sumber Kebenaran:** disusun dari struktur `app/`, `components/`, `lib/store/`, dan `CLAUDE.md`/`AGENTS.md` yang aktif.

---

## 1. Tujuan Produk

Antarmuka web untuk dua alur kerja rumah sakit yang dilayani backend Care Pulse:

1. **CSSD** — mengelola permintaan (order) instrumen dan memandu petugas melalui pipeline pemrosesan (cuci → kemas → steril → simpan → distribusi), plus monitoring realtime dan papan display TV.
2. **Clinical Pathway** — menyusun kategori/template/formulir berbasis diagnosa dan mengisi asesmen per-pasien dengan ceklis, varian, verifikasi, dan cetak PDF.

Aplikasi wajib **responsive** (mobile drawer + desktop collapsible sidebar) dan menampilkan **loading state di setiap operasi backend**.

---

## 2. Arsitektur Aplikasi

### 2.1 Routing (App Router)
- `app/login` — halaman login (publik).
- `app/(app)/*` — route group terproteksi dengan `AppLayout` (Header + Sidebar). Berisi seluruh modul: `dashboard`, `master/*`, `cssd/*`, `clinical-pathway/*`, `pengaturan/*`, `monitor`.
- `app/monitor`, `app/monitor/all`, `app/monitor/[ruangan_id]` — **papan display TV** (di luar layout aplikasi, fullscreen) untuk monitoring order/ruangan realtime.

### 2.2 Proteksi Route — `proxy.ts` (root)
Di Next.js 16, Middleware bernama **Proxy** (`proxy.ts`, export `proxy`). Server-side guard berbasis cookie `auth_token`:
- Tanpa token + route terproteksi → redirect `/login?from=<path>`.
- Ada token + `/login` → redirect `/dashboard`.

### 2.3 Autentikasi (tiga lapis)
1. **Proxy** — guard server-side via cookie.
2. **`lib/auth.ts`** — utilitas storage murni: `saveAuth` (localStorage `medassist_auth` + cookie `auth_token`), `loadAuth`, `clearAuth`.
3. **`lib/store/slices/authSlice.ts`** — Redux: `setCredentials`, `logout`, `updateUser`, `updateToken`, `setHydrated`; thunk `fetchMe` (GET `/auth/me`). Flag `hydrated` mengontrol rehidrasi saat refresh; 401 dari interceptor axios → `clearAuth` + `logout` → AppLayout redirect ke `/login`.

Menu sidebar **dinamis** dari `authority.menus` (flat list) yang dibangun ke tree via `buildMenuTree()`.

### 2.4 State & Cache (Redux)
Setiap list page memakai slice per-resource (`lib/store/slices/*`) dengan bentuk `{ items, totalItems, totalPages, page, search, loading, loaded, dirty }`. Thunk membaca `page`/`search` dari state-nya sendiri. Pola cache: `if (loaded && !dirty) return` — navigasi bolak-balik **tidak** re-fetch; mutasi memanggil `invalidate()` (set `dirty`). Selalu pakai typed hooks `useAppDispatch`/`useAppSelector` dari `lib/store/hooks.ts`.

Slice yang ada: auth, authority, user, menu, titleMenu, condition, room, instrument, bmhp, icd10, order, orderTransfer, distribution, distribute, cleaning, sterilization, sterilizePipeline, storage, monitoring, washerMachine, notif, categoriClinicalPathway, templateClinicalPathway, asesmenClinicalPathway.

### 2.5 Realtime (`lib/echo.ts`, `lib/notifSound.ts`)
Laravel Echo + Pusher mendengarkan event backend untuk memperbarui papan monitoring dan memunculkan notifikasi order masuk (dengan suara via `notifSound`) melalui `notifSlice`.

---

## 3. Struktur Komponen (Atomic)

Aturan wajib (`AGENTS.md`): semua halaman menyusun UI dari `components/atoms/` dan `components/molecules/` — tidak boleh inline UI berulang. Pola yang muncul >1× harus diekstrak jadi komponen.

- **Atoms:** `Button`, `Input`, `Label`, `Badge`, `Logo`, `Select`, `SelectSearch`, `Checkbox`, `Radio`, `Switch`, `Textarea`, `Spinner`, `Barcode`.
- **Molecules:** `AppLayout` (sidebar collapsible + mobile drawer + persistensi localStorage), `Header`, `Sidebar`, `Footer`, `PageHeader`, `Card`, `StatCard`, `FormField`, `Modal`, `ConfirmDialog` (wajib sebelum semua delete), `Pagination`, `DataTable`, `Icd10SearchSelect`, `OrderStatusTracker`, `OrderTimeline`, `RoomDistributionCard`, `DistributeReady`, `CleaningTab`, `PackagingTab`, `SterilizationTab`.

**Aturan render:** nilai `null`/`undefined` di tabel/tampilan **tidak boleh** kosong — tampilkan `<span className="text-gray-400 text-xs">—</span>`. Jangan tampilkan teks jumlah item ("Total X item").

---

## 4. Modul & Halaman

### 4.1 Umum
| Route | Fungsi |
|---|---|
| `/login` | login username + password |
| `/dashboard` | ringkasan / StatCard |
| `/pengaturan/profil` | update profil & ganti password |
| `/pengaturan/sesi` | manajemen sesi aktif (revoke perangkat) |

### 4.2 Master Data (`/master/*`)
`user` (+detail `[id]`), `otoritas`, `menu`, `title-menu`, `ruangan`, `kondisi`, `instrumen`, `katalog-instrumen`, `bmhp`, `icd-10` (impor Excel), `mesin-washer`.

### 4.3 CSSD (`/cssd/*`)
| Route | Fungsi |
|---|---|
| `order/instrumen` (+`tambah`) | daftar & buat order instrumen |
| `produksi` | produksi CSSD internal (batch dari stok CSSD) |
| `sterilisasi` | tab pipeline: cleaning → packaging → sterilisasi |
| `storage-steril` | penyimpanan unit steril ke rak + inventaris |
| `distribusi` | distribusi alat steril ke ruangan + RM pasien |
| `kedaluwarsa` | batch steril yang akan/sudah kadaluarsa |
| `monitoring` | monitoring order/ruangan realtime |
| `laporan` | laporan CSSD per alat |

Halaman `monitor` (`/monitor`, `/monitor/all`, `/monitor/[ruangan_id]`) adalah papan display fullscreen berbasis realtime.

### 4.4 Clinical Pathway (`/clinical-pathway/*`)
| Route | Fungsi |
|---|---|
| `kategori` | kelola kategori/section formulir |
| `formulir` (+`[id]/formulir`) | template + susun poin/sub-poin per formulir |
| `asesmen` (+`[id]`) | pengisian CP per pasien: ceklis auto-save, varian, verifikasi, cetak PDF |

---

## 5. Pola Wajib UI

### 5.1 Loading State
Setiap operasi backend menampilkan indikator (tanpa silent wait):
| Operasi | Pola |
|---|---|
| Fetch list (GET) | ganti area tabel dengan `"Memuat data..."` saat `loading` |
| Submit (POST/PUT) | disable tombol + label `"Menyimpan..."` saat `saving` |
| Delete | `ConfirmDialog` dulu → disable row `isRowLoading` + `"Menghapus..."` |
| Prefill modal edit | `"Memuat data..."` dalam body saat `modalLoading` |

Konvensi state: `loading` / `saving` / `modalLoading` / `deleting`. Set flag **sebelum** `await`, clear di `finally`.

### 5.2 Search
Wajib ada di semua list page, **full-width**, memakai **tombol Cari** (bukan live search) via `<form onSubmit>` — draft `searchInput` lokal, dispatch `setSearch` hanya saat submit. Enter memicu search; selalu reset ke halaman 1.

### 5.3 Delete
Selalu lewat `ConfirmDialog` — **tidak pernah** delete pada satu klik.

### 5.4 Responsive
Gunakan prefix `sm:`/`md:`/`lg:`. Mobile (`<lg`): sidebar drawer overlay. Desktop (`lg+`): sidebar visible, collapse ke icon-only (64px). Selalu pakai `AppLayout` — jangan duplikasi Header+Sidebar.

---

## 6. Branding
- Primary dark: `#075489`
- Primary teal: `#4ba69d`

Ikon: **Lucide React outline** saja — tanpa varian solid/filled, tanpa emoji/Unicode sebagai ikon.

---

## 7. Integrasi Backend
Semua panggilan lewat instance Axios (`lib/axios.ts`) dengan interceptor Bearer token dan handler 401. Kontrak endpoint mengikuti `be-care-pulse` — lihat `be-care-pulse/dokumentasi/` (PRD backend & dok per-controller). Response sukses berbentuk `{ status, message, data }`; list memakai paginate Laravel (`data`, `current_page`, `last_page`, `per_page`, `total`).

## 8. Catatan Next.js 16
Versi ini punya breaking changes (lihat `AGENTS.md`) — baca panduan di `node_modules/next/dist/docs/` sebelum menulis kode. Middleware → **Proxy** (`proxy.ts`). Tailwind v4 memakai `@import "tailwindcss"`.

## 9. Perintah Utama
```bash
npm run dev     # next dev
npm run build   # next build
npm run start   # next start
npm run lint    # eslint
```
