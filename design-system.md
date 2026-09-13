# SAP Fiori Tasarım Sistemi ve Görsel Standartlar Rehberi (Design System)

Bu doküman, **CodeUp Supplier Management (Tedarikçi Onboarding & Onay)** projesinin tasarım dilini, görsel hiyerarşisini, tema prensiplerini ve SAPUI5 standart bileşenleriyle oluşturulacak premium kullanıcı deneyimini tanımlayan ana tasarım rehberidir.

---

## 1. Tasarım Vizyonu ve Hedefleri

Projenin arayüzü, sıradan, düz ve soğuk bir varsayılan CRUD ekranı gibi görünmemelidir. Hedefimiz; kullanıcılara güven veren, modern, kurumsal, gözü yormayan ve derinliği olan **premium bir Fiori deneyimi** sunmaktır.

### Temel Görsel Hedefler:
* **Modern & Premium:** Katmanlı, sakin, kurumsal bir ciddiyeti olan ve yüksek kalite hissi veren görsel kompozisyon.
* **Dark Ağırlıklı Atmosfer:** Standart düz siyah (`#000000`) yerine, SAP Fiori'nin katmanlı, düşük kontrastlı ve göz yormayan koyu gri tonları. (FinanceFocus projesindeki modern ve derinlikli dark atmosferin SAP Fiori standartları çerçevesinde yeniden yorumlanması).
* **Ferahlık & Ergonomi:** Aşırı bilgi yoğunluğunu (information overload) engelleyen dengeli boşluklar, net okunabilirlik ve kusursuz tipografi.
* **Doğal Derinlik:** Özel gölgeler veya yapay CSS hileleri yerine; SAPUI5 kartları (`sap.f.Card`), panelleri (`sap.m.Panel`) ve Fiori Horizon temasının kendi doğal derinlik seviyeleri (elevation).

---

## 2. KESİN KURAL: Özel (Custom) CSS Yasağı ve Çözüm Yaklaşımı

> [!CAUTION]
> **Özel (Custom) CSS Kesinlikle Kullanılmayacaktır:**
> Projede hiçbir harici `.css` dosyası oluşturulmayacak, HTML `style` etiketleri veya inline `style="..."` nitelikleri yazılmayacaktır. Tailwind, Bootstrap, React, Material UI veya SAP Fiori görünümünü taklit eden yapay HTML/CSS framework'leri kesinlikle yasaktır.
> 
> **Premium dark atmosfer isteği, custom CSS yasağını ihlal etmek için bir gerekçe olamaz.** Tüm görsel şıklık, SAPUI5'in kendi zengin bileşen kütüphanesi, yerel düzenleri (layouts), tema motoru ve öntanımlı sınıfları ile sağlanacaktır.

### Standart UI5 Sınıfları ve Düzen Yaklaşımı:
Aralıklar, hizalamalar ve boşluklar yalnızca SAPUI5'in resmi sınıfları ve kontrolleri ile yönetilir:
* **Margin Sınıfları:** `sapUiSmallMargin`, `sapUiMediumMargin`, `sapUiLargeMargin`, `sapUiTinyMarginBegin`, `sapUiSmallMarginTop`, `sapUiSmallMarginBottom` vb.
* **Padding Sınıfları:** `sapUiContentPadding`, `sapUiNoContentPadding`, `sapUiResponsiveContentPadding`.
* **Duyarlı Layout Kontrolleri:** `sap.ui.layout.Grid`, `sap.m.FlexBox`, `sap.m.VBox`, `sap.m.HBox`, `sap.ui.layout.form.SimpleForm`, `sap.f.DynamicPage`.

---

## 3. Tema Mimarisi (Evening Horizon & Morning Horizon)

Tasarım sistemi, SAP'nin resmi ve en güncel kurumsal teması olan **Horizon** ailesini temel alır.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SAP Fiori Tema Sistemi                          │
├───────────────────────────────────┬────────────────────────────────────┤
│         Evening Horizon           │          Morning Horizon           │
│        (sap_horizon_dark)         │           (sap_horizon)            │
├───────────────────────────────────┼────────────────────────────────────┤
│  - Ana Dark Tema Yaklaşımı        │  - Resmi Light Tema Yaklaşımı      │
│  - Katmanlı koyu antrasit tonlar  │  - Temiz, ferah kurumsal beyaz     │
│  - Düşük göz yorgunluğu           │  - Yüksek okunabilirlik            │
│  - Premium kurumsal atmosfer      │  - Standart Fiori aydınlığı        │
└───────────────────────────────────┴────────────────────────────────────┘
```

* **Dark Görünümün Niteliği:** Düz siyah arka planlar kullanılmaz. `sap_horizon_dark` temasının sunduğu doğal yüzey ayrımları, kart katmanları ve sakin kontrastlar temel alınır.
* **Alternatif Referanslar:** Gerektiğinde `Quartz Dark` (`sap_fiori_3_dark`) ve `Quartz Light` (`sap_fiori_3`) temaları alternatif tema standartları olarak göz önünde bulundurulur.
* **Tema Değiştirme (Dark ↔ Light Switch):**
  * Kullanıcıya arayüzde bir tema değiştirme ikonu (`sap-icon://palette` veya `sap-icon://lightbulb`) sunulacaktır.
  * Bu geçiş kesinlikle custom CSS ile değil, SAPUI5'in resmi tema değiştirme API'si üzerinden gerçekleştirilir:
    ```javascript
    // Standart SAPUI5 Tema Değiştirme
    sap.ui.getCore().applyTheme(bDark ? "sap_horizon_dark" : "sap_horizon");
    ```
  * Kullanıcının tema tercihi standart web depolama mekanizmaları (`localStorage`) ile oturumlar arasında korunabilir.

