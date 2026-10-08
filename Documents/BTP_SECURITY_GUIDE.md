# SAP BTP XSUAA ve Rol Güvenlik Mimarisi Rehberi

Bu doküman, **CodeUp Supplier Management (Tedarikçi Onboarding & Onay)** projesindeki SAP BTP güvenlik mimarisini, XSUAA kimlik doğrulama mekanizmasını, Approuter rota korumasını, CAP rol bazlı yetkilendirme (RBAC) modelini ve dış servis entegrasyonu güvenlik standartlarını tanımlayan ana teknik rehberdir.

---

## 1. Güvenlik Mimarisinin Amacı

Kurumsal uygulamalarda dış dünyadan gelen kullanıcılar (tedarikçiler) ile kurum içi yetkililerin (onaylayıcılar) aynı sistem üzerinde güvenli bir şekilde çalışabilmesi gerekir. Bu projedeki güvenlik mimarisinin temel amaçları:
* Dış paydaşların (tedarikçilerin) kurumsal iç verilere ve yönetim paneline erişimini kesin olarak engellemek.
* Kurum içi onay yetkililerinin kimliklerini kurumsal standartlarda (SAP BTP Identity Authentication) doğrulamak.
* Başvuru onaylama, reddetme ve yapay zekâ analiz aksiyonlarını yalnızca yetkilendirilmiş kullanıcılara açmak.
* Katmanlı savunma (Defense-in-Depth) prensibiyle, istemci (frontend), ağ yönlendirme (Approuter) ve iş mantığı (CAP backend) seviyelerinde bağımsız güvenlik katmanları oluşturmaktır.

---

## 2. Authentication ve Authorization Ayrımı

Projede güvenlik iki temel kavram üzerine inşa edilmiştir:

| Kavram | Tanım | Projedeki Karşılığı |
| :--- | :--- | :--- |
| **Authentication (Kimlik Doğrulama)** | *"Kullanıcı kim?"* sorusunun cevabıdır. Kullanıcının iddia ettiği kişi olup olmadığını doğrular. | SAP BTP Identity Provider (IAS) / XSUAA oturumu veya tedarikçinin e-posta ve şifre ile giriş yapması. |
| **Authorization (Yetkilendirme)** | *"Kullanıcı ne yapmaya yetkili?"* sorusunun cevabıdır. Doğrulanmış kullanıcının hangi kaynaklara erişebileceğini belirler. | Kullanıcının BTP üzerinde **`codeup Approval`** rol koleksiyonuna sahip olup olmadığının denetlenmesi. |

> [!IMPORTANT]
> Bir kullanıcının BTP hesabına başarılı bir şekilde oturum açmış olması (Authenticated), onun yönetim paneline girebileceği anlamına **gelmez**. Kullanıcının ayrıca **`Approval` yetkisine (Authorization)** sahip olması zorunludur.

---

## 3. XSUAA Servisinin Projedeki Görevi

**XSUAA (SAP BTP Extended Services for User Account and Authentication)**, Cloud Foundry ortamında OAuth 2.0 tabanlı kimlik doğrulama ve yetki dağıtımını yöneten çekirdek güvenlik servisidir.

* **Token Dağıtımı:** Kullanıcı BTP Identity Provider üzerinden oturum açtığında, XSUAA kullanıcı bilgilerini ve atanmış rolleri içeren bir **JWT (JSON Web Token)** üretir.
* **Scope Taşıma:** Kullanıcının hangi yetkilere sahip olduğu bilgisi (örn. `Approval` scope) bu token içerisinde taşınır.
* **Merkezi Güvenlik:** CAP backend ve Approuter, gelen her istekteki JWT'yi doğrulayarak kullanıcının yetkisini XSUAA üzerinden teyit eder.

---

## 4. Approuter'ın Güvenlikteki Rolü

Port **`5000`** üzerinde çalışan **Approuter (`@sap/approuter`)**, sistemin tek dış giriş kapısı ve güvenlik ters proxy'sidir (Reverse Proxy).

* Kullanıcının doğrudan CAP backend'e (`:4004`) erişmesini engeller.
* İstemciden gelen her isteği yakalar ve üzerinde tanımlı rota kurallarına (`xs-app.json`) göre inceler.
* Korumalı bir rotaya istek geldiğinde oturum kontrolü yapar; oturum yoksa kullanıcıyı XSUAA giriş ekranına yönlendirir.
* Oturum açılmışsa, XSUAA'dan aldığı JWT token'ı isteğin `Authorization: Bearer <token>` başlığına ekleyerek CAP backend'e iletir.

---

## 5. `xs-security.json` Dosyası ve Güvenlik Tanımları

`xs-security.json`, SAP BTP'ye projenin hangi yetki sınırlarına (Scope) ve rol şablonlarına (Role Template) sahip olduğunu bildiren deklaratif güvenlik bildirim dosyasıdır.

Bu projede tek bir kurumsal yetki tanımlanır: **Approval**.

```json
{
  "xsappname": "codeup-supplier-management",
  "tenant-mode": "dedicated",
  "description": "Security configuration for CodeUp Supplier Management",
  "scopes": [
    {
      "name": "$XSAPPNAME.Approval",
      "description": "Tedarikçi başvurularını inceleme ve onaylama yetkisi"
    }
  ],
  "role-templates": [
    {
      "name": "Approval",
      "description": "Supplier Approvals yönetim rolü",
      "scope-references": [
        "$XSAPPNAME.Approval"
      ]
    }
  ],
  "role-collections": [
    {
      "name": "codeup Approval",
      "description": "Supplier Management onay yetkilisi rol koleksiyonu",
      "role-template-references": [
        "$XSAPPNAME.Approval"
      ]
    }
  ]
}
```

### Güvenlik Hiyerarşisi:
1. **Scope (`Approval`):** Sistemin en atomik izin birimidir (*"Bu aksiyonu yapabilir"* izni).
2. **Role Template (`Approval`):** Bir veya daha fazla scope'u bir araya getiren BTP rol şablonudur.
3. **Role Collection (`codeup Approval`):** BTP Cockpit üzerinde son kullanıcılara doğrudan atanabilen rol grubudur.

---

## 6. BTP Cockpit Üzerinden Manuel Rol Atama Prosedürü

