# HTTPS untuk care-pulse.rsijpondokkopi.com

Langkah memasang sertifikat TLS di server produksi (Apache 2.4 / XAMPP di Windows).

**Kenapa perlu:** browser hanya mengizinkan akses kamera (`getUserMedia`) pada
*secure context* — https, atau `http://localhost`. Selama server dilayani lewat
http biasa, `navigator.mediaDevices` tidak ada sama sekali, sehingga fitur **Scan
QR Rak** di halaman Storage Steril mati di semua HP. Mengaktifkan izin kamera di
setelan HP tidak menolong: izinnya bukan yang jadi penghalang.

Kondisi server saat dokumen ini dibuat (28 Juli 2026):

| Cek | Hasil |
|---|---|
| `http://care-pulse.rsijpondokkopi.com` | 200 OK — Apache/2.4.58 (Win64) OpenSSL/3.1.3, proxy ke Next.js |
| `https://care-pulse.rsijpondokkopi.com` | port 443 terbuka, **TLS handshake failure / no peer certificate** |

Artinya port 443 sudah diteruskan sampai ke Apache dan mod_ssl tersedia di build
Apache-nya — yang belum ada hanya vhost SSL + sertifikatnya.

---

## 1. Siapkan folder tantangan ACME

```cmd
mkdir C:\acme-webroot\.well-known\acme-challenge
```

Folder ini dipakai Let's Encrypt untuk membuktikan bahwa domainnya memang milik
kita. Karena aplikasi ini reverse-proxy ke Next.js, path tersebut **wajib**
dikecualikan dari proxy — sudah diurus oleh `ProxyPass /.well-known/acme-challenge/ !`
di `care-pulse-ssl.conf`. Tanpa itu validasi selalu gagal 404.

## 2. Aktifkan modul yang dibutuhkan di `C:\xampp\apache\conf\httpd.conf`

Hapus tanda `#` di depan baris berikut:

```apache
LoadModule ssl_module modules/mod_ssl.so
LoadModule socache_shmcb_module modules/mod_socache_shmcb.so
LoadModule headers_module modules/mod_headers.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
Include conf/extra/httpd-ssl.conf
```

`httpd-ssl.conf` milik XAMPP menyediakan `Listen 443`. Karena itu baris `Listen 443`
di file vhost kita dibiarkan dikomentari — kalau didefinisikan dua kali, Apache
gagal start.

## 3. Pasang vhost

Salin `care-pulse-ssl.conf` ke `C:\xampp\apache\conf\extra\`, lalu tambahkan di
**akhir** `httpd.conf` (harus setelah `Include conf/extra/httpd-ssl.conf`):

```apache
Include conf/extra/care-pulse-ssl.conf
```

Sebelum lanjut, **bandingkan blok `<VirtualHost *:80>` di file ini dengan vhost
port 80 yang sudah berjalan di server.** Kalau vhost lama punya pengaturan
tambahan (alias, header, auth, dsb.), pindahkan juga ke vhost `:443` — isinya
harus sama, bedanya hanya SSL. Vhost `:80` yang lama diganti oleh yang ini.

## 4. Terbitkan sertifikat dengan win-acme

Unduh [win-acme](https://www.win-acme.com/) lalu jalankan `wacs.exe` **sebagai
Administrator**. Mode interaktif: `N` (create certificate) → `Manual input` →
host `care-pulse.rsijpondokkopi.com` → validasi **filesystem** dengan webroot
`C:\acme-webroot` → store **PEM files** → path `C:\ssl\pem`.

Ekuivalen satu baris:

```cmd
wacs.exe --target manual --host care-pulse.rsijpondokkopi.com ^
         --validation filesystem --webroot C:\acme-webroot ^
         --store pemfiles --pemfilespath C:\ssl\pem ^
         --installation script ^
         --script "C:\xampp\apache\bin\httpd.exe" --scriptparameters "-k restart"
```

Bagian `--installation script` membuat Apache di-restart otomatis setiap
sertifikat diperbarui (tiap ~60 hari), jadi tidak ada tanggal kedaluwarsa yang
perlu diingat. win-acme sekaligus memasang scheduled task pembaruannya.

Periksa nama berkas yang dihasilkan di `C:\ssl\pem` dan cocokkan dengan
`SSLCertificateFile` / `SSLCertificateKeyFile` / `SSLCertificateChainFile` di
`care-pulse-ssl.conf` (win-acme menamainya `<hostname>-crt.pem`, `-key.pem`,
`-chain.pem`).

## 5. Uji lalu restart

```cmd
C:\xampp\apache\bin\httpd.exe -t
C:\xampp\apache\bin\httpd.exe -k restart
```

`-t` harus menjawab `Syntax OK` sebelum restart.

## 6. Verifikasi

1. `https://care-pulse.rsijpondokkopi.com` terbuka tanpa peringatan sertifikat.
2. `http://...` otomatis dialihkan ke `https://...`.
3. Buka **CSSD → Storage Steril → Simpan ke Rak → Scan QR Rak** dari HP —
   kartu scan harus aktif (bukan "Perlu https") dan kamera menyala.
4. **Uji cetak label.** Halaman https memanggil print server di
   `http://localhost/care-pulse-print-server/...` (`lib/printServer.ts`).
   Secara aturan mixed-content `http://localhost` termasuk origin terpercaya
   sehingga seharusnya lolos, tetapi Chrome versi baru menambahkan gate *Local
   Network Access* untuk permintaan dari situs publik ke jaringan lokal — bisa
   memunculkan prompt izin atau memblokirnya. Kalau ternyata diblokir, print
   server perlu dilayani lewat https juga (atau izin Local Network Access
   diberikan di browser operator).

---

## Yang TIDAK perlu diubah

| Bagian | Alasan |
|---|---|
| `BACKEND_API_URL=http://127.0.0.1:8000` | server-ke-server di mesin yang sama; browser tak pernah menyentuhnya. Rewrite `/api` & `/uploads` di `next.config.ts` tetap same-origin |
| `lib/echo.ts` | sudah `forceTLS: true` |
| `certificates/lan-*.pem` | khusus `npm run dev:https` saat pengembangan lokal, bukan untuk server |
| `allowedDevOrigins` di `next.config.ts` | hanya berlaku di mode development |

## Tambalan sementara (kalau sertifikat belum bisa dipasang hari ini)

Di tiap perangkat operator, buka Chrome →
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` → isi
`http://care-pulse.rsijpondokkopi.com` → **Enabled** → relaunch. Origin itu
diperlakukan sebagai secure context sehingga kamera hidup. Harus diulang di
setiap HP/PC dan hilang saat profil browser di-reset — pakai hanya sebagai
jembatan, bukan solusi.

## Kalau macet

| Gejala | Penyebab yang paling sering |
|---|---|
| Apache gagal start setelah diubah | `Listen 443` terdefinisi dua kali (di `httpd-ssl.conf` dan di vhost kita) |
| win-acme gagal validasi, 404 | `ProxyPass /.well-known/acme-challenge/ !` belum aktif, atau path `Alias` tidak sama dengan `--webroot` |
| Browser peringatan "not private" | `SSLCertificateChainFile` belum diisi / salah berkas |
| Halaman terbuka tapi aset & `/api` gagal | `ProxyPreserveHost On` atau `X-Forwarded-Proto` belum di-set |
| Kamera tetap mati padahal https jalan | izin kamera pernah diblokir untuk situs ini — modalnya akan menampilkan panduan sesuai browser/perangkat |
