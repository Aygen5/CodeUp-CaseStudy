# Teknik Mimari Referans Dokümanı (Architecture Reference)

Bu doküman, **CodeUp Supplier Management (Tedarikçi Onboarding & Onay)** projesinin teknik mimarisini, sistem bileşenlerini, veri ve trafik akışlarını, güvenlik katmanlarını ve entegrasyon sınırlarını tanımlar.

---

## 1. Genel Mimari ve Sistem Bileşenleri

Proje, SAP BTP standartlarına ve bulut yerel (cloud-native) mimariye uygun olarak katmanlı bir yapıda tasarlanmıştır.

```
                                  [ Web Tarayıcısı ]
                                           │
                                           ▼ (localhost:5000)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Approuter (@sap/approuter)                               │
│  - Tek Giriş Kapısı (Reverse Proxy)                                                    │
│  - Rota Yönetimi (xs-app.json)                                                         │
│  - XSUAA Kimlik Doğrulama Yönlendirmesi (BTP Hybrid)                                   │
└──────────────┬─────────────────────────────────────────────────────────┬───────────────┘
               │                                                         │
               ▼ (Statik UI Dosyaları / Shell)                           ▼ (OData İstekleri / API)
┌───────────────────────────────────────────────┐       ┌────────────────────────────────┐
│             Lokal Fiori Launchpad             │       │      CAP Node.js Backend       │
│      (app/index.html + Sandbox Config)        │       │        (localhost:4004)        │
├───────────────────────┬───────────────────────┤       │  - OData V4 Servis Katmanı     │
│    Supplier Portal    │  Supplier Approvals   │       │  - Rol Denetimi (RBAC)         │
│   (Harici Tedarikçi)  │  (Korumalı Onaycı)    │       │  - Validasyon & Dosya Akışı    │
└───────────────────────┴───────────────────────┘       └───────────────┬────────────────┘
                                                                        │
                                       ┌────────────────────────────────┴───────────────┐
                                       ▼                                                ▼
                        ┌──────────────────────────────┐                ┌──────────────────────────────┐
                        │      Veritabanı Katmanı      │                │       BTP Destination        │
                        │    (HANA Cloud / SQLite)     │                │     (gemini AI Servisi)      │
                        └──────────────────────────────┘                └──────────────────────────────┘
```

### Bileşenlerin Rolleri:

1. **Approuter (`@sap/approuter`):**
   * Port: **`5000`**.
   * Sistemin dış dünyaya açık **tek giriş kapısıdır (Reverse Proxy)**.
   * Tüm kullanıcı isteklerini karşılar; gelen isteğin URL'sine göre kimlik doğrulama gerekip gerekmediğini denetler ve trafiği ilgili hedefe (statik UI veya CAP backend) yönlendirir.
2. **CAP Node.js Backend:**
   * Port: **`4004`**.
   * SAP Cloud Application Programming Model üzerinde çalışan iş mantığı ve veri yönetim katmanıdır.
   * OData V4 servislerini, dosya akışını (PDF streaming), şifre hash'leme mantığını (`bcryptjs`) ve iş kurallarını barındırır.
   * **Önemli İlke:** CAP backend doğrudan kullanıcıların tarayıcıdan girdiği bir arayüz kapısı değildir; tüm istekler Approuter üzerinden güvenli bir şekilde backend'e iletilir.
3. **OData V4:**
   * Frontend ile backend arasındaki modern veri iletişim protokolüdür.
   * Varlıkların (Entities) CRUD operasyonlarını ve özel aksiyonları (Custom Actions - örn. AI analizi) yönetir.
4. **Local Fiori Launchpad (Sandbox):**
   * İki UI5 uygulamasını tek bir kurumsal ana sayfada kutucuklar (tile) halinde sunan SAP ushell ortamıdır.
5. **Supplier Portal UI5 Uygulaması:**
   * Dış tedarikçilerin kullandığı, bağımsız SAPUI5 freestyle uygulamasıdır.
6. **Supplier Approvals UI5 Uygulaması:**
   * İç onay ekibinin kullandığı, yetki kilitli SAPUI5 freestyle uygulamasıdır.
7. **XSUAA (SAP BTP Kimlik Servisi):**
   * Kurumsal kullanıcıların kimliğini doğrulayan ve JWT (JSON Web Token) üreten OAuth2 servisidir.
8. **BTP Destination Servisi:**
   * Bulut ortamında dış servislerin (AI / Gemini) bağlantı adreslerini ve kimlik bilgilerini güvenli bir şekilde saklayan BTP altyapı servisidir.
