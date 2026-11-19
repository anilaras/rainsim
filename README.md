# Yağmur Simülatörü

Yağmurun içinden geçen bir nesnenin toplam ne kadar ıslandığını hesaplayan, tarayıcıda çalışan 3B simülatör.

## Çalıştırma

`index.html` dosyasını tarayıcıda açmanız yeterli. Kurulum gerekmez. three.js CDN'den yüklendiği için internet bağlantısı gerekir.
İsterseniz bir yerel sunucu üzerinden de açabilirsiniz (örn. `npx serve .`).

## Parametreler

| Grup | Parametre |
|---|---|
| Yağmur | Yağış şiddeti (mm/sa), damla hacmi (ml), damla boyutu değişkenliği (±%), düşüş hızı (otomatik limit hız ya da elle) |
| Rüzgar | Hız (m/s), esme yönü (pusula ile, nesnenin hareket yönüne göre), türbülans (m/s) |
| Nesne | Şekil (insan / kutu / silindir / küre) ve boyutları, yerden yükseklik, hareket hızı, mesafe ya da süre, tutma oranı (%) |
| Simülasyon | Parçacık sayısı, simülasyon hızı, ısı haritası skalası, görünürlük seçenekleri |

Bazı parametreler simülasyon çalışırken de değiştirilebilir. Şekil, boyut veya yükseklik değişirse simülasyon sıfırlanır.

## Çıktılar

- Toplam ıslanma (ml / L) ve çarpan gerçek damla sayısı
- Analitik beklenti ile karşılaştırma ve istatistiksel belirsizlik (1σ)
- Yüzeylere göre dağılım (üst, ön, arka, sol, sağ, alt)
- Nesne üzerinde ısı haritası (ml/m²)
- Zamana göre birikim grafiği
- Hıza göre toplam ıslanma eğrisi ("yürümek mi, koşmak mı?")
- Kayıtlı sonuçlar tablosu ve CSV dışa aktarma

## Yöntem

- Hesap nesneyle birlikte hareket eden bir referans sisteminde yapılır. Damlaların nesneye göre hızı `(rüzgar + türbülans − nesne hızı, −düşüş hızı)` olur.
- Damla çapı hacimden bulunur: `D = ∛(6V/π)`. Limit hız Atlas vd. (1973) bağıntısıyla hesaplanır: `v = 9,65 − 10,3·e^(−0,6·D)` (D mm, v m/s).
- Her simülasyon parçacığı `w` gerçek damlayı temsil eder. `w`, ayarlanan yağış şiddetini birebir verecek şekilde hesaplanır, böylece sonuç yansız olur.
- Her adımda damlanın izlediği yol, nesnenin üçgen ağıyla kesiştirilir. Su, çarptığı yüzey hücresine eklenir.
- Analitik beklenti şöyle hesaplanır: `Σ (w·V / Hacim) · |v_göreli| · A_izdüşüm`. Dışbükey şekillerde (kutu, küre, silindir) kesin değerdir. İnsan modelinde parçalar arası gölgeleme yok sayıldığı için yaklaşıktır.

## Dosyalar

```
index.html        arayüz iskeleti ve yükleyici
css/style.css     stiller
js/physics.js     damla fiziği ve parçacık simülasyonu (three.js'ten bağımsız)
js/objects.js     nesne geometrileri, ıslaklık dokuları, çarpışma testi
js/view.js        3B sahne, damla/sıçrama çizimi, kamera
js/ui.js          kontroller, sonuçlar, grafikler, geçmiş
js/main.js        uygulama döngüsü
```
