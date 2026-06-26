@AGENTS.md

# Component Architecture

All pages MUST use components from the `components/` directory. Never inline repeated UI elements directly in page files.

## Atoms (`components/atoms/`)

Small, single-purpose UI primitives:

- `Button` - clickable action element
- `Input` - text input field
- `Label` - form label
- `Badge` - status/tag indicator
- `Logo` - brand logo from `/public/logo.png`
- `Select` - native styled select element
- `SelectSearch` - searchable dropdown with filter input; accepts `options: { value, label }[]`

## Molecules (`components/molecules/`)

Larger, composed UI blocks built from atoms or other molecules:

- `Header` - top navigation bar with user dropdown and sidebar toggle button
- `Sidebar` - side navigation panel; supports `collapsed` (icon-only) and `onClose` (mobile drawer) props
- `AppLayout` - shared interactive layout with collapsible sidebar, mobile drawer, and localStorage persistence; use this in ALL route layouts
- `FormField` - Label + Input combination with optional addon slot
- `Card` - white rounded container with border and shadow
- `StatCard` - metric card with title, value, change indicator, and icon
- `PageHeader` - page title + subtitle heading used at the top of every page
- `Modal` - reusable dialog with header, scrollable body, and footer slot; supports `size` (sm/md/lg), closes on Escape key and backdrop click
- `ConfirmDialog` - delete confirmation popup built on `Modal`; props: `open`, `onClose`, `onConfirm`, `title?`, `description?`, `loading?`; always use this before any delete action — never delete on a single click
- `Pagination` - page navigation with prev/next, numbered pages, ellipsis, and item count; renders nothing when totalPages ≤ 1; always place inside the Card below DataTable

## Rules

- Never show "Total X item terdaftar" or any item count text on list pages.
- Always import from `components/atoms/` or `components/molecules/` in pages.
- If the same UI pattern appears more than once across any pages, extract it into a component immediately.
- Create new atoms/molecules before adding UI directly in a page.
- Do NOT duplicate components - reuse existing ones.
- Atoms must stay generic and reusable; molecules may be domain-specific.
- Page files must contain only layout/composition - no raw styled divs that could be a reusable component.
- **Null values from API must never render as empty.** Always display `<span className="text-gray-400 text-xs">—</span>` for any field that can be `null` or `undefined` in a table cell or display context.

# Icons

Always use **Lucide React** icons with the outline style (default Lucide style is outline). Never use filled/solid variants. Import from `lucide-react`. Never use emoji or Unicode characters as icons.

# Responsive Layout

- All pages must be responsive. Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) throughout.
- On mobile (`< lg`): sidebar is hidden by default and opens as a drawer overlay via the `AppLayout` mobile toggle.
- On desktop (`lg+`): sidebar is visible and collapses to icon-only mode (64px) via the header toggle button.
- Use `AppLayout` for every route layout — never duplicate the Header + Sidebar pattern manually.

# Authentication

Auth is implemented across three layers:

## 1. Proxy (`proxy.ts` at project root)
In Next.js 16, Middleware was renamed to **Proxy**. File is `proxy.ts`, export is `proxy` (not `middleware`).
Server-side route guard using the `auth_token` cookie:
- No token + protected route → redirect to `/login?from=<path>`
- Has token + `/login` → redirect to `/dashboard`

## 2. Storage (`lib/auth.ts`)
Pure utility — no Redux imports. Handles two storage targets:
- `localStorage` key `medassist_auth` — survives page refresh, used to rehydrate Redux
- Cookie `auth_token` — readable by middleware for server-side protection

```ts
saveAuth(user, token)  // write both stores
loadAuth()             // read from localStorage
clearAuth()            // clear both (called on logout and on 401)
```

## 3. Redux (`lib/store/slices/authSlice.ts`)
Actions: `setCredentials`, `logout`, `updateUser`, `updateToken`, `setHydrated`  
Thunk: `fetchMe` — calls `GET /api/auth/me` to verify token and get fresh user data.

State has a `hydrated` flag:
- `false` initially (every page refresh)
- `true` after rehydration attempt completes

## Rehydration flow (AppLayout on page refresh)
1. `hydrated === false` → read localStorage
2. If found: `dispatch(setCredentials(...))` then `dispatch(fetchMe())`
3. If not found: `dispatch(setHydrated())`
4. `fetchMe` 401 → axios interceptor calls `clearAuth()` + `dispatch(logout())`
5. `hydrated && !isAuthenticated` → `router.replace("/login")`