9. **Veritabanı (Database):**
   * Tedarikçi hesapları, başvuru bilgileri, alan izinleri ve PDF sertifika ikili verilerinin (`LargeBinary`) saklandığı katmandır (Localde SQLite, BTP üzerinde HANA Cloud).

---

## 2. Uçtan Uca Trafik Akışı (Traffic Flow)

Kullanıcının sisteme erişiminden veritabanına ulaşana kadar gerçekleşen standart trafik adımları şunlardır:

```
[Kullanıcı] ──1──> [Approuter :5000] ──2──> [BTP XSUAA Login / IAS]
                          │
                   3 (Token Doğrulandı)
                          │
                          ▼
                 [Fiori Launchpad #Shell-home]
                   ├── Tile 1: Supplier Portal
                   └── Tile 2: Supplier Approvals
                          │
                   4 (UI5 Uygulaması Açılır)
                          │
                          ▼
                 [OData V4 İstekleri]
                          │
                          ▼ (Approuter üzerinden)
                 [CAP Backend :4004]
                          │
                   5 (RBAC & Validasyon)
                          │
                          ▼
                 [Veritabanı (DB)] & [BTP gemini Destination]
```

1. **İstek Karşılama:** Kullanıcı tarayıcısında `http://localhost:5000` adresine gider. İstek doğrudan Approuter tarafından karşılanır.
2. **Kimlik Denetimi:** Approuter kullanıcının oturumunu kontrol eder. Oturum yoksa BTP Identity Provider (IAS / Default Identity Provider) login ekranına yönlendirir.
3. **Launchpad Açılışı:** Başarılı giriş sonrasında kullanıcı `localhost:5000/index.html#Shell-home` adresine yönlendirilir. Fiori Sandbox kabuğu iki tile ile ekrana gelir.
4. **Uygulama Yüklenmesi:** Kullanıcı bir tile'a tıkladığında, ilgili UI5 uygulaması Approuter üzerinden tarayıcıya servis edilir.
5. **Backend İletişimi:** UI5 uygulamasının yaptığı veri okuma/yazma ve action istekleri yine `localhost:5000/odata/v4/...` rotası üzerinden Approuter'a gelir. Approuter isteği `localhost:4004` üzerinde koşan CAP backend servisine aktarır.

---

## 3. Supplier Portal (Tedarikçi Portalı) İş Akışı Mimarisi

Dış tedarikçilere yönelik akış tamamen public (BTP kullanıcısı gerektirmeyen) bir veri modeline dayanır:

1. **Public Kimlik Yönetimi (Auth):**
   * **Kayıt (Registration):** Tedarikçi e-posta ve parola ile kaydolur. Backend'de e-postanın benzersizliği (unique) kontrol edilir.
   * **Parola Güvenliği:** Parola 5 güçlü şifre kuralına göre UI'da canlı doğrulanır. Backend'e ulaştığında `bcryptjs` ile hash'lenerek veritabanına yazılır.
   * **Giriş (Login):** Kayıtlı e-posta ve parola kontrol edilir. Başarılı girişte doğrudan tedarikçi oturumu başlatılır.
2. **Başvuru Formu ve Sertifika Yükleme:**
   * Tedarikçi firma bilgilerini doldurur.
   * `sap.ui.unified.FileUploader` ile PDF formatındaki sertifikasını seçer.
   * **Doğrulama:** Yalnızca `.pdf` kabul edilir; dosya boyutu $\le$ 10 MB olmalıdır (Frontend ve Backend çift katmanlı denetim).
3. **Gönderim (Submission) ve Durum Kilitlenmesi:**
   * Form backend'e gönderilir (`Status = 'Pending'`).
   * Başvuru başarılı olduğunda form ekrandan kalkar ve kalıcı **3 adımlı ProcessFlow** devreye girer:
     $$\text{Gönderildi} \longrightarrow \text{İncelemede} \longrightarrow \text{Sonuç (Onaylandı / Reddedildi)}$$
   * Tedarikçi çıkış yapıp tekrar girdiğinde form asla tekrar açılmaz; doğrudan güncel durum akışı gösterilir.
