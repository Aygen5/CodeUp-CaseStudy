# Teknik Çalışma İlkeleri ve Beceri Kuralları (Skills & Guidelines)

Bu doküman, **CodeUp Supplier Management** projesinde Antigravity tarafından kod üretilirken, refactoring yapılırken veya mimari kararlar alınırken uyulması zorunlu teknik kuralları, geliştirme standartlarını ve çalışma prensiplerini tanımlar.

---

## 1. Temel Çalışma Prensibi

> [!IMPORTANT]
> **Mevcut Yapıya Saygı ve Sadakat İlkesi:**
> Bir kod değişikliği yapmadan önce mevcut proje yapısını, ilgili dosyaları ve mevcut implementasyonu dikkatle incele. Gereksiz yere yeni dosya oluşturma veya çalışan mevcut yapıyı bozacak keyfi değişiklikler yapma. Bir gereksinim birden fazla teknik yöntemle çözülebiliyorsa, her zaman **CodeUp şartname belgelerine en uygun, en sade ve SAP standartlarına en yakın** çözümü tercih et.

* **Gereksiz Abstraction ve Over-Engineering Yasağı:** Projeyi gereksiz tasarım desenleri (design patterns), aşırı katmanlı yardımcı sınıflar (util hell) veya karmaşık soyutlamalarla boğma. Kod sade, anlaşılır, bakımı kolay ve doğrudan amaca yönelik olmalıdır.
* **Minimal Bağımlılık (No Bloat):** Projeye sadece şartnamede belirtilen ve gerçekten ihtiyaç duyulan paketleri (`@sap/cds`, `bcryptjs`, `@sap/approuter` vb.) ekle. Gereksiz üçüncü parti kütüphaneler eklemekten kaçın.
* **Mevcut Mimariyi Koruma:** Yapılan her ekleme, Approuter (`5000`) $\leftrightarrow$ CAP Backend (`4004`) $\leftrightarrow$ BTP Hybrid modelinin bütünlüğünü korumalıdır.

---

## 2. CAP (Node.js) Backend ve CDS Modelleme Standartları

* **CDS Modelleme (`schema.cds`):**
  * Veritabanı tabloları açık, türleri net ve SAP CDS veri tiplerine (`UUID`, `String`, `LargeBinary`, `Timestamp`, `Boolean` vb.) uygun olarak tanımlanmalıdır.
  * Sertifika yönetimi için dosya içeriği ve MIME type (`@Core.MediaType`, `@Core.IsMediaType`) standart CDS anotasyonları ile modellenmelidir.
* **OData V4 Servis Mimarisi (`service.cds`):**
  * Servisler OData V4 standardında açığa çıkarılmalıdır.
  * Public uçlar (tedarikçi kayıt, giriş, başvuru oluşturma/görüntüleme) ile onaycı uçları (tüm başvuruları listeleme, detay görme, onay/red/AI analizi) mantıksal olarak ayrılmalı veya servis/entity seviyesinde net yetki kurallarına bağlanmalıdır.
* **Servis İş Mantığı (Custom Handlers - `service.js`):**
  * `cds.service.impl` yapısı kullanılmalı; iş mantıkları `before`, `on`, `after` hook'ları içerisine temiz bir şekilde dağıtılmalıdır.
  * Tedarikçi parolaları kaydedilmeden önce `bcryptjs` kullanılarak güvenli şekilde hash'lenmelidir (`saltRounds: 10`).
* **Çift Katmanlı Validasyon (Dual-Layer Validation):**
  * Doğrulama asla sadece kullanıcı arayüzüne (UI) bırakılamaz.
  * Zorunlu alan kontrolleri (Firma Adı, İlgili Kişi, Sertifika), e-posta formatı ve benzersizlik (unique email) denetimi, dosya türünün yalnızca PDF olması ve dosya boyutunun maksimum 10 MB olması backend servis katmanında da kesin olarak denetlenmeli ve ihlal durumunda anlamlı OData hata mesajları (`req.error(...)`) döndürülmelidir.
* **Gerçek Veri Bütünlüğü ve SAP HANA Zorunluluğu:**
  * Sahte (mock/placeholder) veriler yerine, doğrudan veritabanında saklanan gerçek veri yapılarıyla çalışılmalıdır.
  * **Hedef Veritabanı:** Bu projenin tek ve zorunlu hedef veritabanı **SAP HANA**'dır. SQLite yalnızca Faz 2 lokal doğrulama aşamasında sentaks ve veri bütünlüğü testi için kullanılmıştır. Bundan sonraki veri katmanı, sorgu, persistence veya deployment kararlarında SQLite asla hedef olarak alınamaz; tüm geliştirmeler SAP HANA uyumlu yürütülecektir.

