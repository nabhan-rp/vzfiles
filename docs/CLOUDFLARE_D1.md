# Panduan Koneksi Cloudflare D1 / Cloudflare D1 Connection Guide

> **ID:** Panduan lengkap untuk membuat database **Cloudflare D1**, menjalankan migrasi tabel `user_vaults`, dan menghubungkan binding **`DB`** ke project **Cloudflare Pages (`vzfiles`)** agar daftar User Hash di **Brankas Multi-Hash SSO** tersinkron lintas perangkat.  
> **EN:** Step-by-step guide to create a **Cloudflare D1** database, apply the `user_vaults` migration, and bind **`DB`** to your **Cloudflare Pages (`vzfiles`)** project for cross-device **SSO Multi-Hash Vault** synchronization.

---

## Bagaimana Cara Kerja D1 di VZ Files? / How D1 Works in VZ Files

1. **ID:** Aplikasi **tetap berjalan normal tanpa D1** (memakai `localStorage` di browser). Namun, jika pengguna login lewat **Auth0 SSO (`accounts.vz.gay`)** di HP dan Laptop yang berbeda, daftar User Hash hanya ikut berpindah perangkat bila D1 (atau KV) terhubung.
   **EN:** The app **works without D1** (using browser `localStorage`). However, when signing in via **Auth0 SSO (`accounts.vz.gay`)** across multiple devices, saved User Hashes only sync across devices when D1 (or KV) is bound.
2. Endpoint `/api/vault` (`GET` & `PUT`) di Cloudflare Pages Functions membaca `context.env.DB`:
   - Memverifikasi `Authorization: Bearer <token>` langsung ke `https://accounts.vz.gay/userinfo` untuk memperoleh `sub` pengguna yang valid.
   - Membaca/menyimpan baris pada tabel `user_vaults` berdasarkan `sub`.

---

## Langkah 1: Buat Database D1 / Step 1: Create a D1 Database

Anda bisa memilih **Cara A (Dashboard Cloudflare)** atau **Cara B (Wrangler CLI)**.

### Cara A — Lewat Dashboard Cloudflare / Via Cloudflare Dashboard

1. Masuk ke **Cloudflare Dashboard** → pilih akun Anda.
2. Di sidebar kiri, buka **Storage & databases → D1 SQL database**.
3. Klik **Create** (atau **Create database**).
4. Isi nama database, misalnya: `vzfiles_db`, pilih lokasi terdekat (misal *APAC* atau *EEUR* / *Automatic*), lalu klik **Create**.

### Cara B — Lewat Wrangler CLI / Via Wrangler CLI

```bash
npx wrangler login
npx wrangler d1 create vzfiles_db
```

Simpan nilai **`database_id`** yang muncul di output terminal.

---

## Langkah 2: Jalankan Migrasi Skema SQL / Step 2: Run SQL Schema Migration

Repository menyediakan dua file skema di folder `cloudflare/`:

- **`cloudflare/vz-files-schema.sql`** *(Direkomendasikan untuk database baru khusus VZ Files)* — hanya membuat tabel `user_vaults` dan indeksnya.
- **`cloudflare/schema.sql`** — berisi tabel portal ekosistem lama (`services`, `redirect_rules`) **plus** tabel `user_vaults`.

### Lewat Dashboard Cloudflare (Console) / Via Cloudflare Dashboard Console

1. Buka database `vzfiles_db` di menu **D1 SQL database**.
2. Pilih tab **Console**.
3. Salin dan jalankan isi `cloudflare/vz-files-schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_vaults (
  sub TEXT PRIMARY KEY,
  profiles_json TEXT NOT NULL DEFAULT '[]',
  active_profile_id TEXT DEFAULT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_vaults_updated_at
  ON user_vaults (updated_at);
```

### Lewat Wrangler CLI / Via Wrangler CLI

```bash
# Terapkan ke database produksi (remote) / Apply to production database
npx wrangler d1 execute vzfiles_db --remote --file=./cloudflare/vz-files-schema.sql

# Verifikasi tabel sudah terbuat / Verify table exists
npx wrangler d1 execute vzfiles_db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

---

## Langkah 3: Hubungkan Binding `DB` ke Cloudflare Pages / Step 3: Bind `DB` to Cloudflare Pages

> **PENTING / IMPORTANT:**
> - Nama binding **harus persis `DB`** (huruf besar semua), karena kode di `functions/api/vault.ts` mengakses `context.env.DB`.
> - Karena repository ini memiliki file **`wrangler.toml`**, Cloudflare Pages otomatis **mengunci tombol `+ Add` Bindings di Dashboard** (*"Bindings for this project are being managed through wrangler.toml"*).

### Cara A — Lewat `wrangler.toml` (Aktif / Direkomendasikan)

1. Buka `wrangler.toml` di root repository.
2. Pastikan `name = "vzfiles"` sesuai dengan nama project Cloudflare Pages Anda.
3. Hapus komentar (`#`) pada blok `[[d1_databases]]` dan isi `database_name` serta `database_id` milik Anda:

```toml
[[d1_databases]]
binding = "DB"
database_name = "vzfiles_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

4. Commit dan `push` ke GitHub (`main`) — Cloudflare Pages akan otomatis mengikat database `DB` saat build berikutnya.

### Cara B — Lewat Dashboard UI (Hanya jika `wrangler.toml` dihapus)

Jika Anda lebih suka mengelola seluruh binding dan environment variables lewat klik di Dashboard Cloudflare Pages:
1. Hapus `wrangler.toml` dari repo (`git rm wrangler.toml`) dan pindahkan isi `[vars]` ke **Settings → Variables and Secrets**.
2. Setelah deploy ulang, tombol **+ Add** di **Settings → Bindings** akan aktif kembali.
3. Klik **Add → D1 database**, isi **Variable name:** `DB`, pilih **`vzfiles_db`** pada **Production** *(dan **Preview** jika perlu)*, lalu **Save**.

---

## Langkah 4: Verifikasi Sinkronisasi / Step 4: Verify Sync

1. Buka `https://files.vz.gay` dan login melalui **Masuk SSO (`accounts.vz.gay`)**.
2. Buka tab **Brankas Multi-Hash SSO**.
3. Di kanan atas panel profil aktif, perhatikan keterangan status:
   - **`Tersinkron ke Cloudflare` / `Synced to Cloudflare`** → Koneksi D1 berhasil!
   - **`Tersimpan lokal di browser` / `Stored locally in browser`** → Binding `DB` (atau `PORTAL_KV`) belum terhubung, atau belum login via Auth0 SSO.
4. Anda juga bisa mengecek isi data langsung dari terminal:

```bash
npx wrangler d1 execute vzfiles_db --remote --command="SELECT sub, active_profile_id, updated_at FROM user_vaults;"
```