4. **Red (Rejection) ve Yeniden Başvuru (Re-apply):**
   * Başvuru onaycı tarafından reddedilirse durum `Rejected` olur ve 3. adım kırmızıya döner.
   * Ekranda onaycının girdiği gerekçe (karar notu) gösterilir ve **"Tekrar Başvur"** butonu belirir.
   * Buton tıklandığında form eski verilerle dolu açılır; **ancak yalnızca onaycının izin verdiği alanlar aktiftir (editable)**. İzin verilmeyen tüm alanlar kilitlidir (salt okunur).
   * Düzeltme yapılıp tekrar gönderildiğinde durum yeniden `In Review` (İncelemede) aşamasına geçer.

---

## 4. Supplier Approvals (Onaycı Portalı) İş Akışı Mimarisi

Kurum içi yöneticilere yönelik yönetim kokpiti:

1. **Erişim Denetimi:** Yalnızca BTP XSUAA üzerinde **`codeup Approval`** rol koleksiyonuna sahip kullanıcılar bu paneli açabilir ve veri çekebilir.
2. **Başvuru Listesi ve Tablo:**
   * İlk açılışta 5 temel sütun görüntülenir (*Firma, İlgili Kişi, E-Posta, Gönderim Tarihi, Durum*).
   * `sap.m.IconTabBar` ile sekmeler arası hızlı filtreleme sağlanır (*Tüm Başvurular, Bekleyen, Onaylanan, Reddedilen*).
   * Dinamik arama çubuğu ve filtre temizleme butonu mevcuttur.
   * `ViewSettingsDialog` ile diğer alanlar sütunlara dahil edilebilir, tarihe göre sıralama yapılabilir.
3. **Detay Kartı ve PDF Önizleme:**
   * Satır tıklandığında detay diyaloğu açılır.
   * Başvuru sahibinin yüklediği PDF sertifika, dosya indirilmeden doğrudan tarayıcı içerisinde (inline iframe/dialog) önizlenir.
4. **Karar Mekanizması:**
   * **Elle Onaylama:** Durum `Approved` yapılır; ProcessFlow her iki tarafta yeşil olarak tamamlanır.
   * **Elle Reddetme:**
     * Karar notu (gerekçe) yazılması **zorunludur**.
     * Tedarikçinin hangi alanları düzenleyebileceği (`editableFields`) çoklu seçim ile belirlenmek **zorundadır**.
   * **AI ile Analiz:** Onaycı "AI ile Analiz Et" butonuna basarak sertifikanın yapay zekâ tarafından taranmasını sağlar. AI geçerlilik tarihini bulamazsa veya tarih geçmişse red önerir, sertifika alanını otomatik seçer ve gerekçeyi hazırlar.

---

## 5. Yetkilendirme Mimarisi (Authorization & RBAC)

Güvenlik modeli 4 kritik bileşenin uyumuna dayanır:

```
[BTP Role Collection: "codeup Approval"]
               │ (Eşleşme)
               ▼
[xs-security.json: Role Template "Approval" / Scope "Approval"]
               │
               ▼
[xs-app.json (Approuter)]: authenticationType: xsuaa, scope: Approval
               │
               ▼
[CAP CDS Service]: @requires: 'Approval' / @restrict
```

### Approuter Rota Sıralamasının (`xs-app.json`) Önemi:
Approuter rotaları **yukarıdan aşağıya (top-down)** sırayla eşleştirir. Bu nedenle regex kural sırası sistemin güvenliğini doğrudan belirler:

1. **1. Sıra (Public Tedarikçi Rotaları):**
   * `/supplierportal/**` statik dosyaları
   * `/odata/v4/public/**` (Kayıt, giriş, başvuru oluşturma ve durum sorgulama uçları)
   * `authenticationType: none` olarak **en üstte** yer almalıdır.
2. **2. Sıra (Korumalı Onaycı Rotaları):**
   * `/supplier-approvals/**` statik dosyaları
   * `/odata/v4/approval/**` (Başvuru listesi, detaylar, onay/red/AI action uçları)
   * `authenticationType: xsuaa` ve `scope: Approval` denetimiyle **alt sırada** yer almalıdır.

> [!WARNING]
> Eğer rota sıralamasında korumalı uçlar veya genel bir `.*` rotası public uçların üstüne yazılırsa, dış tedarikçiler BTP login duvarına takılır ve kayıt olamaz. Tam tersi durumda ise onay paneli herkese açık hale gelir. Sıralama hayati önem taşır.

---

## 6. Yapay Zeka (AI) ve BTP Destination Mimarisi

