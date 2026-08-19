from datetime import datetime
import json
import os
import re
import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

KNIGHTPIN_API_KEY = os.environ.get("KNIGHTPIN_API_KEY") or "9c513f9408e6aff893424f77afd452659c09ad4dd3448bdd"
KNIGHTPIN_API_URL = "https://knightpin.com/ajax/gold-price-api.php?game=ko&format=raw"

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    " (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

SERVER_NAMES = ("ZERO", "FELIS", "AGARTHA", "PANDORA", "DRYADS", "DESTAN", "MINARK", "OREADS")
SERVER_TR_MAP = {name.capitalize(): name for name in SERVER_NAMES}
SERVER_TR_PATTERN = "|".join(SERVER_TR_MAP)
# Bazı siteler büyük harfe çevirirken Türkçe kuralını kullanıp ASCII 'I' yerine
# noktalı 'İ' (U+0130) üretiyor (ör. oyunfor.com: "MİNARK"); regex'te ikisini de
# kabul etmek için 'I' harflerini [Iİ] karakter sınıfına çeviriyoruz.
SERVER_UPPER_PATTERN = "|".join(name.replace("I", "[Iİ]") for name in SERVER_NAMES)


def _fmt(n):
  """10M birimine ölçeklenmiş fiyatı diğer sitelerle aynı formatta yazar.
  Önce yuvarlar, sonra tam sayı kontrolü yapar; aksi halde kayan nokta
  hassasiyeti (ör. 4.15 * 100 = 414.99999999999994) "415.0" gibi gereksiz
  bir ondalık kuyruğu bırakıyordu."""
  rounded = round(n, 2)
  return str(int(rounded)) if rounded == int(rounded) else str(rounded)


def fetch_knightpin_data(default_links):
  """KnightPin fiyatlarını taramak yerine resmi API'den çeker."""
  knightpin_site_data = {
      "Site adı": "KNIGHTPIN",
      "Site linki": default_links["KNIGHTPIN"],
  }

  try:
    resp = requests.get(
        KNIGHTPIN_API_URL,
        headers={"Authorization": f"Bearer {KNIGHTPIN_API_KEY}"},
        timeout=15,
    )
    resp.raise_for_status()
    payload = resp.json()

    if not payload.get("success"):
      raise ValueError("API success=false döndü")

    for server in payload.get("servers", []):
      s_name = (server.get("server_code") or "").upper()
      if not s_name:
        continue
      buy_price = server.get("buy_price")
      sell_price = server.get("sell_price")
      knightpin_site_data[f"{s_name} alış"] = (
          str(round(buy_price * 100)) if buy_price is not None else "0"
      )
      knightpin_site_data[f"{s_name} satış"] = (
          str(round(sell_price * 100)) if sell_price is not None else "0"
      )

    knightpin_site_data["Veri Çekildi"] = True
    print("KnightPin verileri API üzerinden başarıyla alındı.")
  except Exception as e:
    print(f"KnightPin API hatası: {e}")

  return knightpin_site_data


def fetch_kopazar_data(default_links):
  """Kopazar sitesinden GB fiyatlarını doğrudan çeker (sayfa SSR, Playwright gerekmez)."""
  site_data = {
      "Site adı": "KOPAZAR",
      "Site linki": default_links["KOPAZAR"],
  }

  server_names = {
      "ZERO", "FELIS", "AGARTHA", "PANDORA", "DRYADS", "DESTAN", "MINARK", "OREADS",
  }

  try:
    resp = requests.get(
        default_links["KOPAZAR"],
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                " (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
        },
        timeout=15,
    )
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    for row in soup.select(".row.m-0.align-items-center.p-10"):
      text = row.get_text(" ", strip=True)

      name_match = re.match(r"^(\S+)\s*Gb", text)
      if not name_match:
        continue
      server = name_match.group(1).upper()
      if server not in server_names:
        continue

      prices = re.findall(r"([\d.,]+)\s*TL", text)
      if len(prices) < 2:
        continue

      # Kopazar kendi sayfasında 1 GB (10M Noah) birim fiyatı gösteriyor;
      # tablodaki diğer siteler 10 GB birim fiyatıyla geldiği için x10 ölçekliyoruz.
      buy = round(float(prices[0].replace(".", "").replace(",", ".")) * 10, 2)
      sell = round(float(prices[1].replace(".", "").replace(",", ".")) * 10, 2)

      site_data[f"{server} alış"] = str(int(buy)) if buy == int(buy) else str(buy)
      site_data[f"{server} satış"] = str(int(sell)) if sell == int(sell) else str(sell)

    if len(site_data) > 2:
      site_data["Veri Çekildi"] = True
    print("Kopazar verileri başarıyla alındı.")
  except Exception as e:
    print(f"Kopazar hatası: {e}")

  return site_data


