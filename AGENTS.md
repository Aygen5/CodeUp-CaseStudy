# Geliştirici Ajan Kuralları ve Mimari Standartlar (AGENTS.md)

Bu doküman, **CodeUp Supplier Management (Tedarikçi Onboarding & Onay)** projesinde çalışacak tüm AI ajanları (Antigravity ve diğer modeller) için bağlayıcı temel kuralları, zihinsel modeli ve mimari sınırları tanımlar.

---

## 1. Temel Zihinsel Model (Mental Model)

Bu projede geliştirme yapılırken daima şu mimari denklem esas alınacaktır:

$$\textbf{CAP Node.js} + \textbf{SAP HANA} + \textbf{SAPUI5} + \textbf{XSUAA} + \textbf{Approuter} + \textbf{Fiori Launchpad} + \textbf{BTP Destination/Gemini}$$

---

## 2. KESİN KURAL: Hedef Veritabanı SAP HANA'dır

* **Zorunlu Hedef:** Bu projenin tek, zorunlu ve nihai veritabanı **SAP HANA**'dır.
* **SQLite Kuralı:**
  * SQLite hedef veritabanı **DEĞİLDİR**.
  * Faz 2 kapsamında gerçekleştirilen `cds deploy --to sqlite` işlemi, yalnızca yerel geliştirme ortamında CDS modelinin ve tohum verilerin geçerliliğini test etmek amacıyla uygulanmış geçmiş bir ara doğrulama adımıdır.
  * Hiçbir ajan veya geliştirici *"SQLite kullanalım"*, *"SQLite üzerinden devam edelim"* veya *"SQLite'a göre yeniden tasarlayalım"* şeklinde bir öneride bulunamaz ve mimariyi SQLite'a bağımlı kılamaz.
  * Tüm veri modelleri, persistence tanımları, sorgular ve veri erişim mantığı **SAP HANA** uyumlu olacaktır.

---

## 3. Tamamlanan Çalışmaları Koruma İlkesi (Değişiklik Yasağı)

Daha önce tamamlanmış olan Faz 1 ve Faz 2 çıktılarının hiçbirini gereksiz yere silmeyin, yeniden yazmayın veya değiştirmeyin:
* **Korunacak Varlıklar:**
  * `db/schema.cds` (Suppliers, Submissions, tüm enum ve alanlar)
  * `db/data/codeup.supplier.management-Suppliers.csv` (12 gerçekçi kurumsal tedarikçi)
  * `db/data/codeup.supplier.management-Submissions.csv` (12 gerçekçi kurumsal başvuru)
  * `test/files/` (`valid-cert.pdf`, `expired-cert.pdf`, `large-file-10mb.pdf`, `invalid-format.txt`)
  * Mevcut Git geçmişi ve tamamlanan roadmap/walkthrough kayıtları.
* **Kural:** Çalışan bir bileşen, sırf yeni bir faza veya HANA'ya geçiyoruz diye silinip sıfırdan yazılamaz.

---

## 4. Tasarım ve Frontend Standartları

* 🚫 **Özel (Custom) CSS Kesinlikle Yasaktır:**
  * Hiçbir `.css` dosyası oluşturulamaz veya inline `style` yazılamaz.
  * Yalnızca SAPUI5 standart kontrolleri, Fiori Horizon teması (`sap_horizon_dark` / `sap_horizon`) ve UI5 native margin/padding sınıfları kullanılacaktır.
* 🌐 **Tam i18n & Otomatik Dil Algılama:**
  * Kodda veya arayüzde hard-coded metin bulunamaz.
  * Türkçe ve İngilizce tam desteklenecektir.
  * Dil, tarayıcı dilinden otomatik algılanacaktır; manuel dil seçici eklenmeyecektir.

---

## 5. Güvenlik ve Kimlik Kuralları

* **Public/Korumalı Ayrımı:**
  * Tedarikçi işlemleri (kayıt, giriş, başvuru formu) public uçlardır; ancak her tedarikçi yalnızca kendi verisini görebilir/düzenleyebilir (mülkiyet izolasyonu).
  * Onaycı paneli (`Supplier Approvals`) ve onay aksiyonları yalnızca XSUAA üzerinden doğrulanmış ve **`Approval`** rolüne (`codeup Approval` rol koleksiyonu) sahip kullanıcılara açıktır.
* 🔒 **Sıfır Hard-coded Credential / API Key:**
  * Kaynak koda veya `.env` dosyasına asla API key, parola veya secret yazılmaz.
  * Google Gemini AI servisi, SAP BTP üzerinde tanımlanmış olan **`gemini`** Destination'ı üzerinden çağrılacaktır.

---
*Bu kurallar, projenin mimari tutarlılığını ve SAP kurumsal standartlarını korumak amacıyla konulmuştur.*
