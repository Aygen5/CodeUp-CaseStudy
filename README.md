# CodeUp Supplier Management (Tedarikçi Onboarding & Onay)

Bu proje, kurumsal tedarikçi kayıt ve onay süreçlerini yöneten tam kapsamlı bir **SAP BTP Bulut Mimarisi** uygulamasıdır.

---

## 🏛️ Mimari Denklem

$$\textbf{CAP Node.js} + \textbf{SAP HANA} + \textbf{SAPUI5} + \textbf{XSUAA} + \textbf{Approuter} + \textbf{Fiori Launchpad} + \textbf{BTP Destination/Gemini}$$

---

## 📂 Proje Dizin Yapısı ve Mimarisi

```text
CodeUp-CaseStudy/
├── app/                      # 🖥️ Frontend (SAPUI5 & Fiori Horizon)
│   ├── appconfig/            # Fiori Sandbox Launchpad konfigürasyonu (fioriSandboxConfig.json)
│   ├── index.html            # Birleşik SAP Fiori Launchpad giriş sayfası
│   ├── logout.html           # Güvenli BTP XSUAA oturum kapatma sayfası
│   ├── supplierportal/       # Tedarikçi Başvuru Portalı (Public/Tedarikçi Girişi)
│   └── supplier-approvals/   # Onaycı Portalı & AI Destekli Karar Ekranı (XSUAA Korunmalı)
│
├── db/                       # 🗄️ Veritabanı Katmanı (SAP HANA)
│   ├── schema.cds            # CDS Veri Modeli (Suppliers, Submissions, Enum'lar)
│   └── data/                 # SAP HANA başlangıç tohum verileri (CSV dosyaları)
│
├── srv/                      # ⚙️ Backend Servis Katmanı (CAP Node.js)
│   ├── public-service.cds    # Public Tedarikçi OData v4 Servis Tanımı
│   ├── public-service.js     # Kayıt, giriş, başvuru ve belge yükleme iş mantığı
│   ├── approval-service.cds  # Korumalı Onaycı OData v4 Servis Tanımı (@requires: 'Approval')
│   ├── approval-service.js   # Onay, ret, BTP Gemini AI analiz iş mantığı
│   └── server.js             # CAP Sunucu önyükleme ve hibrit bootstrapping
│
├── docs/                     # 📚 Proje Dokümantasyon ve Tasarım Kılavuzları
│   ├── architecture.md       # Ayrıntılı mimari tasarım dokümanı
│   ├── BTP_SECURITY_GUIDE.md # BTP XSUAA, Destination ve güvenlik rehberi
│   ├── design-system.md      # UI5 Horizon tasarım kuralları
│   ├── project.md            # Proje isterleri ve kapsam analizi
│   ├── roadmap.md            # Faz bazlı geliştirme yol haritası
│   ├── skills.md             # Teknik yetkinlikler ve kılavuzlar
│   └── AGENTS.md             # Geliştirici mimari kuralları ve ilkeleri
│
├── test/                     # 🧪 Test Paketi
│   ├── files/                # Geçerli/geçersiz test sertifikaları ve PDF örnekleri
│   └── *.js                  # Uçtan uca (E2E) entegrasyon testleri
│
├── approuter.js              # 🛡️ SAP Approuter Giriş Noktası (Reverse Proxy & Token Relay)
├── xs-app.json               # Approuter yönlendirme kuralları ve XSUAA koruma rotaları
├── xs-security.json          # SAP BTP XSUAA Rol ve Yetki tanımları (Approval rolü)
├── run-hybrid.js             # CAP Backend ve Approuter'ı tek komutla başlatan hibrit çalıştırıcı
└── package.json              # Bağımlılıklar, CDS yapılandırması ve çalıştırma komutları
```

---

## 🚀 Projeyi Çalıştırma

### 1. Hibrit Geliştirme Ortamı (Önerilen)
Hem CAP Backend servisini (Port 5001) hem de SAP Approuter'ı (Port 5000) tek bir komutla başlatır:
```bash
npm start
```
Tarayıcınızda açın:
* **Fiori Launchpad (Birleşik Arayüz):** `http://localhost:5000`
* **Tedarikçi Portalı (Doğrudan Erişim):** `http://localhost:5000/supplierportal/index.html`
* **Onaycı Portalı (XSUAA Korumalı):** `http://localhost:5000/supplier-approvals/index.html`

### 2. SAP HANA Cloud Veritabanı Dağıtımı
```bash
npm run deploy:hana
```