def fetch_sonteklif_data(default_links):
  """Sonteklif basit bir JS cookie+redirect koruması kullanıyor (document.cookie
  set edip location.href ile yönlendiriyor); requests.Session ile bu adımı taklit
  ediyoruz. Site kendi sayfasında 10M birim fiyatı gösteriyor; tablonun referans
  birimi (KnightPin/Kopazar ile aynı ölçek) bunun 10 katı, o yüzden x10 ölçekliyoruz."""
  site_data = {
      "Site adı": "SONTEKLİF",
      "Site linki": default_links["SONTEKLİF"],
  }

  try:
    session = requests.Session()
    session.headers.update({"User-Agent": BROWSER_UA})
    url = default_links["SONTEKLİF"]
    html = ""
    for _ in range(5):
      resp = session.get(url, timeout=15)
      resp.raise_for_status()
      html = resp.text
      redirect = re.search(
          r'document\.cookie="([^=]+)=([^;]*);.*?location\.href="([^"]+)"', html
      )
      if not redirect:
        break
      session.cookies.set(redirect.group(1), redirect.group(2).strip())
      url = redirect.group(3)

    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    for tr_name, server in SERVER_TR_MAP.items():
      # Site "Alış:"/"Satış:" etiketlerini "BİZE SAT"/"SATIN AL" olarak
      # değiştirdi (2026-08-12 civarı); [İI] ile Türkçe noktalı İ'yi de kabul
      # ediyoruz (bkz. oyunfor için SERVER_UPPER_PATTERN'deki aynı sorun).
      # re.S (DOTALL) şart: get_text(" ") site HTML'inin girinti boşluklarını
      # bazı satırlarda gerçek \n karakteri olarak koruyor (ör. Dryads'da
      # "Gold Bar" ile "BİZE SAT" arasına düşüyor) - re.S olmadan "." bu
      # satır sonunu geçemediği için o sunucular sessizce eşleşmiyordu.
      m = re.search(
          rf"{tr_name} Gold Bar.*?B[İI]ZE SAT\s*([\d.,]+)\s*TL.*?SATIN AL\s*([\d.,]+)\s*TL",
          text,
          re.S,
      )
      if m:
        site_data[f"{server} alış"] = _fmt(float(m.group(1).replace(",", ".")) * 10)
        site_data[f"{server} satış"] = _fmt(float(m.group(2).replace(",", ".")) * 10)

    if len(site_data) > 2:
      site_data["Veri Çekildi"] = True
    print("Sonteklif verileri başarıyla alındı.")
  except Exception as e:
    print(f"Sonteklif hatası: {e}")

  return site_data


def fetch_bynogame_via_enucuzgb(page):
  """Bynogame'in kendi sitesi bazı barındırma ortamlarının (ör. Render) veri
  merkezi IP'lerini 403 ile engelliyor. Bu durumda, EnUcuzGB.com'un
  karşılaştırma tablosundaki Bynogame satırından aynı veriyi (stok bilgisi
  hariç) çekiyoruz. Tablo sütun sırası sabit: ZERO, FELIS, AGARTHA, PANDORA,
  DRYADS, DESTAN, MINARK, OREADS (SERVER_NAMES ile birebir aynı sıra), her
  sunucu için [Satış, Alış] hücre çifti; ilk hücre logo/link olduğu için
  atlanıyor."""
  site_data = {}
  try:
    page.goto("https://www.enucuzgb.com/", timeout=10000, wait_until="domcontentloaded")
    page.wait_for_timeout(4000)  # Cloudflare doğrulaması + yönlendirme için bekle
    page.wait_for_selector("table tbody tr", timeout=15000)

    row = page.locator("tbody tr").filter(has=page.locator("img[src*='BYNO.png']")).first
    cells = row.locator("th, td").all_inner_texts()[1:]

    for i, server in enumerate(SERVER_NAMES):
      site_data[f"{server} satış"] = cells[i * 2].strip()
      site_data[f"{server} alış"] = cells[i * 2 + 1].strip()

    if len(site_data) > 0:
      site_data["Veri Çekildi"] = True
    print("Bynogame verileri EnUcuzGB üzerinden alındı.")
  except Exception as e:
    print(f"Bynogame (EnUcuzGB fallback) hatası: {e}")

  return site_data


