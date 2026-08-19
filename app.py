import datetime
import json
import os
import re
import tempfile
import threading
import time
from datetime import timedelta
from flask import Flask, jsonify, render_template, request
from pypdf import PdfReader
from scraper import fetch_gb_data

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024  # 15 MB - internete acik oldugu icin buyuk dosya DoS'unu engeller

DATA_FILE = "data.json"
HISTORY_FILE = "price_history.json"
AUTO_REFRESH_SECONDS = 180  # ~3 dakika
MANUAL_REFRESH_COOLDOWN_SECONDS = 20  # Siteye açık endpoint'in kötüye kullanımını önler
_last_manual_refresh = 0.0

SITE_LOGOS = {
    "KNIGHTPIN": {"dark": "knightpin_dark.png", "light": "knightpin_light.png"},
    "KOPAZAR": {"dark": "kopazar_dark.svg", "light": "kopazar_light.svg"},
    "SONTEKLİF": {"dark": "sonteklif_dark.png", "light": "sonteklif_light.png"},
    "BYNOGAME": {"dark": "bynogame_dark.png", "light": "bynogame_light.png"},
    "KABASAKAL": {"dark": "kabasakal_dark.svg", "light": "kabasakal_light.svg"},
    "OYUNEKS": {"dark": "oyuneks_dark.svg", "light": "oyuneks_light.svg"},
    "GAMESATIŞ": {"dark": "gamesatis_dark.svg", "light": "gamesatis_light.svg"},
    "OYUNFOR": {"dark": "oyunfor_dark.png", "light": "oyunfor_light.png"},
}


def load_data():
  """Disk üzerindeki data.json dosyasını okur."""
  if os.path.exists(DATA_FILE):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
      try:
        return json.load(f)
      except json.JSONDecodeError:
        pass
  return {"Güncelleme zamanı": "Veri Yok", "Veriler": []}


def save_to_history(data):
  """Yeni çekilen verileri zaman damgasıyla birlikte geçmiş dosyasına kaydeder."""
  if not data or not data.get("Veriler"):
    return

  history = []
  if os.path.exists(HISTORY_FILE):
    try:
      with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        history = json.load(f)
    except Exception as e:
      # Dosya bozuksa (ör. önceki yazma yarıda kesildiyse) sessizce boşaltıp
      # üzerine yazmak tüm geçmişi siler; bunun yerine bu turu atlıyoruz.
      print(f"Geçmiş dosyası okunamadı, bu kayıt atlanıyor: {e}")
      return

  entry = {
      "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
      "date": datetime.datetime.now().strftime("%Y-%m-%d"),
      "datetime": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
      "data": data,
  }

  if history and history[-1].get("timestamp") == entry["timestamp"]:
    return

  history.append(entry)

  if len(history) > 1000:
    history = history[-1000:]

  try:
    tmp_path = HISTORY_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
      json.dump(history, f, ensure_ascii=False, indent=4)
    os.replace(tmp_path, HISTORY_FILE)
  except Exception as e:
    print(f"Geçmiş kayıt hatası: {e}")


def clean_description(text):
  """Açıklama sütununu olabildiğince kısa, sade ve okunabilir hale getirir."""
  if not text:
    return "Bakiye Hareketi"

  text_lower = text.lower()

  # Bilinen işlem kalıplarını en sade ve şık haline dönüştür
  if "kredi kartı" in text_lower and "yükleme" in text_lower:
    return "Kredi Kartı Bakiye Yükleme"
  elif "bakiye talebi" in text_lower:
    if "bulunamadı" in text_lower or "red" in text_lower:
      return "Bakiye Talebi (Bulunamadı / Red)"
    return "Bakiye Talebi"
  elif "havale" in text_lower or "eft" in text_lower:
    return "Havale / EFT İşlemi"

  # Genel temizlik (Özel eşleşme olmazsa tüm kalıntıları ayıkla)
  text = re.sub(r"https?://\S+", "", text)
  text = re.sub(r"\b\d{6,}\b", "", text)  # 6 haneden uzun ID ve referanslar
  text = re.sub(r"[\+\-]?\d{1,3}(?:\.\d{3})*,\d{2}", "", text)  # Tutar rakamları
  text = re.sub(r"\d{2}\.\d{2}\.\d{4}", "", text)  # Tarihler
  text = re.sub(r"\d{2}:\d{2}", "", text)  # Saatler

  # Gürültü yaratan sistem kelimelerini temizle
  noise = [
      "yukleme",
      "yükleme",
      "giriş",
      "çıkış",
      "onaylandı",
      "onaylandi",
      "reddedildi",
      "paytr",
      "paytronline",
      "ödeme",
      "odeme",
      "kod",
      "kart",
      "bakiye",
      "hata",
      "tl",
      "online",
  ]
  for w in noise:
    text = re.sub(r"\b" + w + r"\b", "", text, flags=re.IGNORECASE)

  text = re.sub(r"[()\-|/,.:]+", " ", text)
  text = re.sub(r"\s+", " ", text).strip()

  return text.capitalize() if len(text) > 2 else "Bakiye Hareketi"


