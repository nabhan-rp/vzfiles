# Panduan Cloudflare KV (`PORTAL_KV`) / Cloudflare KV Guide

> **ID:** Panduan membuat **Cloudflare KV Namespace**, menghubungkannya melalui **`wrangler.toml`**, dan memahami alasan tombol **+ Add Bindings** di dashboard Cloudflare Pages terkunci.  
> **EN:** Step-by-step guide to creating a **Cloudflare KV Namespace**, binding **`PORTAL_KV`** via **`wrangler.toml`**, and understanding why the Cloudflare Pages Dashboard **+ Add** Bindings button is locked.

---

## Fungsi Cloudflare KV di VZ Files / Role of Cloudflare KV

- **ID:** Di endpoint `/api/vault` (`functions/api/vault.ts`), **KV (`PORTAL_KV`)** berfungsi sebagai **penyimpanan alternatif tanpa SQL** untuk menyinkronkan **Brankas Multi-Hash SSO** lintas perangkat (`vault:<sub_pengguna>`), apabila Anda tidak menghubungkan database D1 (`DB`).
- **EN:** In `/api/vault` (`functions/api/vault.ts`), **KV (`PORTAL_KV`)** acts as a **zero-SQL storage fallback** for syncing the **SSO Multi-Hash Vault** across devices (`vault:<user_sub>`), whenever a D1 database (`DB`) is not bound.
- **Pilih Salah Satu / Pick One:** Jika Anda sudah menghubungkan **Cloudflare D1 (`DB`)**, **KV tidak wajib dipasang** karena `DB` diprioritaskan lebih dulu oleh `/api/vault`.

---

## Kenapa Tombol Bindings di Dashboard Terkunci? / Why Is Dashboard Bindings Locked?

**ID:** Saat file `wrangler.toml` ada di root repository, Cloudflare Pages menampilkan pesan:  
*`Bindings for this project are being managed through wrangler.toml.`*  
Artinya seluruh binding (`[[d1_databases]]`, `[[kv_namespaces]]`) **harus didefinisikan di `wrangler.toml`**, bukan dari tombol `+ Add` di web dashboard.

**EN:** Whenever `wrangler.toml` exists in your repository root, Cloudflare Pages locks the web UI (`Bindings for this project are being managed through wrangler.toml`) and expects bindings to be declared directly inside `wrangler.toml`.

---

## Langkah 1: Buat KV Namespace / Step 1: Create KV Namespace

### Cara A — Lewat Dashboard Cloudflare / Via Cloudflare Dashboard

1. Buka **Cloudflare Dashboard → Storage & databases → Workers KV** *(atau **KV**)*.
2. Klik **Create a namespace** (atau **Create**).
3. Beri nama, misalnya `vzfiles_kv`, lalu klik **Add**.
4. Salin **Namespace ID** (32 karakter hex) yang muncul di daftar namespace.

### Cara B — Lewat Wrangler CLI / Via Wrangler CLI

```bash
npx wrangler login
npx wrangler kv namespace create PORTAL_KV
```

Untuk environment Preview (opsional):

```bash
npx wrangler kv namespace create PORTAL_KV --preview
```

Salin nilai **`id`** (dan **`preview_id`** bila dibuat) dari output terminal.

---

## Langkah 2: Pasang Binding `PORTAL_KV` / Step 2: Bind `PORTAL_KV`

### Cara A — Lewat `wrangler.toml` (Direkomendasikan jika file `wrangler.toml` tetap dipakai)

Buka `wrangler.toml`, hapus tanda `#` pada blok `[[kv_namespaces]]`, dan masukkan ID namespace Anda:

```toml
[[kv_namespaces]]
binding = "PORTAL_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# Opsional untuk Preview deployments:
# preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

> **PENTING / IMPORTANT:** Nama `binding` **harus persis `PORTAL_KV`** agar cocok dengan `context.env.PORTAL_KV` di `functions/api/vault.ts`.

Setelah itu, `git add wrangler.toml && git commit -m "Bind PORTAL_KV" && git push` ke branch `main`. Cloudflare Pages otomatis membaca binding tersebut pada deploy berikutnya.

### Cara B — Jika Ingin Pakai Tombol `+ Add` di Dashboard UI

1. Hapus `wrangler.toml` dari repository (`git rm wrangler.toml`).
2. Pindahkan variabel yang sebelumnya ada di `[vars]` ke **Settings → Variables and Secrets** di Dashboard Cloudflare Pages.
3. Setelah deploy ulang, tombol **+ Add** di **Settings → Bindings** akan terbuka kembali, lalu tambahkan **KV namespace** dengan variable name `PORTAL_KV`.

---

## Langkah 3: Verifikasi Sinkronisasi / Step 3: Verify Sync

1. Login ke `https://files.vz.gay` menggunakan **Masuk SSO (`accounts.vz.gay`)**.
2. Buka tab **Brankas Multi-Hash SSO** dan tambahkan minimal satu User Hash VikingFile.
3. Periksa label status di kanan atas:
   - **`Tersinkron ke Cloudflare` / `Synced to Cloudflare`** → `PORTAL_KV` aktif dan tersimpan!
4. Anda juga dapat memeriksa key yang tersimpan lewat terminal atau Dashboard KV:

```bash
npx wrangler kv key list --namespace-id="<YOUR_KV_NAMESPACE_ID>"
```
