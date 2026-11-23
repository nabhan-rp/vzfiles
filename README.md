# VZ Files (`files.vz.gay` · `file.vz.gay`)

> **ID:** Layanan transfer & berbagi file sementara tanpa penyimpanan berkas di server `vz.gay`, bertenaga API **VikingFile** dan terintegrasi **Auth0 SSO (`accounts.vz.gay`)**.  
> **EN:** Ephemeral file transfer and sharing service with zero server-side file retention on `vz.gay`, powered by the **VikingFile API** and integrated with **Auth0 SSO (`accounts.vz.gay`)**.

---

## Ringkasan Fitur / Feature Overview

| Fitur / Feature | Bahasa Indonesia | English |
| :--- | :--- | :--- |
| **Transfer File Multipart** | Unggah berkas lokal bertahap (`get-upload-url` → `PUT` bagian file → `complete-upload`) dengan fallback relay aman bila CORS menghalangi header `ETag`. | Chunked local file uploads (`get-upload-url` → part `PUT` → `complete-upload`) with automatic same-origin relay fallback if CORS blocks `ETag` headers. |
| **Remote URL Upload** | Tarik berkas langsung dari tautan `HTTP/HTTPS` eksternal ke VikingFile dengan opsi nama berkas dan `path` folder. | Fetch external `HTTP/HTTPS` URLs directly into VikingFile with optional custom filename and folder `path`. |
| **Info File & Unduhan Non-Direct** | Tautan bagikan `files.vz.gay/?f=<hash>` menampilkan info file, **Copy Link**, serta **QR Code** (PNG), sementara tombol unduh diarahkan ke `vikingfile.com/f/<hash>`. | Share links `files.vz.gay/?f=<hash>` render a verified info card, **Copy Link** feedback, and **QR Code** (PNG), while downloads route to `vikingfile.com/f/<hash>`. |
| **Brankas Multi-Hash SSO** | Login via **VZ SSO (`accounts.vz.gay`)** untuk menyimpan, mengganti, dan mengelola beberapa **User Hash VikingFile** (`list-files`, `rename-file`, `delete-file`). | Sign in via **VZ SSO (`accounts.vz.gay`)** to store, switch, and manage multiple **VikingFile User Hashes** (`list-files`, `rename-file`, `delete-file`). |
| **Sinkronisasi Hybrid D1/KV** | Tersimpan langsung di `localStorage` dan opsional tersinkronisasi lintas perangkat lewat Cloudflare **D1** atau **KV** (`/api/vault`). | Immediate `localStorage` persistence with optional cross-device sync via Cloudflare **D1** or **KV** (`/api/vault`). |
| **Dwibahasa & Tema** | Pengalih bahasa **ID / EN** dan tema **Sistem / Terang / Gelap**. | Built-in **ID / EN** language toggle and **System / Light / Dark** theme switcher. |

---

## Arsitektur Singkat / Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, `qrcode`, `@auth0/auth0-react` v2
- **Local / Node Dev Server:** Express + `vite.middlewares` (`server.ts`, port `3000`)
- **Production Edge Runtime:** Cloudflare Pages + Cloudflare Pages Functions (`/functions/api/*`, `/functions/_middleware.js`)
- **Optional Cloud Sync:** Cloudflare D1 (`DB` binding) atau Cloudflare KV (`PORTAL_KV` binding)

---

## Menjalankan Secara Lokal / Local Quick Start

### 1. Instalasi Dependensi / Install Dependencies

```bash
npm install
# atau / or
bun install
```

### 2. Konfigurasi Environment / Configure Environment

Salin `.env.example` menjadi `.env` (untuk mode pratinjau lokal, `VITE_AUTH0_CLIENT_ID` boleh dikosongkan terlebih dahulu):

```bash
cp .env.example .env
```

```env
VITE_AUTH0_DOMAIN="accounts.vz.gay"
VITE_AUTH0_CLIENT_ID="wxhySCLqtKPGy53uEVWvH2RumGdIp1DP"
# VITE_AUTH0_REDIRECT_URI="http://localhost:3000/"
VITE_ACCOUNT_PORTAL_URL="https://myaccount.vz.gay"
```

### 3. Jalankan Dev Server / Start Dev Server

```bash
npm run dev
```

Aplikasi berjalan di `http://localhost:3000` dengan proxy API `/api/viking/*` dan `/api/vault` aktif di server yang sama.

### 4. Build & Pemeriksaan Tipe / Build & Typecheck

```bash
npm run lint
npm run build
```

---

## Indeks Dokumentasi / Documentation Index (`/docs`)

| Dokumen / Document | Deskripsi (ID) | Description (EN) |
| :--- | :--- | :--- |
| [Panduan Cloudflare D1](./docs/CLOUDFLARE_D1.md) | Cara membuat, migrasi tabel `user_vaults`, dan menghubungkan binding `DB` lewat `wrangler.toml`. | How to provision, migrate `user_vaults`, and bind `DB` via `wrangler.toml`. |
| [Panduan Cloudflare KV](./docs/CLOUDFLARE_KV.md) | Cara membuat KV Namespace, menghubungkan binding `PORTAL_KV` lewat `wrangler.toml`, dan verifikasi sync. | How to create a KV Namespace, bind `PORTAL_KV` via `wrangler.toml`, and verify sync. |
| [Integrasi Auth0 SSO](./docs/AUTH0_SSO.md) | Tutorial lengkap setup tenant `galbay` (`accounts.vz.gay`) dan `@auth0/auth0-react`. | Complete guide for tenant `galbay` (`accounts.vz.gay`) and `@auth0/auth0-react`. |
| [Deploy Cloudflare Pages](./docs/CLOUDFLARE_PAGES_DEPLOY.md) | Pengaturan build Pages, wildcard proxy (`_middleware.js`), dan domain kustom. | Pages build settings, wildcard proxy (`_middleware.js`), and custom domains. |
| [API VikingFile & Arsitektur](./docs/VIKINGFILE_API.md) | Referensi endpoint `/api/viking/*`, fallback CORS relay, QR code, dan ToS/Privasi. | Reference for `/api/viking/*`, CORS relay fallback, QR code, and ToS/Privacy. |

---

## Naungan & Kredit / Corporate Umbrella & Credits

- **Naungan / Corporate Umbrella:** Ekosistem **`vz.gay`** (termasuk **VZ Files** di `files.vz.gay` / `file.vz.gay`) dan **`jajanserver.com`** beroperasi di bawah satu naungan **galbay — PT Galeri Langkah Bahagia Yuwana**.
- **Kredit Infrastruktur File (Khusus `file.vz.gay` / `files.vz.gay`):** Penyimpanan sementara, unggahan multipart, dan tautan unduhan ditenagai oleh API **VikingFiles** ([vikingfiles.com](https://vikingfiles.com) / [vikingfile.com](https://vikingfile.com)).
