# ZenX Fiyat Takip - Mini PC ilk kurulum + otomatik baslatma scripti
#
# Mini PC'de PowerShell'i YONETICI OLARAK acip su komutla calistirin:
#   powershell -ExecutionPolicy Bypass -File setup_mini_pc.ps1
#
# Bu script:
#   1) Projeyi GitHub'dan klonlar (veya varsa gunceller)
#   2) Sanal ortam olusturup bagimliliklari kurar
#   3) Bilgisayar her actiginda (kullanici oturum acmasa bile) app.py'yi
#      otomatik baslatan bir Gorev Zamanlayici gorevi olusturur; cokerse
#      1 dakika arayla en fazla 999 kez otomatik yeniden baslatir.
#
# On kosul: bu bilgisayarda Python 3 ve Git kurulu olmali.

$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/ZenXST/ZenX.git"
$InstallDir = "$env:USERPROFILE\Desktop\ZenX Fiyat Takip"
$TaskName = "ZenXFiyatTakip"

Write-Host "1) Proje hazirlaniyor..."
if (-not (Test-Path $InstallDir)) {
  git clone $RepoUrl $InstallDir
} else {
  Write-Host "Klasor zaten var, guncelleniyor (git pull)..."
  Push-Location $InstallDir
  git pull
  Pop-Location
}

Write-Host "2) Sanal ortam olusturuluyor ve bagimliliklar kuruluyor..."
Push-Location $InstallDir
python -m venv venv
& ".\venv\Scripts\pip.exe" install -r requirements.txt
& ".\venv\Scripts\python.exe" -m playwright install chromium
Pop-Location

Write-Host "3) Otomatik baslatma gorevi olusturuluyor..."
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction `
    -Execute "$InstallDir\venv\Scripts\pythonw.exe" `
    -Argument "app.py" `
    -WorkingDirectory $InstallDir

$Trigger = New-ScheduledTaskTrigger -AtStartup

$Principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Principal $Principal -Settings $Settings -Force | Out-Null

Write-Host ""
Write-Host "Kurulum tamamlandi."
Write-Host "Bilgisayar her actiginda ZenX otomatik baslayacak (http://localhost:5000)."
Write-Host ""
Write-Host "Simdi hemen baslatmak icin:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Durdurmak icin:"
Write-Host "  Stop-ScheduledTask -TaskName '$TaskName'"
Write-Host "Durumunu kontrol etmek icin:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