## Auth event locations
| Event | Where |
|---|---|
| Login | `app/login/page.tsx` → `saveAuth` + `setCredentials` + `router.replace(from)` |
| Logout | `Header` → `api.post("/auth/logout")` → `clearAuth` + `dispatch(logout())` + `router.push("/login")` |
| Token expired (401) | axios interceptor → `clearAuth` + `dispatch(logout())` → AppLayout redirects |
| Page refresh | AppLayout `useEffect` → localStorage → Redux |

# Loading States

Every operation that hits the backend **must** show a loading indicator. No silent waits.

## Rules by operation type

| Operation | Loading pattern |
|---|---|
| Fetching list data (GET) | Replace the table/content area with centered `"Memuat data..."` text while `loading === true` |
| Submit button (POST/PUT) | Disable the button + change label to `"Menyimpan..."` while the request is in flight |
| Delete action | Open `ConfirmDialog` on first click; after confirmation, disable row with `isRowLoading` + show `"Menghapus..."` in the dialog button; never delete on a single click |
| Modal prefill (GET before edit) | Show `"Memuat data..."` inside the modal body while `modalLoading === true` |
| Page-level auth/rehydration | No full-page spinner needed; sidebar/header renders from cached state immediately |

## Implementation pattern

```tsx
// List fetch
{loading ? (
  <div className="py-16 text-center text-sm text-gray-400">Memuat data...</div>
) : (
  <DataTable ... />
)}

// Submit button
<Button disabled={saving} ...>
  {saving ? "Menyimpan..." : "Simpan"}
</Button>

// Modal prefill
{modalLoading ? (
  <div className="py-10 text-center text-sm text-gray-400">Memuat data...</div>
) : (
  <form .../>
)}

// Delete confirmation (always required before any delete)
const [deleteTarget, setDeleteTarget] = useState<T | null>(null)
const [deletingId, setDeletingId] = useState<number | null>(null)

// DataTable:
//   onDelete={(row) => setDeleteTarget(row)}
//   isRowLoading={(row) => deletingId === row.id}

async function handleDelete() {
  if (!deleteTarget) return
  setDeletingId(deleteTarget.id)
  try {
    await api.delete(`/resource/${deleteTarget.id}`)
    dispatch(invalidate())
    setDeleteTarget(null)
  } finally {
    setDeletingId(null)
  }
}

<ConfirmDialog
  open={deleteTarget !== null}
  onClose={() => setDeleteTarget(null)}
  onConfirm={handleDelete}
  loading={deletingId !== null}
/>
```

## State naming convention
- `loading` — list/page data fetch in progress
- `saving` — POST or PUT in progress  
- `modalLoading` — GET prefill for edit modal in progress
- `deleting` — DELETE in progress (use when the row needs per-row state)

Always set the flag **before** the `await`, clear it in `finally`.

# State Management & API Caching

All API-backed list pages MUST use Redux global state via slices in `lib/store/slices/`. Data is cached in the store so navigating away and back does **not** re-fetch from the API.

## Slice structure

Each resource slice (`menuSlice.ts`, `authoritySlice.ts`, etc.) follows this shape:

```ts
type ResourceState = {
  items: T[]
  totalItems: number
  totalPages: number
  page: number       // last fetched page (drives the async thunk)
  search: string     // last fetched search query
  loading: boolean
  loaded: boolean    // true after first successful fetch
  dirty: boolean     // true after a mutation — triggers re-fetch
}
```

## Async thunk pattern

The thunk reads `page` and `search` directly from its own slice state — never accept them as arguments:

```ts
export const fetchItems = createAsyncThunk("resource/fetch", async (_, { getState }) => {
  const { page, search } = (getState() as { resource: ResourceState }).resource
  const res = await api.get("/resource", { params: { page, search: search || undefined } })
  return res.data.data
})
```

Avoid importing `RootState` inside slice files — use an inline cast `{ resource: ResourceState }` to prevent circular imports.

## Cache / re-fetch logic in pages

```ts
useEffect(() => {
  if (loaded && !dirty) return   // cache hit → skip fetch
  dispatch(fetchItems())
}, [loaded, dirty, dispatch])
```

- Search change → dispatch `setSearch(value)` → sets `loaded = false` → triggers re-fetch
- Page change → dispatch `setPage(n)` → sets `loaded = false` → triggers re-fetch
- After POST/PUT/DELETE → dispatch `invalidate()` → sets `dirty = true` → triggers re-fetch
- Navigate away and back → `loaded` still `true`, `dirty` still `false` → no re-fetch ✓

