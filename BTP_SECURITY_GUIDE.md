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

## 7. Approuter Rota Yapılandırması (`xs-app.json`) ve Rota Sıralaması

`xs-app.json`, Approuter'ın gelen URL isteklerini nasıl karşılayacağını ve kimlik doğrulama tipini belirler.

### İki Temel Kimlik Doğrulama Tipi:
* **`authenticationType: none`:** Herkese açık rotalardır. BTP girişi istemez.
* **`authenticationType: xsuaa`:** Korumalı rotalardır. XSUAA oturumu ve yetki kapsamı (`scope`) doğrulaması zorunludur.

### Rota Sıralamasının Hayati Önemi (Top-Down Matching):
> [!WARNING]
> **Kritik Rota Kuralı:**
> `xs-app.json` dosyası rotaları **yukarıdan aşağıya sırayla** (top-down regex) değerlendirir. İlk eşleşen kural işletilir ve arama durur. Sıralama hatası yapılırsa sistem güvenliği tamamen çöker.

```
İstek Gelir
    │
    ▼
[ Kural 1: /supplierportal/** ] ──> Eşleşti mi? ──(EVET)──> authenticationType: none (AÇIK)
    │ (HAYIR)
    ▼
[ Kural 2: /odata/v4/public/** ] ──> Eşleşti mi? ──(EVET)──> authenticationType: none (AÇIK)
    │ (HAYIR)
    ▼
[ Kural 3: /supplier-approvals/** ] ──> Eşleşti mi? ──(EVET)──> authenticationType: xsuaa + Approval (KORUMALI)
    │ (HAYIR)
    ▼
[ Kural 4: /odata/v4/approval/** ] ──> Eşleşti mi? ──(EVET)──> authenticationType: xsuaa + Approval (KORUMALI)
    │ (HAYIR)
    ▼
[ Kural 5: Diğer Tüm İstekler / Shell ] ──> Varsayılan Launchpad Kuralları
```

* **Hatalı Sıralama Riski 1:** Eğer korumalı genel bir kural (örn. `/(.*)`) en üste yazılırsa, dış tedarikçiler BTP login duvarına çarpar; kayıt olamaz ve başvuru yapamaz.
* **Hatalı Sıralama Riski 2:** Eğer çok geniş bir `none` kuralı en üste yazılırsa, `supplier-approvals` yönetim paneli ve onay servisleri yetkisiz herkese açık hale gelir.

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
*Bu rehber, projenin güvenlik sınırlarını ve BTP entegrasyon kurallarını kesinleştiren temel referans dokümandır.*
