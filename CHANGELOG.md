# Changelog

Semua perubahan penting pada **VZ Files** (`files.vz.gay` & `file.vz.gay`) didokumentasikan pada berkas ini.
Format mengacu pada [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-23

Rilis publik perdana **VZ Files** di bawah naungan **PT Galeri Langkah Bahagia Yuwana (`galbay`)**, terhubung dengan ekosistem `vz.gay` dan `jajanserver.com`, serta ditenagai infrastruktur transfer dan penyimpanan sementara **VikingFiles**.

### Ditambahkan (Added)
- **Transfer Berkas & URL Remote**: Unggah berkas lokal (dukungan unggahan bertahap untuk file berukuran besar) maupun tarik tautan remote HTTP/HTTPS secara anonim atau menggunakan User Hash VikingFile, lengkap dengan opsi isolasi path folder.
- **Halaman Cek & Info File (`?f=HASH`)**: Pemeriksaan status hingga 100 hash sekaligus, pratinjau halaman info `files.vz.gay/?f=HASH`, tombol salin tautan cepat, dan generator Kode QR (tautan VZ Files / VikingFile) dengan ekspor PNG.
- **Brankas Multi-Hash VZ SSO**: Autentikasi resmi melalui `accounts.vz.gay` menggunakan `@auth0/auth0-react` untuk menyimpan, mengelola, mengubah nama berkas, menghapus berkas, dan menyinkronkan beberapa User Hash lintas perangkat via Cloudflare D1 (`/api/vault`).
- **Sinkronisasi SSO Lintas Subdomain**: Optimalisasi alur login & logout untuk `files.vz.gay` dan `file.vz.gay`, penerusan bahasa (`ID` / `EN`) ke halaman login SSO, sinkronisasi status antar-tab, serta pemulihan otomatis saat callback dibatalkan.
- **Panduan Onboarding VikingFiles**: Panduan 3 langkah interaktif serta tautan langsung pembuatan User Hash dan login di VikingFile bagi pengguna baru.
- **Antarmuka Dwibahasa & Tema Adaptif**: Dukungan penuh bahasa Indonesia (`ID`) dan Inggris (`EN`), serta mode tampilan Sistem, Terang, dan Gelap.
- **Optimasi SEO & Metadata Publik**: URL kanonis `https://files.vz.gay/`, metadata OpenGraph & Twitter Cards dengan banner sosial khusus, skema terstruktur `Schema.org` JSON-LD (`WebApplication` + `Organization`), `robots.txt`, `sitemap.xml`, favicon vektor & sentuh khusus, serta pembaruan judul dinamis per tab dan tautan berkas.
- **Modal Ketentuan Layanan & Catatan Rilis**: Transparansi Ketentuan Layanan, Kebijakan Privasi, kredit mitra VikingFiles & `galbay`, serta ringkasan catatan rilis `v1.0.0` yang dapat diakses langsung dari footer.