* **Destination Adı:** `gemini`
* **Mimarisi:**
  * Backend, AI çağrısı yaparken harici Google API endpoint'ini ve API anahtarını doğrudan kod içerisinde barındırmaz.
  * SAP BTP Cockpit üzerinde tanımlı `gemini` adlı HTTP Destination servisi kullanılır.
  * API anahtarı Destination konfigürasyonundaki `URL.headers.x-goog-api-key` başlığında güvenli şekilde tutulur.
  * CAP backend servisi, `cds.connect.to('gemini')` üzerinden BTP Destination servisiyle el sıkışır ve isteği yönlendirir.
* **İş Kapsamı:** AI yalnızca PDF belgesinin metnini tarar; kurumsal bir geçerlilik/bitiş tarihi (expiry date) arar. Sonucu OData Action yanıtı olarak Approver ekranına döndürür.

---

## 7. Fiori Launchpad Sandbox Mimarisi

* Fiori kabuğu (mavi bar, header, kullanıcı profili, kutucuklar) sıfırdan custom HTML/CSS ile çizilmez.
* Standart SAP Fiori Sandbox altyapısı kullanılır:
  * **`app/index.html`:** SAP ushell sandbox kütüphanesini (`sap.ushell_abap`) başlatır.
  * **`app/appconfig/fioriSandboxConfig.json`:** Launchpad üzerindeki iki tile'ın tanımlarını (başlık, ikon, alt başlık) ve hedef çözümlemelerini (inbound semantic navigation: `SupplierPortal-display` ve `SupplierApprovals-manage`) belirler.
* Launchpad header'ında XSUAA üzerinden gelen gerçek BTP kullanıcısının profil bilgileri yer alır.

---

## 8. Frontend Uygulama Mimarisi (İki Ayrı UI5 Freestyle)

Her iki uygulama da `app` dizini altında bağımsız UI5 bileşenleri (freestyle) olarak konumlanır:

1. **`app/supplierportal`:**
   * Dış tedarikçi kayıt, giriş, form ve durum ekranlarını içeren bağımsız `Component.js` yapısı.
   * `public-service` OData uçlarını tüketir.
2. **`app/supplier-approvals`:**
   * Onay kokpiti, tablo, filtreler ve detay diyaloğunu içeren bağımsız `Component.js` yapısı.
   * `approval-service` OData uçlarını tüketir.
3. **Ortak Backend Tüketimi:** İki UI uygulaması da aynı CAP Node.js sunucusundan (`localhost:4004`) beslenir; ancak eriştikleri servis projeksiyonları ve yetki seviyeleri farklıdır.

---

## 9. Güvenlik Sınırları ve Ayrımı

| Güvenlik Alanı | Tedarikçi Tarafı (Supplier) | Onaycı Tarafı (Approver) |
| :--- | :--- | :--- |
| **Kullanıcı Türü** | Harici Müşteri / Paydaş | İç Kurum Çalışanı / Yönetici |
| **Kimlik Kaynağı** | Veritabanı (`Suppliers` tablosu) | SAP BTP Identity Provider (XSUAA) |
| **Parola Saklama** | `bcryptjs` hash | SAP Cloud Identity Authentication |
| **Yetki Kontrolü** | Public (`authenticationType: none`) | `@requires: 'Approval'` (`xsuaa`) |
| **Erişilen Rotalar** | `/supplierportal`, `/odata/v4/public` | `/supplier-approvals`, `/odata/v4/approval` |

---

## 10. Uçtan Uca Veri Akışı (Data Flow)

```
1. Tedarikçi Kayıt/Giriş Yapar  ──>  Veritabanında hesap doğrulanır / oluşturulur.
2. Form & PDF Gönderilir        ──>  CAP Backend'e POST isteği gider.
                                     - Dosya LargeBinary olarak kaydedilir.
                                     - Başvuru statüsü 'Pending' olur.
3. Onaycı Listeyi Açar          ──>  CAP Backend 'Pending' kayıtları döner.
4. Onaycı Detayı İnceler        ──>  PDF önizlenir, gerekirse AI analizi tetiklenir.
5. Karar Verilir:
   - ONAY:                       ──>  Status = 'Approved'
   - RED:                        ──>  Status = 'Rejected', RejectionReason & EditableFields kaydedilir.
6. Tedarikçi Ekranı Güncellenir ──>  Tedarikçi durumu anlık görür.
                                     - Onaylandı ise yeşil sonuç.
                                     - Reddedildi ise gerekçe + sadece izin verilen alanlarla form açılır.
```

---
*Bu mimari doküman, projenin tüm bileşenlerinin birbiriyle nasıl konuşacağını, yetki sınırlarını ve veri akışını netleştiren ana teknik tasarımdır.*
