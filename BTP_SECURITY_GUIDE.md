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

## 8. CAP Seviyesinde Rol Bazlı Yetkilendirme (RBAC)

Approuter ilk güvenlik hattıdır; ancak tek başına yeterli değildir. İkinci ve asıl veri koruma hattı CAP backend katmanıdır.

### A. `@requires` Anotasyonu (Servis ve Aksiyon Düzeyi)
Bir servisin veya action'ın tamamını belirli bir role kilitlemek için kullanılır:
```cds
// Yalnızca BTP Approval rolüne sahip kullanıcılar erişebilir
service ApprovalService @(requires: 'Approval') {
  entity Submissions as projection on db.Submissions;
  action analyzeCertificate(submissionId: UUID) returns AnalysisResult;
}
```

### B. `@restrict` Anotasyonu (Varlık ve Olay Düzeyi)
Varlıklar üzerinde daha granüler (READ, WRITE, UPDATE vb.) yetki kısıtlamaları tanımlamak için kullanılır:
```cds
// Public tedarikçi servisi: Herkese açık uçlar
service PublicService {
  @restrict: [{ grant: '*', to: 'any' }]
  entity Suppliers as projection on db.Suppliers;

  @restrict: [{ grant: ['READ', 'CREATE'], to: 'any' }]
  entity Applications as projection on db.Applications;
}
```

### C. Service-Level vs. Entity/Action-Level Yetkilendirme:
* **Service-Level:** Tüm servis kökünü korur. Bir kullanıcı servise giremiyorsa içindeki hiçbir entity veya action'a erişemez. Bu projede `ApprovalService` kökten `@requires: 'Approval'` ile korunur.
* **Entity/Action-Level:** Servis içindeki özel işlemleri (örn. AI analiz action'ı) izole etmek için kullanılır.

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

---
*Bu rehber, projenin güvenlik sınırlarını ve BTP entegrasyon kurallarını kesinleştiren temel referans dokümandır.*