@app.route("/")
def index():
  """Ana sayfa yüklendiğinde mevcut verileri şablona gönderir."""
  data = load_data()
  save_to_history(data)
  return render_template("index.html", content=data, site_logos=SITE_LOGOS)


def refresh_and_save():
  """fetch_gb_data() çalıştırıp sonucu data.json'a ve geçmişe kaydeder.
  Hem /api/refresh endpoint'i hem de arka plandaki otomatik yenileme
  döngüsü bu fonksiyonu kullanır."""
  data = fetch_gb_data()
  if data and data.get("Veriler"):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
      json.dump(data, f, ensure_ascii=False, indent=4)
    save_to_history(data)
  return data


def _auto_refresh_loop():
  """Arka planda her AUTO_REFRESH_SECONDS saniyede bir fiyatları yeniler."""
  while True:
    time.sleep(AUTO_REFRESH_SECONDS)
    try:
      refresh_and_save()
      print("Otomatik yenileme tamamlandı.")
    except Exception as e:
      print(f"Otomatik yenileme hatası: {e}")


def start_auto_refresh():
  thread = threading.Thread(target=_auto_refresh_loop, daemon=True)
  thread.start()


@app.route("/api/data")
def api_data():
  """Yeni bir tarama BAŞLATMADAN mevcut data.json'u döner. Taramanın tek
  kaynağı arka plandaki otomatik döngü (~3 dk); istemcinin otomatik geri
  sayımı bu endpoint'i kullanarak sadece o veriyle senkronize olur."""
  return jsonify({"status": "success", "data": load_data()})


@app.route("/api/refresh")
def api_refresh():
  """Manuel "Yenile" tıklamasıyla tetiklenen, gerçek bir tarama yapan endpoint.
  Site artık internete açık olduğu için, art arda çağrılarla scraper'ı ve
  hedef siteleri yormamak adına kısa bir bekleme süresi (cooldown) uygulanır."""
  global _last_manual_refresh
  now = time.time()
  remaining = MANUAL_REFRESH_COOLDOWN_SECONDS - (now - _last_manual_refresh)
  if remaining > 0:
    return jsonify({
        "status": "cooldown",
        "message": f"Çok sık istek. {int(remaining) + 1} saniye sonra tekrar deneyin.",
        "data": load_data(),
    }), 429
  _last_manual_refresh = now

  try:
    data = refresh_and_save()
    return jsonify({"status": "success", "data": data})
  except Exception as e:
    print(f"Güncelleme hatası: {e}")
    data = load_data()
    return jsonify({"status": "error", "message": str(e), "data": data})


@app.route("/api/parse-pdf", methods=["POST"])
def parse_pdf():
  """PDF verilerini kusursuz bir şekilde sütunlarına ayırır."""
  if "file" not in request.files:
    return jsonify({"status": "error", "message": "Dosya bulunamadı."}), 400

  file = request.files["file"]
  if file.filename == "":
    return jsonify({"status": "error", "message": "Dosya seçilmedi."}), 400

  temp_path = None
  try:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp:
      file.save(temp.name)
      temp_path = temp.name

    reader = PdfReader(temp_path)
    full_text = ""
    for page in reader.pages:
      if page:
        extracted = page.extract_text()
        if extracted:
          full_text += extracted + "\n"

    if temp_path and os.path.exists(temp_path):
      os.unlink(temp_path)

    lines = [line.strip() for line in full_text.split("\n") if line.strip()]
    parsed_transactions = []

    i = 0
    while i < len(lines):
      line = lines[i]
      line_lower = line.lower()

      if any(
          kw in line_lower
          for kw in [
              "kullanıcı id",
              "filtre:",
              "oluşturma:",
              "bakiye hareketleri dökümü",
              "onaylanmış net hareket",
              "@hotmail",
              "@gmail",
              "@outlook",
              "tarih tip yön tutar",
          ]
      ):
        i += 1
        continue

      id_match = re.match(r"^(\d{4})", line)
      if id_match:
        tx_id = id_match.group(1)

        tx_lines = [line]
        i += 1
        while i < len(lines):
          next_line = lines[i]
          if re.match(r"^\d{4}\s*\d{2}\.\d{2}\.\d{4}", next_line) or re.match(
              r"^\d{4}$", next_line
          ):
            if re.match(r"^\d{4}\s*\d{2}\.\d{2}\.\d{4}", next_line):
              break
          tx_lines.append(next_line)
          i += 1

        joined_text = " ".join(tx_lines)

        # 1. Tarih ve Saat
        dates = re.findall(
            r"\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?", joined_text
        )
        tarih_saat = dates[0] if len(dates) > 0 else "-"

        # 2. Tip
        tip_match = re.search(
            r"\b(yukleme|çekim|transfer)\b", joined_text, re.IGNORECASE
        )
        tip = (
            tip_match.group(1).capitalize() if tip_match else "Bakiye Hareketi"
        )

        # 3. Yön
        yon_match = re.search(r"\b(Giriş|Çıkış)\b", joined_text, re.IGNORECASE)
        yon = yon_match.group(1) if yon_match else "-"

        # 4, 5, 6. Tutar, Önceki B., Sonraki B.
        amounts = re.findall(r"[\+\-]?\d{1,3}(?:\.\d{3})*,\d{2}", joined_text)
        tutar = amounts[0] if len(amounts) > 0 else "-"
        onceki_b = amounts[1] if len(amounts) > 1 else "-"
        sonraki_b = amounts[2] if len(amounts) > 2 else "-"

        # 7. Durum
        status = "İncelendi"
        jl_lower = joined_text.lower()
        if any(
            w in jl_lower
            for w in [
                "onaylandi",
                "başarılı",
                "success",
                "tamamlandı",
                "onaylandı",
            ]
        ):
          status = "Onaylandı"
        elif any(w in jl_lower for w in ["reddedildi", "iptal", "başarısız"]):
          status = "Reddedildi"

        # 8. Ödeme Yöntemi
        odeme_match = re.search(
            r"\b(paytr|garanti|havale|eft|kredi kartı)\b",
            joined_text,
            re.IGNORECASE,
        )
        odeme = odeme_match.group(1).upper() if odeme_match else "-"

        # 9. Açıklama (Ultra sadeleştirilmiş filtre)
        desc_raw = joined_text
        desc_raw = desc_raw.replace(tx_id, "", 1)
        for d in dates:
          desc_raw = desc_raw.replace(d, "")
        for a in amounts:
          desc_raw = desc_raw.replace(a, "")

        aciklama = clean_description(desc_raw)

        # 10. Onay Tarih ve Saati
        onay = dates[1] if len(dates) > 1 else "-"

        parsed_transactions.append({
            "id": tx_id,
            "tarih": tarih_saat,
            "tarih_saat": tarih_saat,
            "tip": tip,
            "yon": yon,
            "yön": yon,
            "tutar": tutar,
            "onceki_b": onceki_b,
            "sonraki_b": sonraki_b,
            "status": status,
            "durum": status,
            "odeme": odeme,
            "description": aciklama,
            "aciklama": aciklama,
            "onay": onay,
        })
      else:
        i += 1

    return jsonify({
        "status": "success",
        "filename": file.filename,
        "transactions": parsed_transactions,
    })
  except Exception as e:
    if temp_path and os.path.exists(temp_path):
      try:
        os.unlink(temp_path)
      except:
        pass
    return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/chart-data")