## Typed hooks

Always import from `lib/store/hooks.ts`, never use raw `useDispatch`/`useSelector`:

```ts
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks"
```

## Adding a new resource

1. Create `lib/store/slices/fooSlice.ts` following the pattern above
2. Register it in `lib/store/index.ts` under the `reducer` key
3. In the page, replace local `useState` list state with `useAppSelector((s) => s.foo)`

# Search

Search bar pada setiap halaman list **harus** menggunakan tombol Cari — bukan live search (jangan `onChange` langsung dispatch ke Redux).

## Pattern

```tsx
const [searchInput, setSearchInput] = useState(search) // draft lokal, belum ke Redux

function handleSearch(e: React.FormEvent) {
  e.preventDefault()
  dispatch(setSearch(searchInput))
}
```

## UI

```tsx
<form onSubmit={handleSearch} className="flex gap-2 w-full">
  <div className="relative flex-1">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
    <Input
      placeholder="Cari..."
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      className="pl-9"
    />
  </div>
  <Button type="submit" className="bg-[#075489] hover:bg-[#075489]/90 text-white shrink-0">
    Cari
  </Button>
</form>
```

## Rules

- Search bar wajib ada di **semua** halaman list, tanpa terkecuali.
- Search bar harus **full-width** — jangan beri `max-w` atau `sm:max-w-*`.
- `searchInput` adalah state lokal (draft). Dispatch ke Redux (atau set `searchQuery`) hanya saat form submit.
- Tekan Enter juga harus trigger search (gunakan `<form onSubmit>`).
- Untuk halaman dengan data lokal (bukan Redux), gunakan state `searchQuery` terpisah yang di-set saat submit, lalu filter `data` dengan `.filter()`.
- Selalu reset ke halaman 1 saat search dijalankan.

# Brand Colors

- Primary dark: `#075489`
- Primary teal: `#4ba69d`

Use these as the main brand colors across all pages and components.

# API Reference

Base URL: `/api` (via axios instance with Bearer token interceptor)

## Auth (`/api/auth`)

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| POST | `/auth/register` | Bearer (wajib) | Daftarkan user baru — hanya admin yang login |
| POST | `/auth/login` | Tidak | Login dengan username + password |
| POST | `/auth/logout` | Bearer (wajib) | Hapus token saat ini |
| GET | `/auth/me` | Bearer (wajib) | Ambil data user + menus (untuk rehydrasi) |
| PUT | `/auth/update` | Bearer (wajib) | Update profil + password opsional (token lama tetap aktif) |
| PUT | `/auth/profile` | Bearer (wajib) | Update profil saja (name, username, email) |
| PUT | `/auth/change-password` | Bearer (wajib) | Ganti password — sesi perangkat LAIN dicabut, sesi perangkat ini dipertahankan |

### POST `/auth/register`
Body: `name`, `username`, `email`, `password`, `password_confirmation` (semua wajib)  
Response 201: `{ data: { user, token } }`  
Response 422: `{ errors: { field: [msg] } }`

### POST `/auth/login`
Body: `username`, `password`  
Response 200: `{ data: { user: { ...profile, authority: { menus: [...] } }, token } }`  
`menus` adalah flat list — bangun tree dengan `buildMenuTree()` di Sidebar  
Response 401: kredensial salah | Response 403: akun dinonaktifkan

### GET `/auth/me`
Response 200: `{ data: { ...user, authority: { menus: [...] } } }` — struktur `menus` sama dengan login

### PUT `/auth/update`
Body: `name`, `username`, `email` (wajib) + `password`, `password_confirmation` (opsional — kirim hanya jika ingin ganti password)  
Tidak memerlukan `current_password`. Token lama tetap aktif setelah update.  
Response 200: `{ data: { id, name, username, email, updated_at } }`  
Response 422: `{ errors: { field: [msg] } }` atau `{ message: "..." }`

### PUT `/auth/profile`
Body: `name`, `username`, `email` (semua wajib)  
Response 200: `{ data: { id, name, username, email, updated_at } }`

### PUT `/auth/change-password`
Body: `current_password`, `password`, `password_confirmation` (semua wajib)  
Hanya sesi di perangkat **lain** yang dicabut; sesi perangkat yang melakukan ganti password tetap aktif (token tidak berubah).  
Response 200: `{ data: { token } }` — token sama dengan yang sedang dipakai; tetap di-`saveAuth` agar store & cookie konsisten  
Response 422: `{ message: "Password saat ini tidak sesuai." }`