def fetch_bynogame_data(default_links, page):
  """Bynogame: satış fiyatı ins-product-price attribute'unda, alış fiyatı
  'X TL'den BİZE SAT' metninde. Site kendi sayfasında zaten tablonun referans
  birimiyle (KnightPin/Kopazar ile aynı ölçek) uyumlu, ek ölçekleme gerekmiyor.
  Her ürün kartının <article> etiketi data-stock="0"/"1" taşıyor (JS tarafında
  'is_stock != 0 ? stokta değil : stokta' olarak kullanılıyor); 0 dışı bir değer
  tükendi anlamına geliyor, bunu da '{server} stok' olarak çekiyoruz.
  Direkt istek engellenirse (403 vb.) EnUcuzGB.com üzerinden fallback dener
  (stok bilgisi olmadan)."""
  site_data = {
      "Site adı": "BYNOGAME",
      "Site linki": default_links["BYNOGAME"],
  }

  try:
    resp = requests.get(
        default_links["BYNOGAME"], headers={"User-Agent": BROWSER_UA}, timeout=15
    )
    resp.raise_for_status()
    html = resp.text

    for m in re.finditer(
        rf"<article[^>]*?data-stock=(\d+)[^>]*>.*?"
        rf'ins-product-name="Knight Online ({SERVER_TR_PATTERN}) Gold Bar GB".*?'
        rf"ins-product-price=([\d.]+).*?([\d.]+)\s*TL.den BİZE SAT",
        html,
        re.S,
    ):
      server = SERVER_TR_MAP[m.group(2)]
      site_data[f"{server} satış"] = m.group(3)
      site_data[f"{server} alış"] = m.group(4)
      site_data[f"{server} stok"] = m.group(1) == "0"

    if len(site_data) > 2:
      site_data["Veri Çekildi"] = True
    print("Bynogame verileri başarıyla alındı.")
  except Exception as e:
    print(f"Bynogame hatası: {e}")
    fallback = fetch_bynogame_via_enucuzgb(page)
    if fallback.get("Veri Çekildi"):
      site_data.update(fallback)

  return site_data


def fetch_kabasakal_data(default_links):
  """Kabasakal fiyatları 1M birimiyle gösteriyor; tablonun referans birimi
  (KnightPin/Kopazar ile aynı ölçek) bunun 100 katı, o yüzden x100 ölçekliyoruz.
  Satış: data-price-new, Alış (Bize Sat): data-context=sell butonundaki
  data-unit-price. Her ürün kartının <article> etiketi data-stock-state="ok"
  taşıyor; "ok" dışındaki her değeri (tükendi vb.) stokta yok kabul edip
  '{server} stok' olarak çekiyoruz."""
  site_data = {
      "Site adı": "KABASAKAL",
      "Site linki": default_links["KABASAKAL"],
  }

  try:
    resp = requests.get(
        default_links["KABASAKAL"], headers={"User-Agent": BROWSER_UA}, timeout=15
    )
    resp.raise_for_status()
    html = resp.text

    for m in re.finditer(
        rf'<article[^>]*?data-stock-state="([^"]*)"[^>]*>.*?'
        rf"Knight Online ({SERVER_TR_PATTERN}) GB</a></h3>.*?data-price-new>([\d,]+)\s*₺.*?"
        rf'data-context="sell".*?data-unit-price="([\d.]+)"',
        html,
        re.S,
    ):
      server = SERVER_TR_MAP[m.group(2)]
      sell_unit = float(m.group(3).replace(",", "."))
      buy_unit = float(m.group(4))
      site_data[f"{server} satış"] = _fmt(sell_unit * 100)
      site_data[f"{server} alış"] = _fmt(buy_unit * 100)
      site_data[f"{server} stok"] = m.group(1) == "ok"

    if len(site_data) > 2:
      site_data["Veri Çekildi"] = True
    print("Kabasakal verileri başarıyla alındı.")
  except Exception as e:
    print(f"Kabasakal hatası: {e}")

  return site_data