XSUAA servisi oluşturulup `xs-security.json` dosyası BTP'ye tanıtıldıktan sonra, bir kullanıcının onaycı olabilmesi için şu adımlar manuel olarak uygulanır:

1. **BTP Cockpit'e Giriş:** İlgili Subaccount'a gidilir.
2. **Kullanıcı Menüsü:** Sol gezinti panelinden **Security** $\rightarrow$ **Users** sekmesine tıklanır.
3. **Kullanıcı Seçimi:** Listeden yetkilendirilecek kullanıcının e-posta adresine tıklanır.
4. **Rol Koleksiyonu Ekleme:** Sağ tarafta açılan panelden **Assign Role Collection** butonuna basılır.
5. **Rolü İşaretleme:** Listede beliren **`codeup Approval`** rol koleksiyonu seçilir ve **Assign** denilerek kaydedilir.

Bu işlem tamamlandığında kullanıcının bir sonraki oturumunda alacağı JWT token'a `Approval` scope'u işlenir ve kullanıcı onay paneline erişebilir hale gelir.

---

## 7. Approuter Rota Mimarisi Tasarımı ve Güvenlik Öncelik Sıralaması (Adım 3.4)

Port **`5000`** üzerinde çalışan **`@sap/approuter`**, sistemin tek dış giriş kapısı (Reverse Proxy) olarak tüm web ve API trafiğini karşılar. Approuter'ın yönlendirme ve güvenlik denetimi kuralları `xs-app.json` dosyası üzerinden deklaratif olarak yönetilir.

---

### 7.1. Detaylı Approuter Rota Tablosu (Route Architecture Table)

Aşağıdaki tablo, projedeki tüm statik arayüz kaynaklarının ve OData servis uçlarının Approuter seviyesinde nasıl yönlendirileceğini ve korunacağını tanımlar. Tablo, **yukarıdan aşağıya (top-down) işletilme önceliğine göre** kesin olarak sıralanmıştır:

| Sıra | Route (Source Regex) | Amaç | Authentication | Hedef (Target/Destination) | Gerekçe ve Güvenlik Sınırı |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **1** | `^/odata/v4/public/(.*)$` | Dış Tedarikçi OData V4 Servis Uçları (`login`, `register`, `getMySubmission`, `createSubmission`, `reApplySubmission`) | `none` | `destination: srv-api`<br>`target: /odata/v4/public/$1` | Dış tedarikçiler BTP kullanıcısı değildir; API çağrıları BTP login duvarına çarpmamalıdır. Kimlik ve mülkiyet denetimi CAP katmanında tedarikçi token'ı ile yapılır. |
| **2** | `^/odata/v4/approval/(.*)$` | İç Onaycı OData V4 Servis Uçları (Başvuru havuzu, onay/red/AI aksiyonları) | `xsuaa`<br>`scope: $XSAPPNAME.Approval` | `destination: srv-api`<br>`target: /odata/v4/approval/$1` | Yalnızca `codeup Approval` rol koleksiyonuna sahip BTP kullanıcıları API uçlarına erişebilir. Token taşımayan istekler 401, yetkisiz istekler 403 ile kapıda kesilir. |
| **3** | `^/supplierportal/(.*)$` | Supplier Portal UI5 Statik Kaynakları (View, Controller, i18n, manifest) | `none` | `localDir: app/supplierportal`<br>`target: /$1` | Dış tedarikçi kayıt ve başvuru ekranlarının arayüz dosyalarıdır. Herkese açık olmalı, kimlik sormadan tarayıcıya indirilmelidir. |
| **4** | `^/supplier-approvals/(.*)$` | Supplier Approvals UI5 Statik Kaynakları (Yönetim kokpiti, tablo, diyaloglar) | `xsuaa`<br>`scope: $XSAPPNAME.Approval` | `localDir: app/supplier-approvals`<br>`target: /$1` | Onaycı paneli kaynak kodlarının ve görünüm şablonlarının yetkisiz kullanıcılara sızmasını engeller. Arayüz indirilmeden önce XSUAA login zorunludur. |
| **5** | `^/appconfig/(.*)$` | Fiori Launchpad Sandbox Yapılandırma Dosyaları (`fioriSandboxConfig.json`) | `none` | `localDir: app/appconfig`<br>`target: /$1` | Fiori sandbox ortamının kutucukları (tiles) ve navigasyon ayarlarını yükleyebilmesi için gereklidir. |
| **6** | `^/(.*)$` | Fiori Launchpad Kabuğu (`index.html`) ve Kök Dizin Fallback | `none` | `localDir: app`<br>`target: /$1` | Launchpad ana sayfasını (`index.html#Shell-home`) karşılar. En genel kural olduğu için en altta yer almalıdır. |

---

### 7.2. Regex Tasarımı ve Top-Down Eşleşme Önceliği (Specific $\rightarrow$ General)

> [!WARNING]
> **Approuter Top-Down Regex Çalışma İlkesi:**
> Approuter gelen her HTTP isteğini `routes` dizisindeki kurallarla **ilk satırdan başlayarak aşağıya doğru** karşılaştırır.
> URL ile eşleşen **İLK kural** işletilir ve sonraki kurallara asla bakılmaz.
> Bu nedenle: **Özel rotalar (Specific) en üstte, genel rotalar (General / Catch-All) en altta yer almak zorundadır.**

#### Regex Hassasiyet Kuralları:
1. **Yol Ayracı ve Bitiş Kontrolü:**
   * Rotalarda `^/supplier` gibi eksik ifadeler **asla kullanılmaz**; aksi takdirde hem `/supplierportal` hem de `/supplier-approvals` aynı kurala takılır.
   * `^/supplierportal/(.*)$` ve `^/supplier-approvals/(.*)$` şeklinde tam dizin yolu ayracı (`/`) ve parantezli yakalama grubu (`(.*)$`) kullanılır.
2. **API Rotalarının UI Rotalarından Önce Gelmesi:**
   * Backend OData istekleri (`/odata/v4/...`) statik dosya yakalayıcılarından önce tanımlanır. Böylece API trafiğinin statik dosya arayan `localDir` handler'larına düşmesi engellenir.
