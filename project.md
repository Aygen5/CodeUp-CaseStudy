# Proje Tanımı ve Referans Dokümanı

## 1. Proje Adı ve Bağlamı
* **Proje Adı:** Supplier Management — Tedarikçi Onboarding & Onay
* **Bağlam:** Bu proje, CodeUp Praktikum Case Study çalışması kapsamında geliştirilmektedir. Tedarikçilerin dışarıdan sisteme kaydolup başvuruda bulunabildiği (onboarding), kurum içi onay yetkililerinin ise bu başvuruları inceleyip karara bağlayabildiği ve yapay zekâ (AI) destekli sertifika doğrulaması yapabildiği iki taraflı bir kurumsal yönetim platformudur.

> **Gereksinim Kapsamı ve Sadakat İlkesi:**
> Bu proje resmi CodeUp case study gereksinimlerine tam olarak bağlıdır. Gereksinimlerde tanımlanmamış olan fazladan ana ekranlar, alakasız iş akışları veya yapay özellikler eklenmeyecektir. Tasarım tarafında görsel derinlik, kurumsal şıklık ve kullanıcı deneyimi açısından SAP standartları çerçevesinde yaratıcılık kullanılabilir; ancak işleyiş, iş kuralları ve sayfa hiyerarşisi birebir case study şartnamesine sadık kalacaktır.

---

## 2. Genel Sistem Mimarisi ve Portlar

Sistem; CAP backend, Approuter, yerel Fiori Launchpad ve dış servis entegrasyonlarından (SAP BTP XSUAA ve BTP Destination) oluşan katmanlı bir mimariye sahiptir.

```
[ Web Tarayıcısı ]
       │
       ▼ (localhost:5000)
┌─────────────────────────────────────────────────────────────┐
│                 Approuter (@sap/approuter)                  │
│  - Merkezi giriş kapısı, yönlendirme ve güvenlik denetimi   │
│  - BTP XSUAA ile kimlik doğrulama yönlendirmesi             │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────────┐   ┌─────────────────────────┐
│     Lokal Fiori Launchpad     │   │   CAP Node.js Backend   │
│  (app/index.html - ushell)    │   │    (localhost:4004)     │
│  - Supplier Portal (Public)   │   │  - OData V4 Servisleri  │
│  - Supplier Approvals (Role)  │   │  - Rol Denetimi (RBAC)  │
└───────────────────────────────┘   └────────────┬────────────┘
                                                 │
                                                 ▼
                                    ┌─────────────────────────┐
                                    │     BTP Destination     │
                                    │    (gemini AI Servisi)  │
                                    └─────────────────────────┘
```

