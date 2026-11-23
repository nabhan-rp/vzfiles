# Integrasi Auth0 SSO (`accounts.vz.gay`) / Auth0 SSO Integration

> **ID:** Panduan lengkap menghubungkan **VZ Files (`files.vz.gay` / `file.vz.gay`)** dengan **Auth0 tenant `galbay`** (`galbay.eu.auth0.com`) menggunakan custom domain **`accounts.vz.gay`** dan SDK resmi `@auth0/auth0-spa-js` v2.  
> **EN:** Complete guide to connecting **VZ Files (`files.vz.gay` / `file.vz.gay`)** to **Auth0 tenant `galbay`** (`galbay.eu.auth0.com`) using the verified custom domain **`accounts.vz.gay`** and the official `@auth0/auth0-spa-js` v2 SDK.

---

## Ringkasan Konfigurasi Tenant / Tenant Summary

| Parameter | Nilai / Value |
| :--- | :--- |
| **Auth0 Tenant** | `galbay` (`galbay.eu.auth0.com`, EU Region) |
| **Verified Custom Domain** | `accounts.vz.gay` |
| **Application Type** | Single Page Web Application (SPA) |
| **SDK** | `@auth0/auth0-spa-js` v2 (`useRefreshTokens: true`, `cacheLocation: 'localstorage'`) |
| **Account Portal** | `https://myaccount.vz.gay` |

---

## Langkah 1: Konfigurasi di Auth0 Dashboard (`galbay`) / Step 1: Configure Auth0 Dashboard

1. Buka [Auth0 Dashboard](https://manage.auth0.com/dashboard/eu/galbay) untuk tenant **`galbay`**.
2. Pilih **Applications → Applications → Create Application**.
3. Masukkan nama `VZ Files` dan pilih **Single Page Web Applications**.
4. Masuk ke tab **Settings**, salin **Client ID**, dan isi URL berikut:

| Kolom Auth0 / Field | Nilai Produksi / Production Values |
| :--- | :--- |
| **Allowed Callback URLs** | `https://files.vz.gay/callback, https://file.vz.gay/callback` |
| **Allowed Logout URLs** | `https://files.vz.gay, https://file.vz.gay` |
| **Allowed Web Origins** | `https://files.vz.gay, https://file.vz.gay` |

> **ID:** Jika Anda juga melakukan pengujian dari `http://localhost:3000`, tambahkan `http://localhost:3000/callback` dan `http://localhost:3000` ke daftar di atas.  
> **EN:** If testing locally on `http://localhost:3000`, append `http://localhost:3000/callback` and `http://localhost:3000` to the lists above.

5. Klik **Save Changes**.

---

## Langkah 2: Variabel Environment / Step 2: Environment Variables

### Lokal (`.env`) / Local Development

```env
VITE_AUTH0_DOMAIN="accounts.vz.gay"
VITE_AUTH0_CLIENT_ID="YOUR_SPA_CLIENT_ID"
VITE_AUTH0_REDIRECT_URI="http://localhost:3000/callback"
VITE_ACCOUNT_PORTAL_URL="https://myaccount.vz.gay"
```

### Cloudflare Pages (`Settings → Variables and Secrets`)

- `VITE_AUTH0_DOMAIN` = `accounts.vz.gay`
- `VITE_AUTH0_CLIENT_ID` = `<Client ID SPA dari Auth0>`
- `VITE_AUTH0_REDIRECT_URI` = `https://files.vz.gay/callback` *(opsional—jika dikosongkan, kode otomatis memakai `${window.location.origin}/callback` sehingga mendukung `files.vz.gay` dan `file.vz.gay` sekaligus)*
- `VITE_ACCOUNT_PORTAL_URL` = `https://myaccount.vz.gay`

> **ID:** Variabel `VITE_*` dibaca saat proses build (`vite build`). Setelah mengubahnya di Cloudflare Pages, jalankan **Retry deployment**.  
> **EN:** `VITE_*` variables are baked in during `vite build`. After editing them in Cloudflare Pages, trigger a new deployment.

---

## Langkah 3: Alur Autentikasi & Keamanan / Step 3: Authentication & Security Flow

1. **Login Redirect (`loginWithRedirect`)**: Browser mengarahkan pengguna ke `https://accounts.vz.gay/authorize` (PKCE S256).
2. **Callback (`/callback`)**: Setelah login berhasil, `handleRedirectCallback()` menukar authorization code menjadi token dan membersihkan query `?code=...&state=...` dari URL.
3. **SSO Lintas Subdomain `*.vz.gay`**: Karena seluruh layanan `vz.gay` memakai tenant `galbay` (`accounts.vz.gay`), sesi login dari subdomain lain seperti `myaccount.vz.gay` otomatis dikenali.
4. **Verifikasi Token di `/api/vault`**: Saat sinkronisasi Brankas Multi-Hash ke Cloudflare D1/KV, client mengirim `Authorization: Bearer <token>` dari `getTokenSilently()`. Backend memverifikasi token langsung ke `https://accounts.vz.gay/userinfo` untuk memperoleh `sub` pengguna yang sah sebelum membaca/menulis data.
5. **Mode Pratinjau Tanpa Client ID**: Jika `VITE_AUTH0_CLIENT_ID` belum diisi, aplikasi otomatis mengaktifkan sesi ruang kerja lokal pada modal SSO agar fitur Multi-Hash tetap dapat diuji.