def api_chart_data():
  server = request.args.get("server", "ZERO")
  site = request.args.get("site", "ALL")
  timeframe = request.args.get("timeframe", "30m")
  hours_filter = request.args.get("hours", "all")

  history = []
  if os.path.exists(HISTORY_FILE):
    try:
      with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        history = json.load(f)
    except:
      history = []

  threshold_time = None
  if hours_filter != "all":
    try:
      h_val = float(hours_filter)
      threshold_time = datetime.datetime.now() - datetime.timedelta(hours=h_val)
    except:
      pass

  labels = []
  alis_prices = []
  satis_prices = []

  for entry in history:
    if threshold_time:
      entry_dt_str = entry.get("datetime")
      if entry_dt_str:
        try:
          entry_dt = datetime.datetime.strptime(
              entry_dt_str, "%Y-%m-%d %H:%M:%S"
          )
          if entry_dt < threshold_time:
            continue
        except:
          pass

    market_data = entry.get("data", {}).get("Veriler", [])

    target_alis = []
    target_satis = []

    for site_item in market_data:
      if site == "ALL" or site_item.get("Site adı") == site:
        try:
          a_val = (
              site_item.get(f"{server} alış", "0")
              .replace(" TL", "")
              .replace("TL", "")
              .replace(",", ".")
              .strip()
          )
          s_val = (
              site_item.get(f"{server} satış", "0")
              .replace(" TL", "")
              .replace("TL", "")
              .replace(",", ".")
              .strip()
          )

          if a_val and a_val != "-":
            num_a = float(a_val)
            if num_a > 0:
              target_alis.append(num_a)

          if s_val and s_val != "-":
            num_s = float(s_val)
            if num_s > 0:
              target_satis.append(num_s)
        except:
          pass

    if target_alis or target_satis:
      avg_alis = sum(target_alis) / len(target_alis) if target_alis else 0.0
      avg_satis = (
          sum(target_satis) / len(target_satis) if target_satis else 0.0
      )

      if timeframe in ["7d", "30d"]:
        lbl = entry.get("date", "")
      else:
        lbl = entry.get("timestamp", "")[:5]

      labels.append(lbl)
      alis_prices.append(round(avg_alis, 2))
      satis_prices.append(round(avg_satis, 2))

  if not labels:
    current_data = load_data()
    now_str = datetime.datetime.now().strftime("%H:%M")
    labels.append(now_str)
    alis_prices.append(1800.0)
    satis_prices.append(1900.0)

  return jsonify({
      "status": "success",
      "labels": labels,
      "alisPrices": alis_prices,
      "satisPrices": satis_prices,
  })


# Modül import edildiğinde de (ör. gunicorn ile "app:app" olarak) tetiklenir,
# böylece production ortamında da otomatik tarama arka planda çalışır.
start_auto_refresh()

if __name__ == "__main__":
  app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False, use_reloader=False)