3. **Kök Dizin Kuralı (`^/(.*)$`) En Sonda Olmalıdır:**
   * `^/(.*)$` kuralı her şeyi yakalayan bir açgözlü (greedy) regex'tir. Eğer bu kural listenin yukarısına konulursa altındaki tüm API ve UI rotaları ezilir ve sistem çöker.

---

### 7.3. Public (`none`) vs Korumalı (`xsuaa`) Sınırları

* **Public Rota Sınırı (`authenticationType: none`):**
  * Yalnızca `/supplierportal/**` arayüz dosyaları ile `/odata/v4/public/**` tedarikçi uçlarını kapsar.
  * *Önemli Hatırlatma:* `none` ağ kapısında BTP kimlik doğrulamasının olmaması demektir. Bu rotalardaki veriler herkese açık değildir; Adım 3.3'te belirlenen **Stateless Tedarikçi Kimlik Belirteci (Supplier Token)** ve **Backend Mülkiyet Filtresi (`where supplier_ID = req.supplier.id`)** ile korunur.
* **Korumalı Rota Sınırı (`authenticationType: xsuaa`):**
  * Hem `/supplier-approvals/**` arayüzünü hem de `/odata/v4/approval/**` backend servisini kapsar.
  * Çift yönlü kilit: Yetkisiz bir kullanıcı ne onay kokpitinin HTML/JS dosyalarını tarayıcısına indirebilir ne de doğrudan OData servisinden veri çekebilir.
  * Her iki rota da doğrudan `$XSAPPNAME.Approval` scope denetimine bağlıdır.

---

### 7.4. Supplier Custom Auth ile BTP XSUAA'nın Ayrımı

İki bağımsız kimlik ve yetkilendirme modeli Approuter seviyesinde birbirine asla karışmaz:

```
                          [ İstemci İsteği (:5000) ]
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼ (Public Rota)                           ▼ (Korumalı Rota)
        [/odata/v4/public/**]                    [/odata/v4/approval/**]
                 │                                         │
       [authenticationType: none]                [authenticationType: xsuaa]
                 │                                         │
                 │ (Proxy: Custom Token İletilir)          │ (XSUAA Login & Scope: Approval)
                 ▼                                         ▼
      [CAP: PublicService]                      [CAP: ApprovalService]
     (req.supplier.id Denetimi)                (@requires: 'Approval' Kalkanı)
```

* **Header Çakışması Yoktur:** `/odata/v4/approval/**` rotasında Approuter XSUAA JWT token'ını `Authorization: Bearer` olarak backend'e taşır. `/odata/v4/public/**` rotasında ise Approuter BTP doğrulaması yapmaz; istemcinin gönderdiği tedarikçi oturum başlığını doğrudan CAP backend'e iletir.
* **Trafik İzolasyonu:** Tedarikçi ve onaycı istekleri URL seviyesinde (`public` vs `approval`) ayrışır.

---

### 7.5. Fiori Launchpad Sandbox Shell Etkileşimi

* Roadmap Faz 7 kapsamında `app/index.html` ve `app/appconfig/fioriSandboxConfig.json` kullanılarak yerel bir Fiori Launchpad sandbox kabuğu oluşturulacaktır.
* **Kabuk Erişimi (`/index.html`):** Rota 6 altında `authenticationType: none` ile sunulur. Böylece Launchpad kabuğu açılırken gereksiz oturum engelleri oluşmaz.
* **Tile Davranışı:**
  * **Supplier Portal Tile:** Tıklandığında `/supplierportal/` açılır; dış tedarikçi login ve başvuru süreci serbestçe başlar.
  * **Supplier Approvals Tile:** Tıklandığında `/supplier-approvals/` rotasına gidilir; bu rota Rota 4 ile kilitli olduğundan kullanıcı anında BTP XSUAA giriş ekranına yönlendirilir ve `Approval` rolü aranır.

---

### 7.6. Rota Çakışması (Route Conflict) ve Güvenlik Zafiyeti Analizi

| Olası Hatalı Yapılandırma | Güvenlik / Sistem Riski | Doğru Mimari Önlem |
| :--- | :--- | :--- |
| Korumalı genel bir kuralın (`^/(.*)$` - `xsuaa`) en üste yazılması | Dış tedarikçiler BTP login duvarına çarpar; `/supplierportal` ve `/odata/v4/public` uçlarına erişemez, kayıt/başvuru çöker. | Genel kök kuralı daima listenin **en sonuna** (Rota 6) yazılmalıdır. |
| Genel bir backend kuralının (`^/odata/(.*)$` - `none`) onay rotasının üstüne yazılması | Tüm onay servisleri (`/odata/v4/approval`) ağ düzeyinde korumasız kalır; Approuter XSUAA denetimini atlar. | Spesifik alt servis rotaları (`/odata/v4/public` ve `/odata/v4/approval`) bağımsız ve açık regex'lerle en üstte tanımlanmalıdır. |
| Yetersiz regex ayrımı (örn. `^/supplier.*`) | Hem `/supplierportal` hem `/supplier-approvals` aynı kurala takılır; ya onay paneli halka açılır ya tedarikçi portalı kilitlenir. | Rotalar `/supplierportal/(.*)$` ve `/supplier-approvals/(.*)$` şeklinde dizin sınırları ile kesinleştirilmelidir. |
| Yalnızca UI'ı koruyup Backend API'yi unutmak | Akıllı bir kullanıcı arayüzü atlayıp doğrudan `/odata/v4/approval` API'sine Postman/cURL ile istek atabilir. | Hem UI (`/supplier-approvals/**`) hem de API (`/odata/v4/approval/**`) Approuter seviyesinde `xsuaa` + `Approval` ile kilitlenmiştir. |

---

## 8. CAP Seviyesinde Rol Bazlı Yetkilendirme (RBAC) ve Servis Güvenlik Sınırları (Adım 3.1)

Approuter ilk ağ kapısı ve ters proxy hattıdır; ancak tek başına yeterli değildir. İkinci ve asıl veri koruma hattı CAP backend katmanıdır. CAP seviyesinde yetkilendirme; iki ayrı servis sınırı (`PublicService` ve `ApprovalService`), rol bazlı deklaratif anotasyonlar (`@requires` / `@restrict`) ve backend iş mantığında zorunlu kılınan veri mülkiyeti izolasyonu (Supplier Ownership) ile sağlanır.

