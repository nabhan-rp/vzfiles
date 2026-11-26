# Changelog

Semua perubahan penting pada **VZ Files** (`files.vz.gay` & `file.vz.gay`) didokumentasikan pada berkas ini.
Format mengacu pada [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-11-26

Pembaruan fitur **Tempat Sampah (Recycle Bin)** berretensi 14 hari untuk riwayat unggahan yang dihapus, perluasan kapasitas penyimpanan hingga **1.024 entri**, serta paginasi fleksibel **25 / 50 / 100 / SEMUA**.

### Ditambahkan (Added)
- **Tempat Sampah Riwayat (Retensi Otomatis 14 Hari)**: Menghapus satu entri atau semua riwayat kini memindahkannya ke Tempat Sampah (`deleted_at`) selama 14 hari sebelum dibersihkan otomatis di sisi server maupun klien. Tersedia modal **Tempat Sampah** terpisah dari header Riwayat Transfer lengkap dengan pencarian, penghitung sisa hari per entri, **Pulihkan**, **Pulihkan Semua**, **Hapus Permanen** (konfirmasi dua langkah), dan **Kosongkan Tempat Sampah**.
- **Endpoint Pemulihan & Penghapusan Permanen (`/api/history`)**: Penambahan metode `PATCH /api/history` (`restore` / `restore-all`), perilaku `DELETE /api/history` default soft-delete ke Tempat Sampah, serta `DELETE /api/history?permanent=1` untuk penghapusan permanen per berkas maupun pengosongan Tempat Sampah (dukungan penuh Cloudflare D1 dan fallback `PORTAL_KV`).
- **Paginasi Riwayat Fleksibel (`25 / 50 / 100 / SEMUA`)**: Komponen paginasi dengan pemilih jumlah baris per halaman (`25`, `50`, `100`, atau `SEMUA`, tersimpan di preferensi browser untuk Riwayat Transfer) lengkap dengan rentang aktif dan tombol navigasi halaman pada Riwayat Transfer maupun modal Tempat Sampah.

### Diubah & Ditingkatkan (Changed)
- **Ekspansi Kapasitas Riwayat ke 1.024 Entri**: Batas penyimpanan riwayat unggahan ditingkatkan dari `200` menjadi `1.024` entri aktif dan `1.024` entri di Tempat Sampah.
- **Migrasi Skema D1 Tanpa Downtime**: Penambahan kolom `deleted_at` dan indeks `idx_user_transfer_history_sub_deleted_created` pada `cloudflare/vz-files-schema.sql` serta migrasi otomatis `ALTER TABLE` pada `/functions/api/history.ts` bagi basis data produksi yang sudah berjalan.
- **Bypass Tempat Sampah untuk Hapus Berkas VikingFiles**: Saat pengguna mencentang opsi opsional hapus berkas permanen dari VikingFiles pada unggahan ber-User Hash, catatan riwayat langsung dihapus permanen (`?permanent=1`) agar tautan mati tidak masuk ke Tempat Sampah.

---

## [1.0.1] — 2026-11-25

Pembaruan sinkronisasi riwayat unggahan lintas perangkat untuk pengguna **VZ SSO** (mencakup unggahan anonim maupun ber-User Hash) beserta kontrol pencarian, filter, dan konfirmasi penghapusan yang lebih aman.

### Ditambahkan (Added)
- **Riwayat Unggahan Tersinkronisasi Lintas Perangkat (`/api/history`)**: Pengguna yang masuk dengan VZ SSO kini menyimpan hingga 200 riwayat unggahan terbaru—baik unggahan anonim (tanpa User Hash) maupun ber-User Hash—di Cloudflare D1 (dengan fallback KV), tersinkronisasi otomatis antar perangkat, antar tab, dan antar subdomain (`files.vz.gay` / `file.vz.gay`).
- **Penggabungan Riwayat Lokal Otomatis**: Saat pertama kali masuk VZ SSO di perangkat yang sudah memiliki riwayat unggahan lokal, catatan lokal digabungkan otomatis ke akun tanpa duplikat.
- **Pencarian & Filter Riwayat Transfer**: Kolom pencarian (nama berkas, hash, path folder, atau label profil), filter segmen (**Semua**, **Unggah File**, **URL Remote**, **Anonim**, **Ber-Hash**), kolom waktu unggahan, serta penghitung kapasitas (`N / 200`).
- **Modal Konfirmasi Hapus Riwayat & Opsi Hapus di VikingFile**: Dialog konfirmasi (`Ya, Hapus` / `Batal`) untuk hapus per berkas maupun hapus semua riwayat sekaligus, dilengkapi pemberitahuan jelas mengenai retensi berkas di VikingFiles serta kotak centang opsional hapus berkas permanen dari VikingFile khusus unggahan ber-User Hash yang profilnya masih ada di Brankas SSO.

### Diubah & Ditingkatkan (Changed)
- **Modul Verifikasi Sesi SSO Bersama (`functions/lib/auth.ts`)**: Penyatuan verifikasi token Bearer dengan caching SHA-256 120 detik untuk endpoint `/api/vault` dan `/api/history`.
- **Skema Database D1 & Pemeriksaan Kesehatan (`/api/health`)**: Penambahan tabel `user_transfer_history` (dilengkapi auto-bootstrap otomatis saat pertama kali dipakai) dan status `historyTableReady` pada `/api/health`.
- **Kebijakan Privasi & Modal Catatan Rilis Multi-Versi**: Pembaruan penjelasan sinkronisasi metadata riwayat pada Kebijakan Privasi serta dukungan navigasi antar versi (`v1.0.1` & `v1.0.0`) pada modal Catatan Rilis di antarmuka web.

---

## [1.0.0] — 2026-11-23

Rilis publik perdana **VZ Files** di bawah naungan **PT Galeri Langkah Bahagia Yuwana (`galbay`)**, terhubung dengan ekosistem `vz.gay` dan `jajanserver.com`, serta ditenagai infrastruktur transfer dan penyimpanan sementara **VikingFiles**.

### Ditambahkan (Added)
- **Transfer Berkas & URL Remote**: Unggah berkas lokal (unggah bertahap untuk berkas besar dengan bilah progres per bagian, pembatalan transfer, dan fallback relay otomatis) maupun tarik tautan remote HTTP/HTTPS secara anonim atau memakai User Hash VikingFile, lengkap dengan opsi isolasi path folder dan riwayat transfer lokal.
- **Halaman Cek & Info File (`?f=HASH` & `/f/HASH`)**: Pemeriksaan status hingga 100 hash sekaligus, halaman info `files.vz.gay/?f=HASH`, tombol salin tautan cepat, pengalihan unduhan langsung ke halaman resmi VikingFile, serta generator Kode QR (pilihan tautan VZ Files atau VikingFile) dengan ekspor PNG.
- **Brankas Multi-Hash VZ SSO**: Autentikasi resmi melalui `accounts.vz.gay` menggunakan `@auth0/auth0-react` dengan menu akun di bilah navigasi (tautan ke `myaccount.vz.gay` dan keluar), penyimpanan multi-profil User Hash tersinkronisasi di Cloudflare D1 (`/api/vault`), daftar berkas berhalaman, filter path folder, ubah nama berkas, dan hapus berkas permanen di VikingFile.
- **Sinkronisasi SSO Lintas Subdomain**: Optimalisasi alur login & logout untuk `files.vz.gay` dan `file.vz.gay`, penerusan pilihan bahasa (`ID` / `EN`) ke halaman login SSO, sinkronisasi status antar tab, revalidasi berkala saat fokus tab, serta pemulihan otomatis dan pemberitahuan jika callback login dibatalkan.
- **Panduan Onboarding VikingFiles**: Kartu panduan 3 langkah serta tautan langsung pendaftaran (`vikingfile.com/register`) dan login (`vikingfile.com/login`) di Brankas SSO maupun petunjuk kontekstual di panel Transfer bagi pengguna baru.
- **Antarmuka Dwibahasa & Tema Adaptif**: Dukungan penuh bahasa Indonesia (`ID`) dan Inggris (`EN`), serta mode tampilan Sistem, Terang, dan Gelap.
- **Optimasi SEO & Metadata Publik**: URL kanonis `https://files.vz.gay/`, metadata OpenGraph & Twitter Cards dengan banner sosial 16:9 khusus, skema terstruktur `Schema.org` JSON-LD (`WebApplication` + `Organization`), `robots.txt`, `sitemap.xml`, favicon vektor SVG & ikon sentuh Apple, serta pembaruan judul/meta dinamis per tab dan aturan `noindex` untuk pratinjau tautan `?f=HASH`.
- **Modal Ketentuan Layanan & Catatan Rilis**: Transparansi Ketentuan Layanan, Kebijakan Privasi, kredit mitra VikingFiles & naungan `galbay` (PT Galeri Langkah Bahagia Yuwana), serta ringkasan catatan rilis yang dapat diakses langsung dari footer.