def fetch_gamesatis_data(default_links):
  """Gamesatış fiyatları 1 GB birimiyle gösteriyor; bu, tablonun referans birimiyle
  (KnightPin/Kopazar ile aynı ölçek) zaten örtüşüyor, ek ölçekleme gerekmiyor.
  Alış/Satış Fiyatı etiketli data-unit-price."""
  site_data = {
      "Site adı": "GAMESATIŞ",
      "Site linki": default_links["GAMESATIŞ"],
  }

  try:
    resp = requests.get(
        default_links["GAMESATIŞ"], headers={"User-Agent": BROWSER_UA}, timeout=15
    )
    resp.raise_for_status()
    html = resp.text

    for m in re.finditer(
        rf"({SERVER_TR_PATTERN}) GB \(1 GB\).*?Alış Fiyatı.*?"
        rf'data-unit-price="([\d.]+)".*?Satış Fiyatı.*?data-unit-price="([\d.]+)"',
        html,
        re.S,
    ):
      server = SERVER_TR_MAP[m.group(1)]
      site_data[f"{server} alış"] = _fmt(float(m.group(2)))
      site_data[f"{server} satış"] = _fmt(float(m.group(3)))

    if len(site_data) > 2:
      site_data["Veri Çekildi"] = True
    print("Gamesatış verileri başarıyla alındı.")
  except Exception as e:
    print(f"Gamesatış hatası: {e}")

  return site_data


def fetch_oyunfor_data(default_links):
  """Oyunfor: '<h3 class=productText>Knight Online X GB</h3>' ardından ilk
  data-price alış (Bize Sat), sonraki notranslate div satış fiyatı. Site kendi
  sayfasında 10M birim fiyatı gösteriyor; tablonun referans birimi (KnightPin/
  Kopazar ile aynı ölçek) bunun 10 katı, o yüzden x10 ölçekliyoruz."""
  site_data = {
      "Site adı": "OYUNFOR",
      "Site linki": default_links["OYUNFOR"],
  }

  try:
    resp = requests.get(
        default_links["OYUNFOR"], headers={"User-Agent": BROWSER_UA}, timeout=15
    )
    resp.raise_for_status()
    html = resp.text

    for m in re.finditer(
        rf"productText[^>]*>Knight Online ({SERVER_UPPER_PATTERN}) GB</h3>.*?"
        rf"data-price='([\d.]+)'.*?notranslate[^>]*>\s*([\d.]+)\s*TL",
        html,
        re.S,
    ):
      server = m.group(1).replace("İ", "I")
      site_data[f"{server} alış"] = _fmt(float(m.group(2)) * 10)
      site_data[f"{server} satış"] = _fmt(float(m.group(3)) * 10)

    if len(site_data) > 2:
      site_data["Veri Çekildi"] = True
    print("Oyunfor verileri başarıyla alındı.")
  except Exception as e:
    print(f"Oyunfor hatası: {e}")

  return site_data


def fetch_oyuneks_data(default_links, page):
  """Oyuneks düz requests isteklerini 403 ile engelliyor; zaten açık olan
  Playwright sayfasıyla çekiyoruz. Sunucuya göre birim karışık (1M/10M/100M);
  tablonun referans birimi (KnightPin/Kopazar ile aynı ölçek) 100M olduğu için
  buna ölçekliyoruz. Karttaki ilk fiyat alış, 'Hemen Sat Fiyatı' etiketli ikinci
  fiyat satış (Sonteklif/Oyunfor değerleriyle çapraz doğrulandı)."""
  site_data = {
      "Site adı": "OYUNEKS",
      "Site linki": default_links["OYUNEKS"],
  }

  try:
    page.goto(default_links["OYUNEKS"], timeout=30000, wait_until="domcontentloaded")
    page.wait_for_selector(".productCard", timeout=15000)

    for card_text in page.locator(".productCard").all_inner_texts():
      flat = " ".join(card_text.split())
      m = re.search(
          rf"({SERVER_TR_PATTERN}) GB \((\d+)M\)\s*Knight Online Goldbar\s*([\d,]+)\s*TL\s*"
          rf"Hemen Sat Fiyatı\s*([\d,]+)\s*TL",
          flat,
      )
      if not m:
        continue
      server = SERVER_TR_MAP[m.group(1)]
      scale = 100 / int(m.group(2))
      buy = float(m.group(3).replace(",", ".")) * scale
      sell = float(m.group(4).replace(",", ".")) * scale
      site_data[f"{server} alış"] = _fmt(buy)
      site_data[f"{server} satış"] = _fmt(sell)

    if len(site_data) > 2:
      site_data["Veri Çekildi"] = True
    print("Oyuneks verileri başarıyla alındı.")
  except Exception as e:
    print(f"Oyuneks hatası: {e}")

  return site_data