### Port Yapılandırması:
* **`localhost:4004` (CAP Backend):**
  * SAP Cloud Application Programming Model (Node.js) üzerinde koşan OData V4 servis katmanıdır.
  * Veritabanı modellerini (`schema.cds`), OData V4 servis uçlarını (`service.cds`), özel iş mantıklarını (custom handler'lar), dosya akışını (streaming) ve veri doğrulama kurallarını barındırır.
* **`localhost:5000` (Approuter):**
  * Kullanıcıların sisteme eriştiği ana adrestir. Tüm gelen trafik Approuter üzerinden yönetilir.
  * İstemci isteklerini inceler; public (herkese açık) rotaları doğrudan hedefine iletirken, korumalı rotalarda kullanıcının BTP XSUAA oturumunu ve yetki kapsamını (scope) doğrular.

### Lokal Fiori Launchpad (`#Shell-home`):
* `localhost:5000/index.html#Shell-home` adresinde çalışır.
* `app/index.html` ve `app/appconfig/fioriSandboxConfig.json` dosyaları üzerinden SAP Fiori ushell sandbox ortamı olarak başlatılır.
* İki ana uygulamayı kutucuk (tile) olarak barındırır:
  1. **Supplier Portal:** Dış tedarikçilere yönelik self-service portal.
  2. **Supplier Approvals:** İç onay ekibine yönelik yönetim ve karar kokpiti.
* Launchpad kabuğunun sağ üst başlık (header) kısmında, XSUAA üzerinden giriş yapmış olan gerçek BTP kullanıcısının profil bilgileri (ad, soyad, e-posta) dinamik olarak yer alır.

---

## 3. Kimlik Doğrulama ve Rol Tabanlı Yetkilendirme (RBAC)

Sistemde iki farklı kullanıcı türü ve iki ayrı kimlik mekanizması bulunur:

### A. Dış Kullanıcılar (Tedarikçiler / Public):
* SAP BTP hesabı gerektirmez.
* Veritabanında bağımsız olarak saklanan hesaplarla işlem yaparlar.
* Kayıt, giriş, başvuru formu doldurma ve başvuru takip uçları herkese açıktır (`@restrict: [{ grant: '*', to: 'any' }]` / `authenticationType: none`).
* Parolalar veritabanında kesinlikle düz metin (plain text) olarak tutulmaz; **`bcryptjs`** kütüphanesi ile tek yönlü olarak hash'lenerek saklanır.

### B. İç Kullanıcılar (Onaycılar / Approver):
* SAP BTP üzerinde kimliği doğrulanmış gerçek kurumsal kullanıcılardır.
* `xs-security.json` dosyasında tanımlanan **`codeup Approval`** (`SupplierApprovals`) rol koleksiyonuna sahip olmak zorundadırlar.
* Yetkisi olmayan kullanıcılar onay paneline ve onay API uçlarına erişemez (`@requires: 'Approval'`).

---

## 4. Supplier Portal (Tedarikçi Portalı) İşlevleri

Tedarikçi portalı (`supplierportal/index.html`), dış paydaşların kuruma akredite olmasını sağlayan self-service arayüzdür.

### A. Giriş ve Kayıt (Login & Register)
* **Özel Tasarım:** Standart şablonlardan uzak, kurumsal ve modern bir giriş/kayıt arayüzü sunulur.
* **Mükerrer E-Posta Kontrolü:** Kayıt ekranında girilen e-postanın sistemde daha önce kayıtlı olup olmadığı kontrol edilir; mükerrer kayıtlara izin verilmez.
* **Güçlü Parola Kuralları ve Canlı Doğrulama:**
  * Parola en az 8 karakter uzunluğunda olmalı; en az bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter içermelidir.
  * Bu kuralların tamamı parola giriş alanının altında alt alta listelenir.
  * Kullanıcı alana yazmaya başladığı anda kurallar görünür hale gelir ve sağlanan her kriter canlı olarak yeşil tike döner.
  * Parola kutusunda tek bir alan kullanılır; yanındaki göz simgesi ile parola gösterilip gizlenebilir.
* **Otomatik Giriş:** Kayıt başarıyla tamamlandığında kullanıcı tekrar giriş sayfasına gönderilmez; otomatik olarak oturum açmış sayılarak doğrudan başvuru formuna aktarılır.

### B. Başvuru Formu ve Zorunlu Alanlar
* **Form Alanları:** Firma Adı, İlgili Kişi, Telefon, Ülke, Kategori (*Hardware / Software / Services / Consulting*), Vergi No, Web Sitesi, Adres, Notlar ve Sertifika (PDF).
* **Zorunlu Alanlar:** **Firma Adı**, **İlgili Kişi** ve **Sertifika (PDF) yüklemesi** kesinlikle zorunludur.
* **Çift Katmanlı Doğrulama:** Zorunlu alanların kontrolü hem kullanıcı arayüzünde (frontend) kullanıcıyı uyaracak şekilde hem de CAP backend servis katmanında veri bütünlüğünü garanti edecek şekilde uygulanır. Boş veya eksik form gönderilemez.
* **Format Kontrolleri:** Vergi numarası, web sitesi URL yapısı ve telefon numarası alanlarında uygun format doğrulamaları yapılır.

### C. Sertifika (PDF) Yükleme Kuralları
* **Dosya Türü Kısıtı:** Yalnızca **PDF** formatındaki dosyalar kabul edilir. PDF dışındaki dosyaların seçilmesine veya yüklenmesine izin verilmez.
* **Boyut Sınırı:** Yüklenebilecek dosya boyutu en fazla **10 MB** olabilir.
* **Ön Bilgilendirme:** Bu kurallar (PDF formatı ve 10 MB sınırı), kullanıcı henüz dosya seçmeden önce arayüzde açık ve net bir bilgilendirme metni olarak belirtilir.
* **Teknik Altyapı:** Dosya transferi `sap.ui.unified.FileUploader` ve CAP `LargeBinary` / `@Core.MediaType` streaming mekanizmaları üzerinden yönetilir.

### D. Gönderim Sonrası Süreç Takibi (Process Flow)
* Başvuru formu başarıyla gönderildiği anda form ekranı tamamen kaybolur.
* Formun yerine sürecin hangi aşamada olduğunu gösteren 3 adımlı süreç akışı (`sap.suite.ui.commons.ProcessFlow`) gelir:
  $$\text{1. Gönderildi} \longrightarrow \text{2. İncelemede} \longrightarrow \text{3. Sonuç (Onaylandı / Reddedildi)}$$
* **Kalıcı Durum Kuralı:** Tedarikçi oturumu kapatıp yeniden giriş yaptığında başvuru formunu tekrar göremez ve yeniden dolduramaz; doğrudan başvurusunun güncel durumunu gösteren süreç akışıyla karşılaşır.

---

## 5. Supplier Approvals (Onaycı Portalı) İşlevleri

Onaycı portalı (`supplier-approvals/index.html`), `Approval` rolüne sahip yöneticilerin başvuruları incelediği karar kokpitidir.

### A. Başvuru Tablosu ve Yönetim Araçları
* **Başlangıç Görünümü:** Tabloda başlangıçta 5 temel sütun yer alır: *Firma, İlgili Kişi, E-Posta, Gönderim Tarihi, Durum*.
* **Görünüm Ayarları (View Settings Dialog):**
  * Kullanıcı ayarlar penceresi üzerinden diğer tüm başvuru alanlarını (*Telefon, Ülke, Kategori, Vergi No, Web Sitesi, Adres, Notlar*) tablo sütunlarına ekleyip çıkarabilir.
  * Gönderim tarihine göre artan/azalan sıralama yapabilir.
  * Kategoriye göre filtreleme uygulayabilir.
* **Statü Sekmeleri (`sap.m.IconTabBar`):** Duruma göre hızlı filtreleme sunar:
  * *Tüm Başvurular*
  * *Bekleyen*
  * *Onaylanan*
  * *Reddedilen*
* **Arama Çubuğu:** Firma adı, ilgili kişi adı ve e-posta adresi üzerinden anlık arama desteği sunar.
* **Filtre Temizleme:** Uygulanmış olan tüm arama ve durum filtrelerini tek tıkla sıfırlayarak listeyi varsayılan durumuna ("Tüm Başvurular") döndürür.

### B. Başvuru Detay Kartı ve PDF Önizleme
* Tablodaki bir başvuru satırına tıklandığında detay diyaloğu açılır.
* Başvuruya ait tüm alanlar ve mevcut onay aşaması diyalog içerisinde eksiksiz görüntülenir.
* Yüklenmiş olan PDF sertifikası kullanıcıyı dosyayı indirmeye zorlamadan, doğrudan tarayıcı içinde önizlenebilir.

### C. Karar Mekanizmaları (Elle Onay / Red)
* **Elle Onay:** Onaycı başvuruyu doğrudan onaylayabilir; durum "Onaylandı" olarak güncellenir ve süreç akışı her iki tarafta tamamlanır.
* **Elle Reddetme Kuralları (Zorunlu Alanlar):**
  1. **Karar Notu (Gerekçe) Zorunluluğu:** Reddedilen bir başvuru için onaycının gerekçe girmesi zorunludur. Gerekçe girilmeden "Reddet" butonuna basılırsa alan kırmızı hata durumuna geçer ve işlem engellenir.
  2. **Düzenlenebilir Alan(lar)ın Seçimi Zorunluluğu:** Onaycı, tedarikçinin hangi alanları revize etmesine izin vereceğini çoklu seçim alanından (Multi-combobox) belirlemek zorundadır.

---

## 6. AI Destekli Sertifika Analizi

Yapay zekâ entegrasyonu, onaycının belge inceleme yükünü hafifletmek ve süreçleri hızlandırmak amacıyla tasarlanmıştır.

* **Analiz Kapsamı:** AI analiz aksiyonu tetiklendiğinde sistem diğer başvuru alanlarını değil, **yalnızca yüklenen PDF sertifika belgesini** okur ve analiz eder.
* **Temel Amaç:** Belge içerisinde kurumsal bir **Geçerlilik Tarihi (Expiry Date)** aramak ve tespit etmektir.
* **Senaryolar:**
  * **Geçerlilik Tarihi Bulunamaması veya Süresi Dolmuş Olması:**
    * AI sistemde red önerisi üretir: *"Geçerlilik tarihi bulunamadı / Belge süresi dolmuş"*.
    * Sistem otomatik olarak "Tedarikçinin düzenleyebileceği alanlar" listesinde **"Sertifika"** seçeneğini işaretler.
    * AI gerekçesi onaycının karar notu alanına aktarılabilir.
  * **Geçerlilik Tarihinin Güncel Olması:**
    * AI yeşil renkli onay bildirimi sunar: *"Geçerlilik tarihi onaylandı: YYYY-AA-GG"*.
* **İnsan Odaklı Karar (Human-in-the-Loop):** Yapay zekâ başvuruyu doğrudan veritabanında onaylamaz veya reddetmez; onaycıya akıllı bir karar önerisi sunar. Nihai karar her zaman onaycının buton tıklaması ile verilir.

---

## 7. Reddetme ve Yeniden Başvuru (Re-apply) Süreci

Başvuru onaycı tarafından reddedildiğinde tedarikçi portalında şu akış işletilir:

1. **Gerekçe Bildirimi:** Tedarikçi sayfayı açtığında veya yenilediğinde üst kısımda red bildirimini ve onaycının yazdığı karar gerekçesini açıkça görür.
2. **Süreç Akışı Göstergesi:** 3 adımlı akışın son adımı kırmızı renkli "Reddedildi" ikonuna dönüşür.
3. **"Tekrar Başvur" Butonu:** Arayüzde yeniden başvuru imkânı sunan buton belirir.
4. **Korumalı Form Açılışı:**
   * Butona tıklandığında başvuru formu eski verilerle dolu olarak tekrar açılır.
   * **Önemli Kural:** Onaycının izin vermediği tüm alanlar kilitli, grileşmiş ve salt okunurdur (read-only).
   * Yalnızca onaycının seçtiği revizyon alanları (örneğin yalnızca "Telefon" veya yalnızca "Sertifika") düzenlenebilir durumdadır.
5. **Yeniden Gönderim:** Tedarikçi istenen düzeltmeyi yapıp formu gönderdiğinde, başvuru statüsü yeniden "İncelemede" durumuna döner ve onaycının tablosunda incelenmek üzere listelenir.

---

## 8. Uluslararasılaştırma (i18n) ve Otomatik Dil Algılama

* **Desteklenen Diller:** Sistem **Türkçe** (`i18n_tr.properties`) ve **İngilizce** (`i18n_en.properties` / `i18n.properties`) dillerini eksiksiz olarak destekler.
* **Sıfır Sabit Metin Kuralı:** Arayüzdeki hiçbir buton, etiket, başlık, bildirim veya hata mesajında doğrudan koda yazılmış (hard-coded) metin bulunamaz; tüm metinler i18n dosyasından okunur.
* **Otomatik Dil Algılama:** Arayüzde dil değiştirmek için herhangi bir buton, bayrak veya açılır kutu (select) yer almaz. Dil, kullanıcının internet tarayıcısının varsayılan diline göre otomatik olarak algılanır ve uygulanır.

---

## 9. Tasarım Kuralları ve Standartlar

* 🚫 **Özel (Custom) CSS Kesinlikle Kullanılmaz:**
  * Projede harici `.css` dosyaları veya element bazlı inline `style` tanımları yazılmayacaktır.
  * Tasarım dili tamamen SAP Fiori tasarım kılavuzlarına ve **Fiori Horizon** temasına uygun olacaktır.
  * Görsel hiyerarşi, derinlik, aralıklar ve hizalamalar yalnızca SAPUI5'in öntanımlı layout kontrolleri (`sap.m.FlexBox`, `sap.ui.layout.Grid`, `sap.f.DynamicPage` vb.) ve resmi margin/padding CSS sınıfları (`sapUiSmallMargin`, `sapUiContentPadding` vb.) kullanılarak sağlanacaktır.
* **Gerçek Veri Bütünlüğü:**
  * Süreçleri geçiştiren sahte (fake) UI component'leri veya işlevsiz placeholder düğmeler kullanılmayacaktır.
  * Tüm form gönderimleri, durum değişimleri, dosya transferleri ve yetkilendirmeler CAP backend'inde gerçek veri yapıları ve modelleri ile çalışacaktır.
  * Başlangıç testleri için en az 10 farklı firmanın gerçekçi başvuru durumlarını içeren CSV/seed verisi sisteme beslenecektir.

---

## 10. Güvenlik Açısından Kritik Kurallar

1. **Rota Sıralaması (`xs-app.json`):**
   * Approuter rotaları yukarıdan aşağıya değerlendirilir.
   * Public rotalar (tedarikçi kayıt, giriş, form gönderim API'leri) mutlaka en üstte `authenticationType: none` olarak tanımlanmalıdır.
   * Korumalı onay ve yönetim rotaları alt sıralarda `authenticationType: xsuaa` ve `Approval` scope denetimi ile yapılandırılmalıdır. Sıralama hatası güvenlik zafiyetine veya portala erişilememesine yol açar.
2. **CAP Seviyesinde Yetki Kontrolü:**
   * Yetkilendirme sadece Approuter ile sınırlı kalmayacak; servis seviyesinde `@requires: 'Approval'` ve entity seviyesinde `@restrict` anotasyonları ile çift katmanlı korunacaktır.
3. **Dış Servis Güvenliği (Destination):**
   * Yapay zekâ (Google Gemini) API anahtarı hiçbir koşulda kaynak koda, konfigürasyon dosyalarına veya ortam değişkenlerine (`.env`) yazılmayacaktır.
   * Bağlantı, SAP BTP üzerinde oluşturulmuş olan **`gemini`** adlı Destination üzerinden, `URL.headers.x-goog-api-key` başlığı kullanılarak gerçekleştirilecektir.

---

## 11. Zorunlu Negatif Test Senaryoları ve Video Teslimi

Proje tamamlandığında hazırlanacak teslimat ve tanıtım videosunda, sistemin yalnızca başarılı akışları değil; hata yönetimini ve güvenlik duvarlarını da doğru işlettiğini kanıtlamak üzere aşağıdaki **7 zorunlu negatif senaryo** gösterilmelidir:

1. ❌ **10 MB'tan büyük dosya yükleme denemesi:** Dosya boyutu sınırının aşıldığını belirten uyarının görülmesi.
2. ❌ **PDF olmayan dosya türü yükleme denemesi:** Geçersiz dosya formatı uyarısının görülmesi.
3. ❌ **Mükerrer e-posta ile kayıt denemesi:** Sistemde zaten kayıtlı olan bir e-posta ile ikinci kez kayıt olunamadığının kanıtlanması.
4. ❌ **Yanlış veya var olmayan hesapla giriş denemesi:** Hatalı kimlik bilgisi uyarısının gösterilmesi.
5. ❌ **Zorunlu alanlar boşken başvuru gönderme denemesi:** Zorunlu alan uyarılarının devreye girmesi ve formun iletilmemesi.
6. ❌ **Yetkisiz kullanıcı ile Supplier Approvals'a erişim denemesi:** `Approval` rolü atanmamış kullanıcının panele alınmadığının (403 / yetki engeli) kanıtlanması.
7. 🌐 **Tarayıcı dili değiştirme testi:** Tarayıcı dili Türkçe ile İngilizce arasında değiştirildiğinde, sayfadaki tüm metinlerin otomatik olarak ilgili dile dönüştüğünün gösterilmesi.

---
*Bu doküman, CodeUp Supplier Management projesinin tüm geliştirme aşamalarında değişmez kılavuz ve teknik şartname olarak referans alınacaktır.*