---

## 4. Ekran Bazlı Tasarım Prensipleri

### A. Supplier Portal: Giriş ve Kayıt (Login & Register)
Giriş ve kayıt ekranları tedarikçinin sistemle ilk temas noktasıdır ve yüksek kurumsal güven hissi vermelidir.

* **Bölünmüş Ekran (Split-Screen Kompozisyonu):**
  * `sap.m.FlexBox` veya `sap.ui.layout.Grid` kullanılarak iki bölümlü dengeli bir yapı kurulur.
  * **Sol/Form Bölümü:** `sap.f.Card` veya yükseltilmiş panel içerisinde; logo, net başlık hiyerarşisi, tek alanlı parola kutusu (göz ikonu ile göster/gizle) ve giriş/kayıt butonları.
  * **Sağ/Görsel Bölümü:** Tedarikçi onboarding sürecini ve iş ortaklığını simgeleyen, lisanslı ve kurumsal gerçek bir görsel asset ile desteklenmiş estetik alan.
* **Canlı Parola Doğrulama Alanı:**
  * Parola kutusunun altında 5 kural (`sap.m.StandardListItem` veya `sap.m.HBox` + `sap.ui.core.Icon`) alt alta listelenir.
  * Kullanıcı yazmaya başladığı an görünür olur; karşılanan kurallar anında `Success` (yeşil) durumuna döner.
* **Sahte İçerik Yasağı:** Rastgele placeholder ürün görselleri veya gereksiz süslemeler yerine doğrudan kurumsal kimliği yansıtan sade bileşenler tercih edilir.

### B. Supplier Portal: Başvuru Formu ve Süreç Takibi
* **Bölümlendirilmiş Form Yapısı:**
  * Başvuru formu tek parça düz bir liste gibi sunulmaz; `sap.ui.layout.form.SimpleForm` ve mantıksal gruplar (`Firma Bilgileri`, `İletişim & Adres`, `Belge Yükleme`) halinde düzenlenir.
  * Zorunlu alanlar (`Firma Adı`, `İlgili Kişi`, `Sertifika`) form üzerinde belirgin zorunluluk işareti (`required="true"`) ile gösterilir.
* **Sertifika (PDF) Yükleme Alanı:**
  * `sap.ui.unified.FileUploader` bileşeni kullanılır.
  * Dosya seçilmeden önce kullanıcının göreceği net bir bilgilendirme metni yer alır: *"Yalnızca PDF formatı ve en fazla 10 MB kabul edilir."*
* **Süreç Akışı (`sap.suite.ui.commons.ProcessFlow`):**
  * Başvuru tamamlandığında form gizlenir ve yerine 3 adımlı süreç akışı gelir:
    `1. Gönderildi` $\rightarrow$ `2. İncelemede` $\rightarrow$ `3. Sonuç (Onaylandı / Reddedildi)`.
  * Durumlar SAP'nin semantik durumlarıyla ifade edilir (`Positive`, `Critical`, `Negative`).

### C. Supplier Approvals: Onay Yönetim Kokpiti
Onaycı ekranı yüksek operasyonel verimlilik sunan bir kontrol paneli olarak tasarlanır.

* **Statü Sekmeleri (`sap.m.IconTabBar`):**
  * Durumlar arasında geçiş semantik renkli sayaçlarla desteklenir (*Tüm Başvurular, Bekleyen, Onaylanan, Reddedilen*).
* **Tablo ve Bilgi Hiyerarşisi:**
  * `sap.m.Table` varsayılan olarak en kritik 5 sütunla açılır.
  * `sap.m.ViewSettingsDialog` ile kullanıcı istediği sütunları ekleyebilir veya sıralayabilir.
  * Başvuru statüleri `sap.m.ObjectStatus` ile semantik olarak renklendirilir (Bekleyen: `Warning`, Onaylandı: `Success`, Reddedildi: `Error`).
* **Başvuru Detay Kartı & PDF Önizleme:**
  * Satıra tıklandığında açılan detay penceresinde tüm alanlar düzenli bloklar halinde gösterilir.
  * PDF sertifika kullanıcıyı dosya indirmeye zorlamadan, doğrudan modal/diyalog içinde önizlenebilir (`sap.ui.core.HTML` iframe veya UI5 PDF görüntüleyici).
