# Mini PC Kurulumu

Bu klasördeki `setup_mini_pc.ps1`, mini PC 24/7 açık bırakılacak "sunucu"
olarak kullanılmaya başlandığında tek seferlik kurulumu ve otomatik
başlatmayı yapar.

## Ön koşullar (mini PC'ye önceden kurulmalı)

1. **Python 3** — [python.org/downloads](https://www.python.org/downloads/)
   ("Add python.exe to PATH" kutucuğunu işaretlemeyi unutmayın)
2. **Git** — [git-scm.com/downloads](https://git-scm.com/downloads)

## Kurulum

1. Bu repoyu (veya sadece bu dosyayı) mini PC'ye kopyalayın, ya da
   doğrudan mini PC'de bir klasörde şu script'i indirip çalıştırın.
2. PowerShell'i **Yönetici olarak** açın.
3. Şu komutu çalıştırın:
   ```powershell
   powershell -ExecutionPolicy Bypass -File setup_mini_pc.ps1
   ```

Script otomatik olarak:
- Projeyi `github.com/ZenXST/ZenX` reposundan klonlar (private repo —
  ilk `git clone` sırasında GitHub kimlik doğrulaması isteyecek, tarayıcı
  üzerinden giriş yapmanız yeterli)
- Sanal ortam kurup bağımlılıkları ve Playwright/Chromium'u yükler
- Bilgisayar her açıldığında (kullanıcı oturum açmasa bile) `app.py`'yi
  arka planda otomatik başlatan bir Görev Zamanlayıcı görevi oluşturur;
  çökerse 1 dakika arayla otomatik yeniden dener

Kurulum bitince site `http://localhost:5000` adresinde mini PC üzerinde
çalışır durumda olur.

## Henüz karara bağlanmadı: dışarıdan (ev dışından) erişim

Bu script sadece **yerel ağ içi** erişimi otomatikleştirir. Mini PC'nin
bulunduğu evin dışından (telefon, başka bir yer) erişim için ayrı bir
adım gerekiyor — domain + Cloudflare Tunnel ya da ücretsiz DDNS + port
yönlendirme arasında karar verilecek, o karara göre bu klasöre ek bir
script (`setup_tunnel.ps1` gibi) eklenecek.