### 8.1. İki Güvenlik Alanı ve Domain Sınırları

Veri modelimizdeki `Suppliers` ve `Submissions` varlıkları (bakınız: [`db/schema.cds`](file:///c:/Projects/CodeUp-CaseStudy/db/schema.cds)), iki tamamen farklı kullanıcı kitlesine ve güvenlik etki alanına (security domain) hitap eder:

1. **Dış Tedarikçi Alanı (External Supplier Domain):**
   * **Aktör:** Kurum dışındaki bağımsız tedarikçi adayları.
   * **Kimlik Doğrulama:** SAP BTP XSUAA kullanıcısı **değildir**. Kimlikleri doğrudan veritabanındaki `Suppliers` tablosunda saklanan e-posta ve `bcryptjs` ile hash'lenmiş parola üzerinden doğrulanır.
   * **Yetki Kapsamı:** Tedarikçi yalnızca kendi hesabını yönetebilir, yalnızca kendi başvurusunu oluşturabilir, kendi başvurusunun durumunu/sürecini takip edebilir ve reddedilmişse yalnızca izin verilen alanları güncelleyebilir.
   * **Temel Kısıt:** Bir tedarikçi, başka bir tedarikçinin varlığından veya başvuru detaylarından kesinlikle haberdar olamaz (`Supplier A` $\not\to$ `Supplier B`).

2. **İç Onaycı Alanı (Internal Approver Domain):**
   * **Aktör:** Kurum içindeki satınalma/onay yöneticileri.
   * **Kimlik Doğrulama:** SAP BTP XSUAA üzerinden kimliği doğrulanmış kurumsal kullanıcılar.
   * **Yetki Kapsamı:** Kurumsal onay havuzundaki tüm tedarikçi başvurularını listeleyebilir, arayabilir, filtreleyebilir, detaylarını ve PDF sertifikalarını inceleyebilir; başvuruyu onaylayabilir (`approve`), gerekçe ve alan seçimi belirterek reddedebilir (`reject`) ve Gemini AI sertifika analizi (`analyzeCertificate`) çalıştırabilir.

---

### 8.2. Servis Sınırları: `PublicService` vs `ApprovalService`

Bu iki farklı güvenlik alanı mimaride iki ayrı CAP OData V4 servisi olarak izole edilir:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CAP Backend (localhost:4004)                             │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│         PublicService (/odata/v4/public)  │     ApprovalService (/odata/v4/approval)   │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • Ağ Seviyesi: authenticationType: none   │ • Ağ Seviyesi: authenticationType: xsuaa   │
│ • Servis Seviyesi: Public/Açık            │ • Servis Seviyesi: @requires: 'Approval'   │
│ • Güvenlik Modeli: Supplier Ownership    │ • Güvenlik Modeli: BTP XSUAA RBAC          │
│ • Kapsam:                                 │ • Kapsam:                                  │
│   - register (Action)                     │   - Submissions (Tüm Başvuruları Okuma)    │
│   - login (Action)                        │   - approve (Action)                       │
│   - getMySubmission (Function/Action)     │   - reject (Action)                        │
│   - createSubmission (Action)             │   - analyzeCertificate (AI Action)         │
│   - reApplySubmission (Action)            │                                            │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

#### A. `PublicService` Sınırı ve "Public" Yanılgısı
* **Yol (Path):** `/odata/v4/public`
* **Ağ Seviyesi:** Dış tedarikçilerin BTP hesabına sahip olmaması sebebiyle Approuter üzerinde `authenticationType: none` olarak işaretlenir.
* > [!CAUTION]
  > **Kritik İlke — Public $\neq$ Herkese Açık Veri:**
  > Bir servisin ağ kapısında `none` veya genel erişime açık olması, o servisteki tüm verilerin herkes tarafından sorgulanabileceği anlamına **kesinlikle gelmez**.
  > `PublicService` uçlarında tedarikçilerin tüm başvuruları tarayabileceği kontrolsüz bir OData entityseti (`SELECT * FROM Submissions`) **kesinlikle dışarıya ifşa edilmez**.
  > Başvuru okuma ve güncelleme işlemleri yalnızca oturum açmış tedarikçinin doğrulanmış kimliği ile kısıtlanan kontrollü operasyonlar (`getMySubmission`, `createSubmission`, `reApplySubmission`) üzerinden sunulur.

#### B. `ApprovalService` Sınırı
* **Yol (Path):** `/odata/v4/approval`
* **Ağ Seviyesi:** Approuter üzerinde `authenticationType: xsuaa` ve `scope: Approval` denetimi.
* **CAP Seviyesi:** Servis tanımında kökten deklaratif anotasyon:
  ```cds
  service ApprovalService @(requires: 'Approval') { ... }
  ```
* **Kapsam:** BTP kullanıcısı oturum açmış olsa bile token'ında `Approval` scope'u (BTP Cockpit'teki `codeup Approval` rol koleksiyonu) bulunmuyorsa, CAP backend tüm istekleri anında **`403 Forbidden`** hatasıyla keser.

---

### 8.3. Kapsamlı Erişim Matrisi (Access Matrix)

Aşağıdaki matris, sistemdeki tüm aktörlerin hangi kaynak ve işlemlere erişebileceğini kesin olarak tanımlar:

| Kaynak / İşlem | Unauthenticated (Giriş Yapmamış) | Authenticated Supplier (Giriş Yapmış Tedarikçi) | Authenticated User (Approval Rolü Olmayan) | Approver (`Approval` Rolüne Sahip) |
| :--- | :--- | :--- | :--- | :--- |
| **Kayıt Olma (`register`)** | ✅ İzin Var (200/201) | ⚠️ Gereksiz (Zaten Kayıtlı) | ❌ İzin Yok | ❌ İzin Yok |
| **Giriş Yapma (`login`)** | ✅ İzin Var (200) | ✅ İzin Var | ❌ İzin Yok | ❌ İzin Yok |
| **Kendi Başvurusunu Okuma (`getMySubmission`)** | ❌ 401 Unauthorized | ✅ İzin Var (Kendi Verisi) | ❌ İzin Yok | ❌ Kendi tedarikçi hesabı yoksa N/A |
| **Kendi Başvurusunu Oluşturma (`createSubmission`)** | ❌ 401 Unauthorized | ✅ İzin Var (İlk başvuru için) | ❌ İzin Yok | ❌ İzin Yok |
| **Kendi Başvurusunu Güncelleme (`reApplySubmission`)** | ❌ 401 Unauthorized | 🔶 Koşullu (Yalnızca `Rejected` ise ve onaycının izin verdiği alanlar) | ❌ İzin Yok | ❌ İzin Yok |
| **Başka Tedarikçinin Başvurusunu Okuma/Değiştirme** | ⛔ **KESİNLİKLE YASAK (403/Denied)** | ⛔ **KESİNLİKLE YASAK (403/Denied)** | ⛔ **KESİNLİKLE YASAK (403/Denied)** | ⛔ **YASAK (Onaycı bile doğrudan başvuru sahibinin yerine veri değiştiremez)** |
| **Tüm Başvuruları Listeleme / Arama** | ❌ 401 / 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ✅ İzin Var (Tüm havuz) |
| **Başvuru Detayı ve PDF İnceleme** | ❌ 401 / 403 Forbidden | ❌ Başkası için 403 | ❌ 403 Forbidden | ✅ İzin Var |
| **Başvuru Onaylama (`approve`)** | ❌ 401 / 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ✅ İzin Var |
| **Başvuru Reddetme (`reject`)** | ❌ 401 / 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ✅ İzin Var |
| **AI Sertifika Analizi (`analyzeCertificate`)** | ❌ 401 / 403 Forbidden | ❌ 403 Forbidden | ❌ 403 Forbidden | ✅ İzin Var (Destination üzerinden) |

> [!IMPORTANT]
> **Kritik İzolasyon Kuralı:**
> `Supplier A` $\not\to$ `Supplier B'nin Başvurusu`:
> Tedarikçi A, API parametresine başka bir başvuru ID'si yazsa, doğrudan URL'ye sorgu atsa veya veri tabanını taramaya çalışsa dahi `Supplier B`'nin başvurusuna **kesinlikle erişemez ve güncelleyemez**.

---

### 8.4. `@requires` ve `@restrict` Ayrımı ve Tasarım Kararı

CAP modelinde yetkilendirme iki ana anotasyon ile sağlanır. Bu projede bunların rolleri şu şekilde belirlenmiştir:

| Özellik | `@requires` | `@restrict` |
| :--- | :--- | :--- |
| **Kapsam Düzeyi** | Kaba taneli (Coarse-grained): Servis veya Action geneli | İnce taneli (Fine-grained): Varlık (Entity) ve Olay (READ, CREATE, UPDATE, DELETE) bazlı |
| **Kullanım Amacı** | *"Bu servise/aksiyona kim girebilir?"* sorusunu yanıtlar. Kullanıcının belirli bir role/scope'a sahip olup olmadığını sorgular. | *"Bu tabloda kim, hangi şartla (where), hangi işlemi (grant) yapabilir?"* sorusunu yanıtlar. |
| **Projedeki Rolü** | **`ApprovalService`'in tamamında kök düzeyde kullanılır:**<br>`@(requires: 'Approval')` | Gelecekte servis içi varlık projeksiyonlarında operasyon kısıtı (örn. `grant: ['READ'], to: 'Approval'`) gerekirse kullanılır. |

#### Deklaratif Tasarım Kararı:
1. **`ApprovalService` İçin `@requires: 'Approval'`:**
   * Tüm iç onay servisinin köküne `@requires: 'Approval'` konulur. Bu kural, XSUAA JWT token doğrulamasıyla doğrudan eşleşir. `Approval` scope'u taşımayan her istek anında servis girişinde engellenir.
2. **`PublicService` İçin Durum:**
   * Dış tedarikçiler BTP kullanıcısı olmadığı için XSUAA tabanlı `@requires` doğrudan `PublicService` üzerinde işletilemez (bu servise XSUAA rolü zorunluluğu konulursa tedarikçiler erişemez).
   * Dolayısıyla `PublicService` üzerindeki veri güvenliği deklaratif BTP rolü ile değil, **aşağıda açıklanan Tedarikçi Veri Sahipliği (Supplier Ownership) mimarisiyle** garanti edilir.
   * *Not:* Bu tasarım kararlarının kesin CDS sözdizimi ve handler detayları, Faz 4 backend implementasyonunda canlı testlerle doğrulanacaktır.

---

### 8.5. Tedarikçi Veri Sahipliği ve Mülkiyet İzolasyonu (Supplier Ownership Isolation)

`@requires: 'Approval'` anotasyonu yalnızca iç onaycı alanını korur. Dış tedarikçilerin birbirlerinin verisine erişmesini engellemek için şu 4 boyutlu veri sahipliği mimarisi uygulanır:

1. **Uygulanacağı Katman:**
   * **CAP Service / Custom Handler Katmanı (`srv/public-service.js`).**
   * Güvenlik kontrolü arayüze veya URL parametrelerine bırakılamaz; doğrudan backend handler katmanında zorunlu kılınır.

2. **Kullanılacak Kimlik Bilgisi:**
   * Tedarikçi `login` action'ı ile oturum açtığında, backend tarafından doğrulanmış bir **tedarikçi oturum bağlamı / oturum belirteci (session token)** üretilir.
   * Bu belirteç güvenli bir şekilde `supplier.id` bilgisini taşır. İstemci sonraki her istekte bu oturum bilgisini iletir.
   * Tedarikçinin gönderdiği hiçbir parametreye güvenilmez; kimlik bilgisi daima doğrulanmış oturum bağlamından (`req.supplier.id`) okunur.

3. **Filtreleme ve Yetki Mantığı:**
   * **Okuma (`getMySubmission`):** Tedarikçi bir ID parametresi vererek başvuru arayamaz. Backend doğrudan `SELECT FROM Submissions WHERE supplier_ID = req.supplier.id` sorgusu çalıştırır. Tedarikçinin başka bir kaydı görmesi matematiksel olarak imkansızdır.
   * **Yeni Başvuru (`createSubmission`):** Form gönderildiğinde `supplier_ID` alanı istemciden gelen JSON gövdesinden değil, backend oturumundan (`req.supplier.id`) zorunlu olarak atanır. Tedarikçi başkası adına kayıt oluşturamaz.
   * **Yeniden Başvuru (`reApplySubmission`):** Güncellenmek istenen başvuru kaydının veritabanındaki `supplier_ID` değeri ile oturumdaki `req.supplier.id` eşleşiyor mu kontrol edilir. Eşleşmiyorsa işlem derhal iptal edilir (`403 Forbidden`). Eşleşiyorsa yalnızca onaycının izin verdiği `editableFields` alanlarının güncellenmesine izin verilir.

4. **Servis Sınırındaki Konumu:**
   * Bu mülkiyet mantığı **`PublicService`** sınırında işletilir.
   * `ApprovalService` ise tüm başvuruları görme yetkisine sahip tek merkezdir ve zaten XSUAA `Approval` rolüyle kilitlenmiştir.

---

## 9. Katmanlı Güvenlik (Defense-in-Depth): Frontend vs. Backend

> [!CAUTION]
> **Güvenlik Asla Frontend'e Bırakılamaz:**
> Kullanıcı arayüzünde (UI) bir butonu gizlemek (`visible="false"`), bir alanı kilitlemek (`editable="false"`) veya menüyü göstermemek bir **güvenlik önlemi DEĞİLDİR**, yalnızca kullanıcı deneyimidir (UX).

* Akıllı bir kullanıcı tarayıcının geliştirici araçlarını (DevTools), Postman'i veya cURL komutlarını kullanarak arayüz kısıtlarını kolayca aşabilir ve doğrudan backend API'lerine istek atabilir.
* Bu nedenle:
  1. **Frontend:** Kullanıcıya rehberlik eder, izin verilmeyen alanları grileştirir, formatları doğrular.
  2. **Approuter:** Yetkisiz HTTP isteklerini kapıda karşılayıp 401 Unauthorized / 403 Forbidden döner.
  3. **CAP Backend:** Gelen JWT token'ı doğrular, veritabanı işlemlerini izole eder ve `@requires` kontrollerini işleterek veri bütünlüğünü kesin olarak garanti eder.

---

## 10. Local Hybrid XSUAA Çalışma Modeli ve `cds bind`

Uygulama cloud'a deploy edilmeyecek, yerel geliştirme ortamında (localhost) çalıştırılacaktır. Ancak güvenlik denetimleri sahte (mock) değil, **gerçek BTP XSUAA servisi** üzerinden yapılacaktır.

### Hibrit Model Nasıl Çalışır?
1. BTP üzerinde bir XSUAA servis örneği (`instance`) ve Service Key oluşturulur.
2. Terminalden `cds bind --to <xsuaa-instance-name>` komutu çalıştırılır.
3. Bu komut, BTP'deki gerçek XSUAA kimlik bilgilerini (clientid, clientsecret, url) yerel projede `.cdsrc-private.json` dosyasına bağlar (bağlantı konfigürasyonu).
4. Localde koşan CAP backend (`:4004`) ve Approuter (`:5000`), gelen token'ları doğrudan BTP üzerindeki gerçek XSUAA servisine sorarak doğrular.
5. Böylece geliştirici yerel ortamında sıfır maliyetle, gerçek bulut güvenlik mekanizmasını test edebilir.

---

## 11. AI ve BTP Destination Güvenliği

* **Tehdit:** AI API anahtarlarının (Gemini API Key) kaynak kodda, Git repolarında veya `.env` dosyalarında düz metin olarak tutulması ciddi bir güvenlik zafiyetidir.
* **Projedeki Güvenlik Standardı:**
  * Gemini API anahtarı hiçbir şekilde kaynak kod içerisine yazılmaz.
  * SAP BTP Cockpit üzerinde **`gemini`** adında bir HTTP Destination oluşturulmuştur.
  * API anahtarı bu Destination'ın `URL.headers.x-goog-api-key` başlığı içine güvenli bir şekilde gömülmüştür.
  * CAP backend servisi dış dünyadaki Google endpoint'ini bilmez; yalnızca BTP üzerindeki bu Destination'ın adını (`gemini`) çağırır:
    ```javascript
    const geminiService = await cds.connect.to('gemini');
    ```
  * Böylece API anahtarı bulut altyapısında izole kalır, repoya sızmaz ve yetkisiz erişimlere karşı korunur.

---

## 12. Sık Yapılabilecek Güvenlik Hataları (Risk Matrisi)

| Hata | Olası Sonuç | Doğru Yaklaşım |
| :--- | :--- | :--- |
| `xs-app.json` içinde regex sıralama hatası | Tedarikçilerin sisteme kayıt olamaması veya onay panelinin herkese açılması. | Public rotalar en üste, korumalı rotalar alta yazılmalıdır. |
| Yalnızca Approuter korumasına güvenmek (CAP anotasyonlarını unutmak) | Approuter bypass edilirse backend'in tamamen savunmasız kalması. | Hem Approuter hem CAP seviyesinde `@requires: 'Approval'` kullanılmalıdır. |
| Parolaları veritabanında düz metin saklamak | Veritabanı sızıntısında tüm kullanıcı hesaplarının ele geçirilmesi. | Parolalar mutlaka `bcryptjs` ile tek yönlü hash'lenerek saklanmalıdır. |
| API anahtarını `.env` veya JS dosyasına yazmak | Anahtarın Git reposuna push'lanması ve ele geçirilmesi. | Mutlaka BTP `gemini` Destination servisi kullanılmalıdır. |
| Dosya boyutu ve format kontrolünü yalnızca UI'da yapmak | Kötü niyetli kullanıcıların sunucuya zararlı script veya devasa dosyalar yüklemesi. | Dosya kontrolü (yalnızca PDF ve $\le$ 10 MB) hem UI'da hem CAP streaming katmanında yapılmalıdır. |

---

## 13. Bu Projede Tavizsiz Uygulanacak Güvenlik Kuralları Özeti

1. **Public/Korumalı Alan Ayrımı:** Tedarikçi işlemleri (kayıt, giriş, başvuru) herkese açık olabilir; ancak Supplier Approvals uygulaması ve tüm onay/red/AI aksiyonları **yalnızca XSUAA ile doğrulanmış ve `Approval` rolüne sahip** kullanıcılara açıktır.
2. **Koleksiyon Adı:** BTP üzerindeki rol koleksiyonunun adı şartnameye tam uygun olarak **`codeup Approval`** olacaktır.
3. **Katmanlı Doğrulama:** Zorunlu alanlar, benzersiz e-posta, dosya türü (PDF) ve boyut kısıtı (10 MB) hem frontend hem backend katmanında kontrol edilecektir.
4. **Credential Yasağı:** Kod reposunda hiçbir şifre, secret veya API anahtarı barındırılmayacaktır.
5. **Tedarikçi Mülkiyet İzolasyonu (Supplier Data Ownership):** Bir tedarikçi asla başka bir tedarikçinin başvurusunu göremez veya güncelleyemez (`Supplier A` $\not\to$ `Supplier B`). Veri sorguları backend katmanında oturumdaki tedarikçi kimliği (`supplier_ID = req.supplier.id`) ile filtrelenir.

---

## 14. Tedarikçi Kimlik, Oturum ve Mülkiyet İzolasyonu Mimarisi (Adım 3.3)

Bu bölüm, dış tedarikçilerin sisteme kaydolmasından başvuru süreçlerini tamamlamasına kadar geçen tüm yaşam döngüsünde kimlik doğrulama, oturum yönetimi ve mülkiyet izolasyonunu (`Supplier A` $\not\to$ `Supplier B`) garanti eden teknik mimari kararlarını tanımlar.

### 14.1. Üç Katmanlı Güvenlik Ayrımı (AuthN vs Session vs AuthZ)

Sistemin tedarikçi tarafındaki güvenliği birbirinden bağımsız 3 temel mekanizma üzerine inşa edilir:

1. **Authentication (Kimlik Doğrulama - "Sen kimsin?"):**
   * Tedarikçi sisteme kayıt olurken (`register`) e-posta ve şifresi alınır. Şifre, backend katmanında `bcryptjs` ile (salt rounds: 10) tek yönlü olarak hash'lenerek `Suppliers.passwordHash` alanına kaydedilir.
   * Giriş sırasında (`login`) girilen e-posta üzerinden veritabanından tedarikçi kaydı bulunur ve şifre `bcrypt.compare` ile doğrulanır.
2. **Session / Identity State (Oturum Durumu - "Kim olduğunu nasıl hatırlıyoruz?"):**
   * Giriş başarılı olduğunda, sunucu tarafında imzalanmış **Uygulama Düzeyinde Tedarikçi Kimlik Belirteci (Stateless Supplier Identity Token / JWT)** üretilir.
   * Bu belirteç istemciye teslim edilir ve sonraki tüm HTTP/OData isteklerinde istemci tarafından geri gönderilir.
3. **Authorization / Ownership (Mülkiyet Yetkilendirmesi - "Hangi veriye dokunabilirsin?"):**
   * Backend, gelen her isteğin başlığındaki belirteci doğrular ve içerisindeki `supplierId` bilgisini CAP istek bağlamına (`req.supplier = { id, email }`) yazar.
   * Veritabanı sorguları ve mutasyonları asla istemcinin gönderdiği parametrelere göre değil, yalnızca bu doğrulanmış `req.supplier.id` bağlamına göre işletilir.

---

### 14.2. Oturum Mekanizması Seçimi ve Mimari Değerlendirme

Mevcut CAP + Approuter (`:5000`) + SAPUI5 yapısı dikkate alınarak olası oturum mekanizmaları karşılaştırılmıştır:

| Mekanizma | Nasıl Çalışır? | Avantajları | Dezavantajları / Riskleri | Karar |
| :--- | :--- | :--- | :--- | :--- |
| **Server-Side Session (Memory/Store)** | Express-session / `connect.sid` cookie ile sunucu belleğinde veya Redis'te oturum tutulur. | Sunucu tarafında anlık iptal (invalidation) kolaydır. | Cloud Foundry / BTP ortamında birden fazla pod/instance çalıştığında session replication / Redis gerektirir; mimari karmaşıklığı ve maliyeti artırır. | ❌ Reddedildi |
| **BTP XSUAA'ya Tedarikçi Ekleme** | Dış tedarikçiler BTP Identity Provider'a (IAS) kullanıcı olarak açılır. | XSUAA standartlarını kullanır. | Case Study gereksinimlerine aykırıdır; tedarikçiler harici paydaşlardır, BTP kullanıcısı açılması kurumsal maliyet ve lisans açısından kabul edilemez. | ❌ Reddedildi |
| **Stateless İmzalı Tedarikçi Belirteci (JWT / Secure Token)** | Giriş sonrası sunucu tarafında gizli anahtarla imzalanmış, `{ supplierId, email, exp }` içeren kompakt bir belirteç üretilir. | **Stateless:** Sunucu belleği veya Redis gerektirmez. Horizontal scaling (ölçeklenme) ile %100 uyumludur. CAP Node.js mimarisine tam oturur. BTP XSUAA ile çakışmaz. | Token çalınırsa süresi dolana kadar geçerlidir (TTL makul tutularak ve HTTPS ile korunarak risk minimize edilir). | ✅ **SEÇİLDİ** |

#### Taşıma Yöntemi (Transport Layer):
* **Birincil Yaklaşım:** `Authorization: Bearer <supplierToken>` veya özel HTTP başlığı (`x-supplier-token`).
* **Alternatif / Hibrit:** `HttpOnly; SameSite=Lax; Secure` cookie (`supplier_token`).
* > [!NOTE]
  > **Implementasyon Sırasında Doğrulanacak Nokta:**
  > Approuter (`@sap/approuter`) `5000` portunda `authenticationType: none` rotalarında gelen custom `Authorization` başlıklarını veya `x-supplier-token` başlığını backend'e (`:4004`) doğrudan iletir. Faz 4 ve Faz 7 implementasyonu sırasında, UI5 OData V4 modelinin başlık ekleme davranışı ile Approuter'ın proxy başlık iletimi canlı test edilerek nihai taşıyıcı formatı (Header vs Cookie) kesinleştirilecektir.

---

### 14.3. BTP XSUAA ile Tedarikçi Kimlik Modelinin Kesin Ayrımı

Sistemde iki farklı kimlik otoritesi bulunur ve birbirlerinin alanına asla müdahale etmez:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              İKİ AYRI KİMLİK OTORİTESİ                                 │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│   Dış Tedarikçi Portalı (Supplier Portal) │   İç Onaycı Portalı (Supplier Approvals)   │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • Kimlik Deposu: db.Suppliers Tablosu     │ • Kimlik Deposu: SAP BTP Identity Provider │
│ • Parola Doğrulama: bcryptjs (Backend)    │ • Kimlik Doğrulama: BTP XSUAA (OAuth 2.0)  │
│ • Oturum: Uygulama İmzalı Supplier Token │ • Oturum: XSUAA JWT Bearer Token           │
│ • Yetki Tipi: Mülkiyet (Supplier Ownership)│ • Yetki Tipi: Rol Bazlı (@requires: 'Approval')│
│ • Servis Yolu: /odata/v4/public/**        │ • Servis Yolu: /odata/v4/approval/**       │
│ • Approuter Ayarı: authenticationType: none│ • Approuter Ayarı: authenticationType: xsuaa│
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

* Tedarikçi şifreleri asla XSUAA'ya taşınmaz; veritabanında `passwordHash` olarak korunur.
* XSUAA `Approval` rolü dış tedarikçiye atanmaz; tedarikçinin bu role ihtiyacı yoktur.

---

### 14.4. Identity $\rightarrow$ Supplier Eşleşmesi ve "İstemciye Güvenme" İlkesi

* **E-Posta Tek Başına Kimlik Olamaz:** E-posta değişken veya sorgu parametresi olarak manipüle edilebilir.
* **Kanonik Kimlik:** Sistemin değişmez kimlik anahtarı `Suppliers.ID` (UUID) alanıdır.
* **Eşleşme Süreci:**
  1. `login` action'ında e-posta ve şifre doğrulanır.
  2. Veritabanından tedarikçinin tekil `Supplier.ID`'si okunur.
  3. Token payload'ına `{ supplierId: supplier.ID, email: supplier.email }` yazılır ve imzalanır.
  4. Sonraki her istekte backend, belirtecin imzasını doğrular ve `req.supplier.id = payload.supplierId` olarak bağlamı kurar.
* > [!CAUTION]
  > **Asla İstemci Parametresine Güvenilmez:**
  > Frontend'den gelen `?supplierId=...` sorgu parametresi veya istek gövdesindeki `supplier_ID` alanı güvenlik kontrollerinde **asla dikkate alınmaz**. Veri tabanına yazılırken veya filtrelenirken yalnızca doğrulanmış oturumdaki `req.supplier.id` kullanılır.

---

### 14.5. Backend Mülkiyet İzolasyonu (Backend Ownership Enforcement)

`PublicService` üzerindeki tüm operasyonlarda backend iş mantığı seviyesinde şu kurallar tavizsiz uygulanır:

1. **Başvuru Okuma (`getMySubmission`):**
   * Tedarikçi genel bir listeleme (`GET /Submissions`) yapamaz; entity seti dışarıya kapalıdır.
   * `getMySubmission` fonksiyonu doğrudan şu CQL sorgusunu işletir:
     $$\text{SELECT ONE FROM Submissions WHERE supplier\_ID = req.supplier.id}$$
   * Sonuç: Tedarikçi yalnızca ve yalnızca kendi başvurusunu görür. Başka tedarikçinin verisine erişmesi imkansızdır.

2. **Başvuru Oluşturma (`createSubmission`):**
   * Backend önce `req.supplier.id` için önceden açılmış bir başvuru olup olmadığını kontrol eder. Varsa mükerrer başvuru engellenir.
   * Yeni başvuru oluşturulurken `supplier_ID` alanına doğrudan `req.supplier.id` enjekte edilir. İstemci başka bir tedarikçi adına kayıt oluşturamaz.

3. **Korumalı Yeniden Başvuru (`reApplySubmission`):**
   * Başvurusu reddedilen tedarikçinin düzeltme yapıp tekrar başvurması sürecinde 3 katmanlı güvenlik doğrulaması yapılır:
     1. **Mülkiyet Doğrulaması:** Güncellenmek istenen kaydın `supplier_ID` değeri ile `req.supplier.id` eşit olmalıdır. Eşit değilse `403 Forbidden`.
     2. **Durum Doğrulaması:** Başvurunun veritabanındaki güncel durumu `Rejected` olmalıdır. `Pending`, `InReview` veya `Approved` durumundaki başvurular yeniden gönderilemez (`400 Bad Request`).
     3. **Alan İzni Doğrulaması (Editable Fields Enforcement):** Onaycının reddederken belirlediği `editableFields` listesinde yer **almayan** hiçbir alanın güncellenmesine izin verilmez. İstemci kilitli bir alanı (örn. `companyName`) değiştirmeye çalışırsa backend işlemi reddeder.
   * Güncelleme başarılı olduğunda başvuru durumu `InReview` (İncelemede) olarak güncellenir.

---

### 14.6. Oturum Yaşam Döngüsü ve Logout (Çıkış)

* **Token Geçerlilik Süresi (TTL):** Tedarikçinin başvuru formunu doldurma ve dosya yükleme süresi dikkate alınarak belirteç geçerlilik süresi **8 saat** olarak yapılandırılır.
* **Logout Mantığı:**
  * İstemci tarafında depolanan belirteç silinir (`sessionStorage.removeItem` veya cookie silme).
  * Kullanıcı arayüzü anında login ekranına yönlendirilir.
  * Sunucu tarafında durum tutulmadığı için çıkış işlemi istemci tarafındaki belirtecin imhası ile güvenli ve anlık olarak tamamlanır.

---

### 14.7. Faz 4 Implementasyonu Sırasında Doğrulanacak Noktalar
1. CAP Node.js özel auth middleware'inin (`cds.context.user`) tedarikçi oturumuyla entegrasyon yöntemi.
2. Approuter'ın `:5000` portundaki `authenticationType: none` rotasında custom auth header veya cookie geçirme davranışının yerel test ortamında doğrulanması.
3. SAPUI5 OData V4 Model'inin dosya akışında (PDF streaming) belirteç başlığını iletme davranışı.

---
*Bu rehber, projenin güvenlik sınırlarını ve BTP entegrasyon kurallarını kesinleştiren temel referans dokümandır.*