* **Karar ve AI Analiz Aksiyonları:**
  * Butonlar hiyerarşiye uygun konumlandırılır: Onayla (`Emphasized` / yeşil ton), Reddet (`Reject` / kırmızı ton), AI ile Analiz Et (`Ghost` veya `Default` ile ikonlu).
  * Red diyaloğunda gerekçe notu ve düzenlenecek alanlar (`MultiComboBox`) net bir hata kontrolüyle sunulur.

### D. Fiori Launchpad Sandbox
* Launchpad sıfırdan çizilmez; `app/index.html` ve `fioriSandboxConfig.json` üzerinden SAP ushell standart kabuğu kullanılır.
* Mavi Fiori başlığı, kullanıcı profil alanı ve uygulama kutucukları (tile'lar) Fiori'nin doğal tasarım bütünlüğünü korur.

---

## 5. Uluslararasılaştırma (i18n) ve Tipografi Kuralları

* **Sıfır Sabit Metin:** Arayüzdeki hiçbir öğede doğrudan metin (hard-coded string) bulunamaz. Her etiket, buton, uyarı, diyalog başlığı `i18n.properties` üzerinden çağrılır.
* **İki Dil Desteği:** Türkçe (`i18n_tr.properties`) ve İngilizce (`i18n_en.properties` / `i18n.properties`) eşit kapsamda hazırlanır.
* **Otomatik Algılama:** Tarayıcı diline göre otomatik seçim yapılır. Arayüze manuel dil seçici (select/combobox) eklenmeyecektir (case study şartnamesine sadakat).
* **Tipografi:** SAP Fiori'nin resmi yazı tipi ailesi olan **72** (veya standart Fiori font yığını) kullanılır; font boyutu ve kalınlıkları için UI5'in standart başlık stilleri (`titleStyle="H3"`, `H4"` vb.) tercih edilir.

---

## 6. Tasarım Yasakları (Anti-Patterns)

Tasarımın kurumsal çizgiden sapmasını engellemek adına aşağıdaki uygulamalar **kesinlikle yasaktır**:

| Yasak Uygulama | Nedeni |
| :--- | :--- |
| ❌ Custom CSS & Inline Style | Case study kural ihlali ve yükseltme uyumsuzluğu. |
| ❌ Tailwind / Bootstrap / Material UI | SAPUI5 mimarisiyle çakışma ve kontrol kaybı. |
| ❌ Aşırı Glassmorphism / Ağır Blur | Kurumsal okunabilirliği ve erişilebilirliği bozması. |
| ❌ Parlak Neon Renkler & Rastgele Gradient'ler | SAP kurumsal kimliğine ve semantik renk standardına aykırılık. |
| ❌ Katı / Düz Siyah (`#000000`) Arka Planlar | Düşük kontrast kalitesi ve göz yorgunluğu yaratması. |
| ❌ Gereksiz Dekoratif Animasyonlar | İş akışını yavaşlatması ve operasyonel hızı düşürmesi. |
| ❌ Sahte (Fake) Görseller ve Dummy Düğmeler | Gerçek veri ve güvenilir arayüz prensibine aykırılık. |

---

## 7. Temel Tasarım İlkeleri

1. **Görsel Hiyerarşi (Visual Hierarchy):** En önemli veriler ve aksiyonlar ilk bakışta fark edilmelidir.
2. **Tutarlı Boşluklar (Consistent Spacing):** Ekran genelinde rastgele değil, SAPUI5'in standart margin ve padding sınıflarıyla ritmik boşluklar kullanılmalıdır.
3. **Semantik Renkler (Semantic Colors):** Renkler sadece dekorasyon için değil, anlam iletmek için kullanılır (Başarı = Yeşil, Hata = Kırmızı, Uyarı = Turuncu, Bilgi = Mavi).
4. **Erişilebilirlik (Accessibility & WCAG):** Metin ve arka plan kontrastları WCAG standartlarına ve SAP Fiori kontrast ilkelerine tam uyumlu olmalıdır.
5. **Duyarlılık (Responsive Layout):** Formlar ve tablolar farklı ekran genişliklerinde bozulmadan, UI5 grid kurallarına göre yeniden akmalıdır.

---

## 8. Tasarım Kararlarında Öncelik Sırası

Bir tasarım tercihi, bileşen seçimi veya yerleşim kararı verilirken uygulanacak **kesin öncelik hiyerarşisi** şudur:

1. 🥇 **CodeUp Case Study Kuralları** (Şartnamenin getirdiği işlevsel ve teknik zorunluluklar)
2. 🥈 **SAP Fiori / SAPUI5 Standartları** (Resmi kontroller, temalar, native sınıflar)
3. 🥉 **Kullanılabilirlik ve Erişilebilirlik** (Okunabilirlik, net hiyerarşi, WCAG kontrastı)
4. 🎖️ **Premium ve Modern Görsel Dil** (Evening Horizon, dengeli boşluklar, şık kompozisyon)
5. 🏅 **Kişisel Estetik Tercihler** (İkincil görsel detaylar ve süslemeler)

---
*Bu doküman, projenin tüm ekranlarında SAP standartlarından ödün vermeden en üst düzeyde modern, kurumsal ve premium bir görsel deneyim sunulmasını garanti eden ana tasarım kılavuzudur.*
