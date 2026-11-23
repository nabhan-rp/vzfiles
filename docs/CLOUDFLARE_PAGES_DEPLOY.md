# Panduan Deploy Cloudflare Pages / Cloudflare Pages Deployment Guide

> **ID:** Panduan membangun dan menerbitkan **VZ Files** ke **Cloudflare Pages** dengan dukungan Pages Functions (`/functions/api/*`), middleware wildcard proxy (`functions/_middleware.js`), serta domain kustom `files.vz.gay` / `file.vz.gay`.  
> **EN:** Guide for building and deploying **VZ Files** to **Cloudflare Pages** with Pages Functions (`/functions/api/*`), wildcard proxy middleware (`functions/_middleware.js`), and custom domains `files.vz.gay` / `file.vz.gay`.

---

## 1. Perbedaan Pages vs Workers / Pages vs Workers Configuration

**ID:** Repository ini menggunakan struktur **Cloudflare Pages** (`pages_build_output_dir = "dist"` di `wrangler.toml` + folder `functions/`). Jangan gunakan perintah deploy milik Workers (`npx wrangler deploy`) karena akan gagal mencari entry-point Worker.  
**EN:** This repository targets **Cloudflare Pages** (`pages_build_output_dir = "dist"` in `wrangler.toml` + `functions/` directory). Do not run the Workers deploy command (`npx wrangler deploy`), as it expects a standalone Worker script entry-point.

### Pengaturan Build di Cloudflare Pages / Cloudflare Pages Build Settings

| Pengaturan / Setting | Nilai / Value |
| :--- | :--- |
| **Framework preset** | `Vite` (atau `None`) |
| **Build command** | `bun run build` *(atau `npm run build`)* |
| **Build output directory** | `dist` |
| **Root directory** | `/` |
| **CLI Deploy (jika manual)** | `npx wrangler pages deploy dist --project-name=vzfiles` |

---

## 2. Middleware Proteksi `.pages.dev` (`functions/_middleware.js`)

**ID:** File `functions/_middleware.js` memblokir akses langsung ke domain bawaan `*.pages.dev` (mengembalikan HTTP `404 Not Found`) **kecuali** request datang melalui edge proxy `vz.gay` yang menyisipkan header `X-Proxy-Origin: vz-wildcard-proxy`:

```js
const viaProxy = req.headers.get("X-Proxy-Origin") === "vz-wildcard-proxy";
if (host.endsWith(".pages.dev") && !viaProxy) {
  return new Response("Not Found", { status: 404 });
}
```

**EN:** `functions/_middleware.js` blocks direct access to raw `*.pages.dev` URLs (returning `404 Not Found`) unless the request arrives via the `vz.gay` wildcard proxy carrying `X-Proxy-Origin: vz-wildcard-proxy`.

### Catatan Penting / Important Notes
- **ID:** Pastikan domain `files.vz.gay` dan `file.vz.gay` sudah diarahkan melalui Cloudflare Custom Domain atau Wildcard Proxy `vz.gay` yang meneruskan header `X-Proxy-Origin: vz-wildcard-proxy`.
- **EN:** Ensure `files.vz.gay` and `file.vz.gay` are routed either via Cloudflare Pages Custom Domains or via the `vz.gay` wildcard proxy injecting `X-Proxy-Origin: vz-wildcard-proxy`.

---

## 3. Daftar Periksa Produksi / Production Checklist

1. **Build Env Vars**: Set `VITE_AUTH0_DOMAIN=accounts.vz.gay` dan `VITE_AUTH0_CLIENT_ID=wxhySCLqtKPGy53uEVWvH2RumGdIp1DP` (opsional, karena sudah menjadi default aplikasi) di **Settings → Variables and Secrets**.
2. **D1 / KV Bindings (Opsional)**: Hubungkan D1 (`DB`) atau KV (`PORTAL_KV`) lewat `wrangler.toml` agar Brankas Multi-Hash tersinkron lintas perangkat. Lihat [Panduan Cloudflare D1](./CLOUDFLARE_D1.md).
3. **Auth0 URLs**: Pastikan `https://files.vz.gay/` dan `https://file.vz.gay/` terdaftar di Allowed Callback URLs, Allowed Logout URLs, dan Allowed Web Origins pada Auth0 tenant `galbay`. Lihat [Integrasi Auth0 SSO](./AUTH0_SSO.md).
4. **Security Headers (`public/_headers`)**: Header `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, dan `Referrer-Policy: strict-origin-when-cross-origin` otomatis diterapkan oleh Cloudflare Pages.