def fetch_gb_data():
  default_links = {
      "SONTEKLİF": "https://www.sonteklif.com/knight-online-gb-c-2",
      "BYNOGAME": "https://www.bynogame.com/tr/oyunlar/knight-online/gold-bar",
      "KABASAKAL": "https://kabasakalonline.com/tr/knight-online/gb",
      "KOPAZAR": "https://www.kopazar.com/knight-online-gold-bar",
      "OYUNEKS": "https://oyuneks.com/knight-online-world/knight-online-goldbar-ko-gb",
      "GAMESATIŞ": "https://www.gamesatis.com/knight-online-goldbar",
      "OYUNFOR": "https://www.oyunfor.com/knight-online/gb-gold-bar",
      "KNIGHTPIN": "https://knightpin.com/knight-online-gold-bar",
  }

  # Her site başta "veri yok" (kırmızı) durumunda başlar; bir kaynak başarıyla
  # veri getirdiğinde merge_site ile güncellenip Veri Çekildi True olur. Böylece
  # bir site hiç veri getirilemese bile tablodan kaybolmaz, kırmızı görünür.
  site_order = [
      "KNIGHTPIN", "KOPAZAR", "SONTEKLİF", "BYNOGAME", "KABASAKAL",
      "OYUNEKS", "GAMESATIŞ", "OYUNFOR",
  ]
  sites = {
      name: {"Site adı": name, "Site linki": default_links[name], "Veri Çekildi": False}
      for name in site_order
  }

  def merge_site(data):
    name = data.get("Site adı")
    if name in sites:
      sites[name].update(data)

  with sync_playwright() as p:
    try:
      browser = p.chromium.launch(
          headless=True,
          channel="chrome",
          args=[
              "--disable-blink-features=AutomationControlled",
              "--no-sandbox",
              "--disable-dev-shm-usage",
          ],
      )
    except Exception:
      browser = p.chromium.launch(
          headless=True,
          args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      )

    context = browser.new_context(
        user_agent=BROWSER_UA,
        viewport={"width": 1920, "height": 1080},
    )
    context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )

    page = context.new_page()

    # --- KnightPin Verilerini Çek (resmi API üzerinden) ---
    merge_site(fetch_knightpin_data(default_links))

    # --- Oyuneks: düz istekleri 403 ile engelliyor, tarayıcı gerekiyor ---
    merge_site(fetch_oyuneks_data(default_links, page))

    # --- Bynogame: normalde düz istekle çekilir, sadece 403 durumunda
    # (ör. bazı barındırma ortamlarının veri merkezi IP'si engellendiğinde)
    # zaten açık olan tarayıcı sayfasıyla EnUcuzGB üzerinden fallback dener ---
    merge_site(fetch_bynogame_data(default_links, page))

    browser.close()

  # --- Geri kalanlar düz HTTP isteğiyle çekilebiliyor, tarayıcı gerekmiyor ---
  merge_site(fetch_kopazar_data(default_links))
  merge_site(fetch_sonteklif_data(default_links))
  merge_site(fetch_kabasakal_data(default_links))
  merge_site(fetch_gamesatis_data(default_links))
  merge_site(fetch_oyunfor_data(default_links))

  output = {
      "Güncelleme zamanı": datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
      "Veriler": list(sites.values()),
  }

  with open("data.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=4)

  print("İşlem tamam! Alış ve satış fiyatları düzeltildi.")
  return output


if __name__ == "__main__":
  fetch_gb_data()