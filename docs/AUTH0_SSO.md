# Integrasi Auth0 SSO (`accounts.vz.gay`) / Auth0 SSO Integration

> **ID:** Panduan lengkap menghubungkan **VZ Files (`files.vz.gay` / `file.vz.gay`)** dengan **Auth0 tenant `galbay`** (`galbay.eu.auth0.com`) menggunakan custom domain **`accounts.vz.gay`** dan SDK resmi **`@auth0/auth0-react` v2** (`Auth0Provider` + `useAuth0`).  
> **EN:** Complete guide to connecting **VZ Files (`files.vz.gay` / `file.vz.gay`)** to **Auth0 tenant `galbay`** (`galbay.eu.auth0.com`) using the verified custom domain **`accounts.vz.gay`** and the official **`@auth0/auth0-react` v2** SDK (`Auth0Provider` + `useAuth0`).

---

## Ringkasan Konfigurasi Tenant / Tenant Summary

| Parameter | Nilai / Value |
| :--- | :--- |
| **Auth0 Tenant** | `galbay` (`galbay.eu.auth0.com`, EU Region) |
| **Verified Custom Domain** | `accounts.vz.gay` |
| **Client ID (SPA)** | `wxhySCLqtKPGy53uEVWvH2RumGdIp1DP` |
| **Application Type** | Single Page Web Application (`spa`, Token Endpoint Auth: `none`) |
| **SDK** | `@auth0/auth0-react` v2 (`Auth0Provider` + `useAuth0`, `useRefreshTokens: true`, `cacheLocation: 'localstorage'`) |
| **Account Portal** | `https://myaccount.vz.gay` |

---

## Langkah 1: Konfigurasi di Auth0 Dashboard (`galbay`) / Step 1: Configure Auth0 Dashboard

1. Buka [Auth0 Dashboard](https://manage.auth0.com/dashboard/eu/galbay) untuk tenant **`galbay`**, lalu pilih aplikasi **VZ Files** (`wxhySCLqtKPGy53uEVWvH2RumGdIp1DP`).
2. Di tab **Settings**, pastikan daftar URL berikut sudah tersimpan (memakai trailing slash `/` sesuai pengaturan root aplikasi):

| Kolom Auth0 / Field | Nilai Produksi / Production Values |
| :--- | :--- |
| **Allowed Callback URLs** | `https://files.vz.gay/`, `https://file.vz.gay/` |
| **Allowed Logout URLs** | `https://files.vz.gay/`, `https://file.vz.gay/` |
| **Allowed Web Origins** | `https://files.vz.gay/`, `https://file.vz.gay/` |

> **ID:** Jika Anda juga melakukan pengujian Auth0 dari `http://localhost:3000/`, tambahkan `http://localhost:3000/` ke tiga kolom di atas dan pastikan server berjalan di port tetap `3000`.  
> **EN:** If testing Auth0 locally on `http://localhost:3000/`, add `http://localhost:3000/` to all three fields above and keep the local server on port `3000`.

3. Klik **Save Changes**.

---

## Langkah 2: Variabel Environment / Step 2: Environment Variables

Secara bawaan aplikasi sudah memakai `accounts.vz.gay`, Client ID `wxhySCLqtKPGy53uEVWvH2RumGdIp1DP`, dan `${window.location.origin}/` sebagai `redirect_uri` & `returnTo`, serta dapat di-override lewat variabel `VITE_*` berikut:

### Lokal (`.env`) / Local Development

```env
VITE_AUTH0_DOMAIN="accounts.vz.gay"
VITE_AUTH0_CLIENT_ID="wxhySCLqtKPGy53uEVWvH2RumGdIp1DP"
# Opsional / Optional: override jika memakai origin lokal tertentu
# VITE_AUTH0_REDIRECT_URI="http://localhost:3000/"
VITE_ACCOUNT_PORTAL_URL="https://myaccount.vz.gay"
```

### Cloudflare Pages (`Settings → Variables and Secrets`)

- `VITE_AUTH0_DOMAIN` = `accounts.vz.gay`
- `VITE_AUTH0_CLIENT_ID` = `wxhySCLqtKPGy53uEVWvH2RumGdIp1DP`
- `VITE_AUTH0_REDIRECT_URI` = *(biarkan tidak diset agar otomatis mengikuti `${window.location.origin}/` untuk `https://files.vz.gay/` dan `https://file.vz.gay/` secara dinamis)*
- `VITE_ACCOUNT_PORTAL_URL` = `https://myaccount.vz.gay`

> **ID:** Variabel `VITE_*` dibaca saat build (`vite build`). Setelah mengubahnya di Cloudflare Pages, jalankan **Retry deployment**.  
> **EN:** `VITE_*` variables are baked in during `vite build`. After editing them in Cloudflare Pages, trigger a new deployment.

---

## Langkah 3: Alur Autentikasi & Keamanan / Step 3: Authentication & Security Flow

1. **Root `Auth0Provider`**: Membungkus `<App />` dengan `domain="accounts.vz.gay"`, `clientId`, dan `authorizationParams={{ redirect_uri: `${window.location.origin}/`, scope: 'openid profile email' }}`.
2. **Login & Signup (`useAuth0`)**:
   - **Masuk SSO**: memanggil `loginWithRedirect()`.
   - **Daftar Akun Baru**: memanggil `loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })`.
3. **Callback Root (`/`)**: Setelah autentikasi di `https://accounts.vz.gay`, Auth0 kembali ke `https://files.vz.gay/?code=...&state=...` (atau `https://file.vz.gay/?code=...&state=...`). `onRedirectCallback` menukar code PKCE secara otomatis lalu membersihkan parameter `?code=` & `&state=` dari address bar.
4. **SSO Lintas Subdomain `*.vz.gay`**: Karena memakai custom domain `accounts.vz.gay` pada tenant `galbay`, sesi pengguna tetap tersambung dengan `myaccount.vz.gay`.
5. **Verifikasi Token di `/api/vault`**: Saat sinkronisasi Brankas Multi-Hash ke Cloudflare D1/KV, `useSsoVault` mengambil token lewat `getAccessTokenSilently()` dan mengirim `Authorization: Bearer <token>`. Endpoint `/api/vault` memverifikasi token tersebut ke `https://accounts.vz.gay/userinfo` untuk memperoleh `sub` yang sah sebelum membaca/menyimpan ke D1 (`user_vaults`) atau KV.
6. **Logout**: Memanggil `logout({ logoutParams: { returnTo: `${window.location.origin}/` } })` agar pengguna kembali ke halaman root subdomain aktif.