---

## 3. Güvenlik, RBAC ve Yetkilendirme Standartları

* **Yetkilendirme Anotasyonları (`@requires` ve `@restrict`):**
  * Onaycı (Approver) servis ve action'ları `@requires: 'Approval'` anotasyonu ile sıkı bir şekilde kilitlenmelidir.
  * Public tedarikçi uçları ise `@restrict: [{ grant: '*', to: 'any' }]` ile herkese açık hale getirilmelidir.
  * Yetkisiz hiçbir istek backend iş mantığına ulaşamamalıdır.
* **XSUAA Yapılandırması (`xs-security.json`):**
  * Proje kök dizininde standart bir `xs-security.json` dosyası bulunmalıdır.
  * Bu dosyada tek bir yetki kapsamı (`scope: Approval`), bu scope'a bağlı bir rol şablonu (`role-template: Approval`) ve BTP üzerinden kullanıcıya atanacak bir rol koleksiyonu (`role-collection: codeup Approval`) tanımlanmalıdır.
* **Approuter ve Rota Sıralaması (`xs-app.json`):**
  * Approuter rotaları yukarıdan aşağıya (top-down) değerlendirilir.
  * Rotaların regex sıralaması hayati önem taşır:
    1. **Public Rotalar:** Tedarikçi önyüzü static kaynakları, kayıt/giriş API'leri ve public OData uçları `authenticationType: none` olarak **en üstte** yer almalıdır.
    2. **Korumalı Rotalar:** Onaycı önyüzü (`supplier-approvals`), onay/red/AI action OData uçları `authenticationType: xsuaa` ve `scope: Approval` gereksinimiyle **alt sırada** yer almalıdır.
  * Yanlış regex sıralaması sistemin güvenliğini çökerteceğinden her rota kuralı bilinçli ve test edilerek yazılmalıdır.

---

## 4. Yapay Zeka (AI) ve BTP Destination Kuralları

* ⚠️ **SIFIR HARD-CODED API KEY KURALI:**
  * Google Gemini veya herhangi bir AI sağlayıcısının API anahtarı **asla ve hiçbir koşulda** kaynak koda, `.env` dosyasına, konfigürasyon dosyalarına veya commit geçmişine yazılmayacaktır.
* **BTP `gemini` Destination Kullanımı:**
  * Backend, SAP BTP Cockpit üzerinde tanımlanmış olan **`gemini`** isimli HTTP Destination servisini kullanacaktır.
  * API kimlik bilgisi Destination üzerindeki `URL.headers.x-goog-api-key` başlığında tutulmaktadır.
  * CAP servis kodunda bu dış servise bağlanırken SAP CAP'in resmi `cds.connect.to('gemini')` veya BTP Destination resolver mekanizması kullanılmalıdır.
* **AI Kapsamı ve Görev Sınırı:**
  * AI analiz aksiyonu tetiklendiğinde sistem yalnızca yüklenen **PDF sertifika belgesini** tarayacaktır.
  * Belgede geçerlilik tarihi aranacaktır; tarih yoksa veya geçmişse AI red gerekçesi oluşturup arayüzde "Sertifika" kutusunun otomatik seçilmesini sağlayacaktır.
  * AI asla veritabanında nihai kararı veren merci olmayacak; öneri sunacak ve son kararı Approver kullanıcısına bırakacaktır.

---

## 5. SAPUI5 Frontend Geliştirme Kuralları (Freestyle UI5)

* 🚫 **ÖZEL (CUSTOM) CSS KESİNLİKLE YASAKTIR:**
  * Hiçbir harici `.css` dosyası oluşturulmayacak ve hiçbir kontrole inline `style="..."` yazılmayacaktır.
  * Arayüz tamamen **SAPUI5 standart kontrolleri** ve **Fiori Horizon** temasının (`sap_horizon`) native gücüyle inşa edilecektir.
  * Hizalama, aralık ve görsel hiyerarşi için SAPUI5 resmi spacing sınıfları kullanılmalıdır:
    * Margin: `sapUiSmallMargin`, `sapUiMediumMargin`, `sapUiTinyMarginBegin`, `sapUiSmallMarginTop` vb.
    * Padding: `sapUiContentPadding`, `sapUiNoContentPadding` vb.
