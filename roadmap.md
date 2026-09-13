# Proje Geliştirme Yol Haritası (Roadmap)

Bu doküman, **CodeUp Supplier Management (Tedarikçi Onboarding & Onay)** projesinin baştan sona tüm geliştirme aşamalarını, fazlarını ve uygulanacak adımlarını tanımlayan ana yol haritasıdır.

> [!NOTE]
> **Yaşayan Yol Haritası İlkesi:**
> Bu doküman projemizin ana rehberidir; ancak değiştirilemez bir dogma değildir. Geliştirme sürecinde karşılaşılan teknik durumlarda, daha iyi ve sağlıklı bir çözüm ortaya çıktığında ortak mutabakat ile adımlarda revizyonlar yapılabilir.

---

## 📌 FAZ 1: Altyapı, Geliştirme Ortamı ve Proje İskeleti (Scaffolding)
*Bu fazda CAP backend ve proje yapısı için gerekli temel dizinler, konfigürasyonlar ve npm paketleri kurulur.*

* [x] **Adım 1.1: CAP İskeletinin Kurulması**
  * `cds init` altyapısı ile `db`, `srv`, `app` klasör yapısının oluşturulması.
  * `package.json` yapılandırması (scripts: `cds watch`, `start` vb.).
* [x] **Adım 1.2: Temel Bağımlılıkların Eklenmesi**
  * `@sap/cds`, `bcryptjs` (şifre hash'leme), `@sap/xssec`, `@sap/xsenv`, `@sap/approuter` paketlerinin kurulması.
* [x] **Adım 1.3: Geliştirici Güvenliği ve `.gitignore`**
  * `.cdsrc-private.json`, `default-env.json`, `node_modules` ve geçici SQLite dosyalarının Git takibi dışına çıkarılması.

---

## 📌 FAZ 2: Veri Modeli ve Gerçekçi Veri Seti (Data Architecture)
*Bu fazda tedarikçilerin ve başvuruların saklanacağı veritabanı modelleri ve gerçekçi tohum verileri hazırlanır.*

* [x] **Adım 2.1: CDS Veri Modelinin Tanımlanması (`db/schema.cds`)**
  * `Suppliers` Varlığı: `ID`, `email` (unique), `passwordHash`, `createdAt`.
  * `Submissions` Varlığı:
    * `ID`, `supplier` (Association to `Suppliers`).
    * `companyName`, `contactPerson`, `phone`, `country`, `taxId`, `website`, `address`, `notes`.
    * `category` (Hardware / Software / Services / Consulting).
    * `status` (Pending / InReview / Approved / Rejected).
    * `submissionDate`.
    * `rejectionReason` (Onaycının gerekçe notu).
    * `editableFields` (Tedarikçinin düzenlemesine izin verilen alanların listesi).
    * `certificate` (`LargeBinary`), `certificateMimeType`, `certificateFileName`.
* [x] **Adım 2.2: 10+ Gerçekçi Kurumsal Başvuru Kaydı (`db/data/*.csv`)**
  * Gerçekçi uluslararası ve Alman firma isimleri, geçerli formatta vergi numaraları, adresleri ve farklı statülerdeki (*Bekleyen*, *Onaylanan*, *Reddedilen*) tohum verilerin hazırlanması.
* [ ] **Adım 2.3: Kontrollü Test PDF Belgelerinin Hazırlanması**
  * AI analizi ve dosya yükleme testlerinde kullanılacak kontrollü test belgelerinin (`valid-cert.pdf`, `expired-cert.pdf`, `large-file-10mb.pdf`) test klasöründe yapılandırılması.
* [ ] **Adım 2.4: Yerel Veritabanının Başlatılması**
  * `cds deploy --to sqlite` ile yerel veritabanının ayağa kaldırılması ve verilerin eksiksiz yüklendiğinin doğrulanması.

---

## 📌 FAZ 3: Güvenlik Mimarisi Tasarımı ve Yetkilendirme Modeli (Security Design)
*Bu fazda kodlama öncesinde yetkilendirme sözleşmeleri ve güvenlik kuralları netleştirilir.*

* [ ] **Adım 3.1: CAP Yetkilendirme Sınırlarının Belirlenmesi**
  * `PublicService` (Dış tedarikçi işlemleri) ile `ApprovalService` (`@requires: 'Approval'`) arasındaki yetki sınırlarının deklaratif tasarımı.
* [ ] **Adım 3.2: `xs-security.json` Deklarasyonunun Hazırlanması**
  * BTP XSUAA için `Approval` scope, `Approval` role template ve `codeup Approval` role collection tanımlarının oluşturulması.
* [ ] **Adım 3.3: Tedarikçi Kimlik ve Oturum Mimarisi Kararı (Supplier Auth Decision)**
  * Dış tedarikçinin login sonrasında mülkiyet izolasyonunu (Supplier A $\rightarrow$ Yalnızca A'nın başvurusunu görme/düzenleme) sağlayacak oturum mekanizmasının teknik olarak netleştirilmesi.
* [ ] **Adım 3.4: Approuter Rota Mimarisi Tasarımı**
  * Public (`none`) ve Korumalı (`xsuaa`) URL rotalarının regex ve top-down öncelik sırasının belirlenmesi.

---

## 📌 FAZ 4: CAP Backend Servisleri ve İş Mantığı (OData V4)
*Bu fazda backend tamamen çalışır ve gerçek veritabanıyla test edilebilir hale gelir.*

* [ ] **Adım 4.1: `PublicService` İmplementasyonu (`srv/public-service.cds` & `.js`)**
  * `register`: Mükerrer e-posta kontrolü, 5 kurallı şifre kontrolü, `bcryptjs` ile hash'leme.
  * `login`: Parola doğrulama ve güvenli tedarikçi oturumunun başlatılması.
  * `getMySubmission`: Tedarikçinin **sadece kendi başvurusunu** okuyabilmesini sağlayan mülkiyet filtresi.
  * `createSubmission`: Zorunlu alanlar, sadece PDF formatı ve maksimum 10 MB sınırı denetimleri (çift katmanlı backend kontrolü).
  * `reApplySubmission`: Yalnızca onaycının izin verdiği `editableFields` alanlarının güncellenebilmesi denetimi.
* [ ] **Adım 4.2: `ApprovalService` İmplementasyonu (`srv/approval-service.cds` & `.js`)**
  * `@requires: 'Approval'` ile koruma.
  * Tüm başvuruları listeleme, arama ve detay sorgulama.
  * `approve`: Durumu `Approved` yapma.
  * `reject`: Karar notu ve düzenlenebilir alan listesi zorunluluğu doğrulaması (`status = 'Rejected'`).
* [ ] **Adım 4.3: BTP `gemini` Destination ve AI Karar Destek Entegrasyonu**
  * `cds.connect.to('gemini')` çağrısı (API anahtarı BTP Destination başlığında, kodda yok).
  * PDF belgesinden geçerlilik analizi: AI'ın geçerlilik durumu, önerilen karar (*Öneri: Onayla* / *Öneri: Reddet*), gerekçe ve önerilen revizyon alanlarını içeren zengin bir **karar destek raporu** döndürmesi.
* [ ] **Adım 4.4: Backend Servislerinin Uçtan Uca API Testi**
  * `cds watch` ile servis uçlarının, validasyonların ve action'ların yerel olarak doğrulanması.

---

## 📌 FAZ 5: Supplier Portal UI5 Uygulaması (Gerçek Backend ile Canlı Entegrasyon)
*İlke: Asla sahte/mock veri kullanılmaz; ekranlar doğrudan çalışan CAP PublicService'e bağlanarak geliştirilir.*

* [ ] **Adım 5.1: UI5 Proje Kurulumu ve i18n Altyapısı**
  * `app/supplierportal/` altında freestyle bileşen; `i18n_tr.properties` ve `i18n_en.properties` (sıfır hardcoded metin, tarayıcı diline göre otomatik seçim).
* [ ] **Adım 5.2: Giriş ve Kayıt Ekranı (Auth View)**
  * Bölünmüş ekran (split-screen: form kartı + kurumsal illüstrasyon).
  * Şifre göster/gizle göz simgesi, anlık yeşile dönen 5 kural göstergesi.
  * Gerçek `register` ve `login` çağrıları; başarılı girişte tedarikçi oturumunun başlatılarak doğrudan başvuru ekranına geçilmesi.
* [ ] **Adım 5.3: Başvuru Formu ve Sertifika Yükleme (Application View)**
  * Gruplandırılmış `SimpleForm`, belirgin zorunlu alan işaretleri.
  * `FileUploader`: Ön bilgilendirme (*"Yalnızca PDF ve en fazla 10 MB"*), dosya seçildiği an anlık format/boyut kontrolü, backend streaming ile gerçek PDF yükleme.
* [ ] **Adım 5.4: Kalıcı Süreç Akışı (ProcessFlow)**
  * Başvuru gönderildiği an formun kaybolması ve yerine 3 adımlı `ProcessFlow` gelmesi.
  * Kullanıcı sayfayı yenilediğinde veya çıkıp tekrar girdiğinde form yerine doğrudan güncel başvuru durumunun gelmesi.
* [ ] **Adım 5.5: Korumalı Yeniden Başvuru (Re-apply)**
  * Reddedilen başvuruda red gerekçesi ve "Tekrar Başvur" butonu.
  * Formun eski verilerle açılması; **ancak sadece onaycının seçtiği alanların düzenlenebilir (`editable="true"`), diğerlerinin kilitli/salt okunur (`editable="false"`) olması**.
  * Düzeltilen verinin gerçek backend'e iletilmesi ve durumun "İncelemede"ye dönmesi.
* [ ] **Adım 5.6: Tema Yönetimi (Dark/Light)**
  * Güncel SAPUI5 Theming API'si kullanılarak custom CSS yazılmadan Evening Horizon $\leftrightarrow$ Morning Horizon geçişi.

---

## 📌 FAZ 6: Supplier Approvals UI5 Uygulaması (Gerçek Backend ile Canlı Entegrasyon)
*İlke: Doğrudan çalışan CAP ApprovalService'e bağlanarak geliştirilir.*

* [ ] **Adım 6.1: UI5 Proje Kurulumu ve i18n Altyapısı**
  * `app/supplier-approvals/` altında freestyle bileşen; `i18n_tr.properties` ve `i18n_en.properties`.
* [ ] **Adım 6.2: Tablo, Filtreler ve Arama**
  * `sap.m.IconTabBar` ile durum filtreleri (*Tüm Başvurular*, *Bekleyen*, *Onaylanan*, *Reddedilen* + adet sayaçları).
  * Dinamik arama çubuğu ve filtre temizleme butonu.
  * `sap.m.Table` (başlangıçta 5 temel sütun, semantik `ObjectStatus`).
  * `ViewSettingsDialog`: Sütun ekleme/çıkarma, tarihe göre sıralama, kategori filtresi.
* [ ] **Adım 6.3: Başvuru Detay Diyaloğu ve PDF Inline Önizleme**
  * Detay penceresinde tüm alanların ve süreç adımlarının gösterimi.
  * Yüklenen PDF sertifikanın doğrudan tarayıcı içinde önizlenmesi.
* [ ] **Adım 6.4: Karar İşlemleri ve AI Karar Desteği**
  * Elle Onaylama: Başvuruyu `Approved` yapma.
  * AI ile Analiz Et Butonu: Loading göstergesi, BTP `gemini` backend action çağrısı, AI karar destek raporunun görüntülenmesi, red önerisinde gerekçe ve "Sertifika" alanının otomatik doldurulması.
  * Elle Reddetme: Zorunlu karar notu ve düzenlenebilir alan seçimi doğrulaması.

---

## 📌 FAZ 7: Approuter, XSUAA Güvenlik ve Local Fiori Launchpad Entegrasyonu (Sistem Birleşimi)
*Bu fazda her iki çalışan uygulama ve backend, 5000 portundaki Approuter ve Launchpad sandbox kabuğu altında birleştirilir.*

* [ ] **Adım 7.1: Approuter İmplementasyonu ve Rota Doğrulaması (`xs-app.json` & Port 5000)**
  * Approuter'ın 5000 portunda dinleyecek şekilde yapılandırılması.
  * Top-down regex kuralına göre public uçlar (`none`) ile korumalı onay uçlarının (`xsuaa` + `Approval`) test edilmesi.
* [ ] **Adım 7.2: Fiori Launchpad Sandbox Yapılandırması (`app/index.html` & `fioriSandboxConfig.json`)**
  * Launchpad shell'inin ayağa kaldırılması, 2 tile tanımı (`SupplierPortal` ve `SupplierApprovals`).
  * Launchpad başlığında (header) XSUAA'dan gelen gerçek kullanıcı bilgilerinin (ad-soyad, e-posta, avatar) gösterilmesi.
* [ ] **Adım 7.3: BTP Hibrit Bağlantı ve Rol Testi**
  * `cds bind` ile BTP XSUAA servisi ve Destination servisinin yerel Approuter'a bağlanması.
  * BTP Cockpit üzerinden `codeup Approval` rol koleksiyonu atama prosedürünün manuel uygulanması ve korumalı panele erişim testi.

---

## 📌 FAZ 8: Test Doğrulama (7 Negatif Test) ve Teslimat Hazırlığı
* [ ] **Adım 8.1: 7 Zorunlu Negatif Testin Doğrulanması**
  * ❌ 10 MB'tan büyük dosya yükleme denemesi.
  * ❌ PDF olmayan dosya türü yükleme denemesi.
  * ❌ Mükerrer e-posta ile kayıt denemesi.
  * ❌ Yanlış e-posta/şifre ile giriş denemesi.
  * ❌ Zorunlu alanlar boşken başvuru denemesi.
  * ❌ `Approval` rolü olmadan onay paneline erişim denemesi (403 / yetki engeli).
  * 🌐 Tarayıcı dilini TR $\leftrightarrow$ EN değiştirip metinlerin butonsuz otomatik dönüştüğünü gösterme.
* [ ] **Adım 8.2: Pozitif Uçtan Uca Senaryo Doğrulaması**
  * Kayıt $\rightarrow$ Başvuru $\rightarrow$ ProcessFlow $\rightarrow$ Onaycı İnceleme $\rightarrow$ AI Analiz Önerisi $\rightarrow$ Red/Düzeltme $\rightarrow$ Korumalı Re-apply $\rightarrow$ Onay döngüsünün tam testi.
* [ ] **Adım 8.3: Sıfır Custom CSS ve Sıfır Hard-coded Metin Denetimi**
* [ ] **Adım 8.4: Video Anlatım Rehberi (Demo Script)**
  * Teslimat videosu çekilirken takip edilecek adım adım senaryo kılavuzunun hazırlanması.

---
*Bu yol haritası, projenin başından teslim anına kadar adım adım izlenecek, gerektiğinde ortak kararla güncellenebilecek resmi geliştirme kılavuzumuzdur.*
