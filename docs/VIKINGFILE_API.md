# Arsitektur & API VikingFile / VikingFile API & Architecture

> **ID:** Referensi teknis integrasi **API VikingFile** (`https://vikingfile.com/api`) di **VZ Files (`files.vz.gay` / `file.vz.gay`)**, mencakup alur upload multipart, relay CORS fallback, remote URL, halaman info non-direct, kode QR, serta atribusi sponsor.  
> **EN:** Technical reference for the **VikingFile API** (`https://vikingfile.com/api`) integration in **VZ Files (`files.vz.gay` / `file.vz.gay`)**, covering multipart uploads, CORS relay fallback, remote URL fetching, non-direct download routing, QR sharing, and attribution.

---

## 1. Endpoint Proxy Same-Origin (`/api/viking/*`)

**ID:** Seluruh panggilan metadata ke `vikingfile.com/api/*` melewati proxy backend same-origin (`server.ts` saat lokal, `functions/api/viking/[action].ts` di Cloudflare Pages) agar bebas kendala CORS browser.  
**EN:** All metadata calls to `vikingfile.com/api/*` route through a same-origin backend proxy (`server.ts` locally, `functions/api/viking/[action].ts` on Cloudflare Pages) to eliminate browser CORS restrictions.

| Route | Method | Fungsi (ID) | Purpose (EN) |
| :--- | :--- | :--- | :--- |
| `/api/viking/get-upload-url` | `POST` | Meminta URL presigned multipart berdasarkan `size` (byte). | Requests multipart presigned URLs given `size` in bytes. |
| `/api/viking/upload-part` | `PUT` | Relay fallback untuk `PUT` bagian file jika CORS S3/OVH memblokir header `ETag`. | Fallback chunk relay for `PUT` parts if S3/OVH CORS blocks the `ETag` header. |
| `/api/viking/complete-upload` | `POST` | Menggabungkan seluruh `PartNumber` + `ETag` menjadi tautan file final. | Finalizes uploaded parts (`PartNumber` + `ETag`) into a live file link. |
| `/api/viking/get-server` | `GET` | Mengambil server upload aktif dari VikingFile. | Retrieves an active upload server from VikingFile. |
| `/api/viking/legacy-upload` | `POST` | Fallback unggah tunggal jika `get-upload-url` gagal (untuk file $\le 200$ MB). | Single-request upload fallback when `get-upload-url` fails (files $\le 200$ MB). |
| `/api/viking/remote-upload` | `POST` | Mengunggah berkas dari URL `HTTP/HTTPS` remote (`link`, `user`, `name`, `path`). | Uploads a file from a remote `HTTP/HTTPS` URL (`link`, `user`, `name`, `path`). |
| `/api/viking/check-file` | `POST` | Memeriksa ketersediaan, nama, dan ukuran file (1 hingga 100 hash sekaligus). | Verifies availability, filename, and size (1 up to 100 hashes at once). |
| `/api/viking/list-files` | `POST` | Mengambil daftar file terpaginasi milik sebuah User Hash (`user`, `page`, `path`). | Lists paginated files belonging to a User Hash (`user`, `page`, `path`). |
| `/api/viking/rename-file` | `POST` | Mengubah nama file jarak jauh (`hash`, `user`, `filename`). | Renames a remote file (`hash`, `user`, `filename`). |
| `/api/viking/delete-file` | `POST` | Menghapus file jarak jauh (`hash`, `user`). | Deletes a remote file (`hash`, `user`). |

---

## 2. Strategi Upload & Fallback / Upload & Fallback Strategy

1. **Direct Multipart First:** Browser memotong berkas sesuai `partSize` dari `get-upload-url` (umumnya 10 MB ke endpoint presigned `*.io.cloud.ovh.net` / `*.vikingfile.com`) dan mengirim `PUT` langsung dengan pelacakan progres XHR.
2. **Automatic Relay Fallback:** Jika browser memblokir header `ETag` karena kebijakan CORS presigned URL, bagian tersebut otomatis dikirim ulang melalui `PUT /api/viking/upload-part` (yang memvalidasi domain target secara ketat agar terhindar dari SSRF) sehingga `ETag` tetap terbaca dan upload berhasil.
3. **Anonymous vs SSO User Hash:**
   - **Mode Anonim (`user=""`):** Mendukung unggah berkas, remote URL, cek file, QR code, dan riwayat lokal browser.
   - **Mode VZ SSO (`user="<hash>"`):** Pengguna dapat menyimpan banyak User Hash berbeda, menambahkan prefiks `path` (misal `vz-files/...`), serta mengelola file (`list-files`, `rename-file`, `delete-file`).

---

## 3. Halaman Info Non-Direct & QR Code / Non-Direct Info Page & QR Code

- **Tautan Bagikan (`files.vz.gay/?f=<hash>` atau `/f/<hash>`):** Membuka kartu verifikasi file (`CheckFilePanel`) yang menampilkan nama file, ukuran (`tabular-nums`), status ketersediaan, tombol **Copy Link** dengan umpan balik visual, dan panel **QR Code** (target dapat dipilih antara tautan VZ Files atau VikingFile, lengkap dengan unduhan PNG).
- **Penghormatan Pendapatan Iklan VikingFile:** Tombol **Unduh di VikingFile / Download on VikingFile** mengarahkan pengunjung langsung ke halaman resmi `https://vikingfile.com/f/<hash>` dan tidak mem-bypass halaman unduhan penyedia penyimpanan.

---

## 4. Atribusi Legal & Sponsor / Legal & Sponsor Attribution

- **PT Galeri Langkah Bahagia Yuwana (`galbay`):** Menaungi ekosistem **`vz.gay`** (termasuk **VZ Files**) dan **`jajanserver.com`**.
- **VikingFiles ([vikingfiles.com](https://vikingfiles.com) / [vikingfile.com](https://vikingfile.com)):** Dikreditkan khusus pada subdomain `file.vz.gay` / `files.vz.gay` sebagai penyedia API transfer & penyimpanan sementara, lengkap dengan modal **Ketentuan Layanan (ToS)** dan **Kebijakan Privasi**.