* **Uluslararasılaştırma (i18n) Kuralları:**
  * Arayüzde tek bir kelime dahi hard-coded yazılmayacaktır.
  * Her etiket (`Label`), başlık (`Title`), buton (`Button`), bildirim (`MessageToast`) ve hata mesajı `i18n.properties` dosyalarından okunacaktır.
  * Hem **Türkçe** (`i18n_tr.properties`) hem de **İngilizce** (`i18n_en.properties` / `i18n.properties`) eksiksiz desteklenecektir.
  * Dil seçimi için kullanıcıya buton/select sunulmayacak; tarayıcının dili (`sap.ui.getCore().getConfiguration().getLanguage()`) ne ise arayüz otomatik olarak o dilde açılacaktır.
* **Fiori Launchpad Sandbox Ortamı:**
  * `app/index.html` ushell sandbox'ı başlatmalı ve `app/appconfig/fioriSandboxConfig.json` konfigürasyonunu yüklemelidir.
  * Launchpad üzerinde iki uygulama için de doğru tile tanımları ve hedef çözümlemeleri (inbound navigation) yer almalıdır.
  * XSUAA oturum bilgisi Launchpad kabuğunun kullanıcı profil alanında görüntülenmelidir.
* **Spesifik UI5 Bileşen Standartları:**
  * **Dosya Yükleme:** `sap.ui.unified.FileUploader` kullanılmalı; dosya seçilmeden önce PDF türü ve 10 MB sınırı kullanıcıya açıkça gösterilmeli; dosya seçildiği an tür/boyut doğrulaması yapılmalıdır.
  * **Süreç Akışı:** Başvuru gönderildikten sonra form gizlenmeli ve yerine 3 adımlı süreç için resmi `sap.suite.ui.commons.ProcessFlow` bileşeni yerleştirilmelidir.
  * **Filtre Sekmeleri:** Başvuruları duruma göre ayrıştırmak için `sap.m.IconTabBar` ve `IconTabFilter` kullanılmalıdır.
  * **Tablo ve Ayarlar:** `sap.m.Table` ve sütun/sıralama/filtreleme için `sap.m.ViewSettingsDialog` kullanılmalıdır.
  * **Parola Girişi:** `sap.m.Input` bileşeni `type="Password"` ile kullanılmalı, göz simgesi ile parola göster/gizle sağlanmalı ve parolanın hemen altında 5 kural anlık olarak doğrulanmalıdır.
  * **OData V4 Frontend Tüketimi:** Servis istekleri ve Custom Action çağrıları standart `sap.ui.model.odata.v4.ODataModel` ve context binding mekanizmaları üzerinden yürütülmelidir.

---

## 6. Yeniden Başvuru (Re-apply) İşleyiş Kuralları

* Onaycı bir başvuruyu reddederken:
  1. Karar notu girmek zorundadır (boş bırakılırsa UI hata verir).
  2. Tedarikçinin düzenlemesine izin verilen alanları (`MultiComboBox`) seçmek zorundadır.
* Tedarikçi reddedilen başvurusunda "Tekrar Başvur" butonuna bastığında:
  * Form önceki verilerle dolu gelir.
  * Onaycının seçtiği alanlar dışındaki tüm input'lar **`editable="false"` (salt okunur/kilitli)** olmalıdır.
  * Sadece onaycının izin verdiği alanlar (örn. Telefon veya Sertifika) düzenlenebilir olmalıdır.

---

## 7. Kalite ve Test Standartları (Negative Testing)

Kodlama yapılırken sistemin aşağıdaki 7 negatif test senaryosunda kusursuz ve kararlı tepki vereceği garanti altına alınmalıdır:
1. **Dosya boyutu > 10 MB:** Yükleme engellenmeli, net uyarı gösterilmeli.
2. **Geçersiz dosya formatı (PDF dışı):** Yükleme engellenmeli, net uyarı gösterilmeli.
3. **Mükerrer e-posta ile kayıt:** Backend 400/hata dönmeli, UI kullanıcıyı uyarmalı.
4. **Hatalı e-posta/şifre ile giriş:** Kimlik doğrulama reddedilmeli.
5. **Zorunlu alanlar boşken form gönderimi:** Frontend submit engellemeli, backend doğrulamalı.
6. **Yetkisiz Approvals erişimi:** `Approval` rolü olmayan istekler 403 Forbidden ile engellenmeli.
7. **Tarayıcı dili değişimi:** TR $\leftrightarrow$ EN geçişinde tüm arayüz metinleri anında ilgili dile dönmeli.

---
*Bu teknik ilkeler, projenin mimari temizliğini, güvenliğini, şartnameye tam uyumunu ve uzun vadeli sürdürülebilirliğini temin etmek amacıyla konulmuştur.*
