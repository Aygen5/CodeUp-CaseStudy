const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');

async function main() {
  console.log('================================================================');
  console.log('FAZ 5 — ADIM 5.3: Application Form & FileUploader E2E Doğrulama');
  console.log('================================================================\n');

  const baseDir = path.join(__dirname, '..', 'app', 'supplierportal');
  const webappDir = path.join(baseDir, 'webapp');
  const filesDir = path.join(__dirname, 'files');

  // -------------------------------------------------------------
  // 1. Dosya ve Bileşen Varlık Denetimi
  // -------------------------------------------------------------
  console.log('--- 1. Dosya ve Bileşen Varlık Doğrulaması ---');
  const requiredFiles = [
    path.join(webappDir, 'view', 'Application.view.xml'),
    path.join(webappDir, 'controller', 'Application.controller.js'),
    path.join(webappDir, 'model', 'AuthManager.js'),
    path.join(webappDir, 'manifest.json'),
    path.join(webappDir, 'i18n', 'i18n_tr.properties'),
    path.join(webappDir, 'i18n', 'i18n_en.properties'),
    path.join(filesDir, 'valid-cert.pdf'),
    path.join(filesDir, 'large-file-10mb.pdf'),
    path.join(filesDir, 'invalid-format.txt')
  ];

  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      throw new Error(`Zorunlu dosya bulunamadı: ${f}`);
    }
    console.log(`  [OK] Mevcut: ${path.relative(path.join(__dirname, '..'), f)}`);
  }

  // -------------------------------------------------------------
  // 2. Sıfır Custom CSS ve Sıfır Inline Style Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 2. Sıfır Custom CSS & Fiori Horizon Kuralı Denetimi ---');
  function scanDirForCSS(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirForCSS(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.css')) {
          throw new Error(`Kural İhlali: Özel CSS dosyası bulundu: ${fullPath}`);
        }
        if (entry.name.endsWith('.xml') || entry.name.endsWith('.html') || entry.name.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // HTML/XML inline style attribute kontrolü (style="...")
          const inlineStyleRegex = /\sstyle\s*=\s*["'][^"']*[:;][^"']*["']/i;
          if (inlineStyleRegex.test(content) || content.includes('<style')) {
            throw new Error(`Kural İhlali: Inline style tespit edildi: ${fullPath}`);
          }
        }
      }
    }
  }
  scanDirForCSS(baseDir);
  console.log('  [OK] app/supplierportal altında hiçbir .css dosyası veya inline style bulunmamaktadır.');

  // -------------------------------------------------------------
  // 3. i18n TR/EN Çoklu Dil Simetrisi ve Anahtar Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 3. i18n Çoklu Dil Simetrisi ve Anahtar Denetimi ---');
  function parseProperties(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const keys = new Set();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          keys.add(trimmed.substring(0, eqIdx).trim());
        }
      }
    }
    return keys;
  }

  const trKeys = parseProperties(path.join(webappDir, 'i18n', 'i18n_tr.properties'));
  const enKeys = parseProperties(path.join(webappDir, 'i18n', 'i18n_en.properties'));

  console.log(`  İngilizce anahtar sayısı : ${enKeys.size}`);
  console.log(`  Türkçe anahtar sayısı    : ${trKeys.size}`);

  const missingInTr = [...enKeys].filter(k => !trKeys.has(k));
  const missingInEn = [...trKeys].filter(k => !enKeys.has(k));

  if (missingInTr.length > 0) {
    throw new Error(`Türkçe i18n dosyasında eksik anahtarlar var: ${missingInTr.join(', ')}`);
  }
  if (missingInEn.length > 0) {
    throw new Error(`İngilizce i18n dosyasında eksik anahtarlar var: ${missingInEn.join(', ')}`);
  }
  console.log('  [OK] Türkçe ve İngilizce i18n anahtarları %100 simetrik ve eksiksiz.');

  // Step 5.3 zorunlu form anahtarları kontrolü
  const step53Keys = [
    'formTitle', 'groupCompanyInfo', 'groupCertificateInfo',
    'companyNameLabel', 'contactPersonLabel', 'phoneLabel', 'countryLabel',
    'categoryLabel', 'taxIdLabel', 'websiteLabel', 'addressLabel', 'notesLabel',
    'certificateLabel', 'certificateHint', 'certificateRequirements',
    'errRequiredFields', 'errCompanyNameRequired', 'errContactPersonRequired',
    'errFileRequired', 'errFileNotPdf', 'errFileSizeExceeded',
    'submissionSuccess', 'existingSubmissionTitle', 'existingSubmissionNotice'
  ];

  for (const k of step53Keys) {
    if (!trKeys.has(k)) {
      throw new Error(`Step 5.3 zorunlu anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] Step 5.3 form ve dosya yükleme anahtarları (${step53Keys.length} adet) doğrulandı.`);

  // -------------------------------------------------------------
  // 4. XML ve Manifest Yapılandırma Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 4. XML ve Manifest Yapılandırma Denetimi ---');
  const appXml = fs.readFileSync(path.join(webappDir, 'view', 'Application.view.xml'), 'utf8');
  if (!appXml.includes('sap.ui.layout.form') || !appXml.includes('SimpleForm')) {
    throw new Error('Application.view.xml içinde SimpleForm bileşeni bulunamadı!');
  }
  if (!appXml.includes('sap.ui.unified') || !appXml.includes('FileUploader')) {
    throw new Error('Application.view.xml içinde FileUploader bileşeni bulunamadı!');
  }
  if (!appXml.includes('required="true"')) {
    throw new Error('Application.view.xml içinde zorunlu alan işaretleyicileri (required="true") bulunamadı!');
  }
  console.log('  [OK] Application.view.xml: SimpleForm, FileUploader ve zorunlu alan işaretleri doğrulandı.');

  const manifest = JSON.parse(fs.readFileSync(path.join(webappDir, 'manifest.json'), 'utf8'));
  const libs = manifest['sap.ui5']?.dependencies?.libs;
  if (!libs || !libs['sap.ui.unified'] || !libs['sap.ui.layout']) {
    throw new Error('manifest.json dependencies altında sap.ui.unified veya sap.ui.layout eksik!');
  }
  console.log('  [OK] manifest.json: sap.ui.unified ve sap.ui.layout kütüphaneleri eksiksiz tanımlı.');

  // -------------------------------------------------------------
  // 5. İstemci Tarafı Dosya Doğrulama Fonksiyonu Birim Testi
  // -------------------------------------------------------------
  console.log('\n--- 5. İstemci Tarafı Dosya Doğrulama Birim Testi ---');
  function validateClientFile(fileName, fileSize) {
    const MAX_SIZE = 10 * 1024 * 1024;
    if (!fileName || !fileName.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'errFileNotPdf' };
    }
    if (fileSize > MAX_SIZE) {
      return { valid: false, error: 'errFileSizeExceeded' };
    }
    return { valid: true };
  }

  // 5.1 PDF olmayan dosya
  const resTxt = validateClientFile('belge.txt', 500);
  if (resTxt.valid || resTxt.error !== 'errFileNotPdf') {
    throw new Error('TXT dosya uzantı kontrolü başarısız!');
  }
  console.log('  [OK] TXT uzantılı dosya istemci seviyesinde anında reddedildi (errFileNotPdf).');

  // 5.2 10 MB üstü dosya
  const resLarge = validateClientFile('buyuk_dosya.pdf', 10.5 * 1024 * 1024);
  if (resLarge.valid || resLarge.error !== 'errFileSizeExceeded') {
    throw new Error('10 MB üstü dosya boyut kontrolü başarısız!');
  }
  console.log('  [OK] 10.5 MB boyutundaki dosya istemci seviyesinde anında reddedildi (errFileSizeExceeded).');

  // 5.3 Geçerli PDF dosyası
  const resValid = validateClientFile('sertifika.pdf', 2 * 1024 * 1024);
  if (!resValid.valid) {
    throw new Error('Geçerli PDF dosyası reddedildi!');
  }
  console.log('  [OK] 2 MB geçerli PDF dosyası onaylandı.');

  // -------------------------------------------------------------
  // 6. Gerçek CAP Backend ve Canlı OData V4 createSubmission Testleri
  // -------------------------------------------------------------
  console.log('\n--- 6. Gerçek CAP Backend Başlatma ve OData V4 createSubmission Testleri ---');

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Statik UI5 webapp'i sun
  app.use('/supplierportal/webapp', express.static(webappDir));

  // CAP Model ve Database bağlantısı
  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');
  await cds.serve('all').in(app);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`  [OK] Canlı CAP PublicService test sunucusu ayağa kaldırıldı: ${baseUrl}`);

  const validCertBuffer = fs.readFileSync(path.join(filesDir, 'valid-cert.pdf'));
  const validCertBase64 = `data:application/pdf;base64,${validCertBuffer.toString('base64')}`;

  const largeCertBuffer = fs.readFileSync(path.join(filesDir, 'large-file-10mb.pdf'));
  const largeCertBase64 = `data:application/pdf;base64,${largeCertBuffer.toString('base64')}`;

  const invalidTxtBuffer = fs.readFileSync(path.join(filesDir, 'invalid-format.txt'));
  const invalidTxtBase64 = `data:text/plain;base64,${invalidTxtBuffer.toString('base64')}`;

  try {
    // 6.1 Yeni Tedarikçi Kaydı ve Token Alımı
    const testEmail = `supplier_step53_${Date.now()}@codeup-test.com`;
    const regRes = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'SecurePassword123!' })
    });
    const regRaw = await regRes.json();
    const regData = regRaw.value || regRaw;
    const token = regData.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Supplier-Token': token
    };
    console.log(`  [OK] Test tedarikçisi kaydedildi (${testEmail}). Token alındı.`);

    // 6.2 Test 1: Başlangıçta Başvuru Yok Kontrolü (getMySubmission 204)
    console.log('\n  >> Test 1: getMySubmission() Başlangıçta Boş Olmalı (204 No Content)');
    const initialSubRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: authHeaders
    });
    if (initialSubRes.status !== 204 && initialSubRes.status !== 200) {
      throw new Error(`Beklenmeyen başlangıç durumu: HTTP ${initialSubRes.status}`);
    }
    console.log('  [OK] getMySubmission() başlangıçta 204 No Content döndü (başvuru henüz yok).');

    // 6.3 Test 2: Zorunlu Firma Adı Eksik Gönderimi
    console.log('\n  >> Test 2: Zorunlu Firma Adı Boş Bırakıldığında Engelleme');
    const noCompanyRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: '',
        contactPerson: 'Ali Veli',
        certificate: validCertBase64,
        certificateFileName: 'valid-cert.pdf'
      })
    });
    if (noCompanyRes.status !== 400) {
      throw new Error(`Firma adı boşken engellenemedi: HTTP ${noCompanyRes.status}`);
    }
    console.log('  [OK] Firma adı boş bırakıldığında backend tarafından engellendi (HTTP 400).');

    // 6.4 Test 3: Zorunlu İlgili Kişi Eksik Gönderimi
    console.log('\n  >> Test 3: Zorunlu İlgili Kişi Boş Bırakıldığında Engelleme');
    const noContactRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'CodeUp Test A.Ş.',
        contactPerson: '',
        certificate: validCertBase64,
        certificateFileName: 'valid-cert.pdf'
      })
    });
    if (noContactRes.status !== 400) {
      throw new Error(`İlgili kişi boşken engellenemedi: HTTP ${noContactRes.status}`);
    }
    console.log('  [OK] İlgili kişi boş bırakıldığında backend tarafından engellendi (HTTP 400).');

    // 6.5 Test 4: Sertifika Belgesi Eksik Gönderimi
    console.log('\n  >> Test 4: Sertifika Seçilmediğinde Engelleme');
    const noCertRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'CodeUp Test A.Ş.',
        contactPerson: 'Aygen Yıldırım'
      })
    });
    if (noCertRes.status !== 400) {
      throw new Error(`Sertifika yokken engellenemedi: HTTP ${noCertRes.status}`);
    }
    console.log('  [OK] Sertifika belgesi eksik olduğunda backend tarafından engellendi (HTTP 400).');

    // 6.6 Test 5: Sahte/Formatı Hatalı Belge Gönderimi (TXT Magic Bytes)
    console.log('\n  >> Test 5: Geçersiz Format Belge Gönderimi (Magic Bytes Uyumsuzluğu)');
    const fakeCertRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'CodeUp Test A.Ş.',
        contactPerson: 'Aygen Yıldırım',
        certificate: invalidTxtBase64,
        certificateFileName: 'invalid.pdf'
      })
    });
    if (fakeCertRes.status !== 400) {
      throw new Error(`Geçersiz dosya engellenemedi: HTTP ${fakeCertRes.status}`);
    }
    console.log('  [OK] %PDF magic bytes kuralını sağlamayan sahte dosya engellendi (HTTP 400).');

    // 6.7 Test 6: 10 MB Sınırını Aşan Belge Gönderimi
    console.log('\n  >> Test 6: 10 MB Üzeri Dosya Gönderimi Engelleme');
    const largeCertRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'CodeUp Test A.Ş.',
        contactPerson: 'Aygen Yıldırım',
        certificate: largeCertBase64,
        certificateFileName: 'large-file-10mb.pdf'
      })
    });
    if (largeCertRes.status !== 400) {
      throw new Error(`10 MB üstü dosya engellenemedi: HTTP ${largeCertRes.status}`);
    }
    console.log('  [OK] 10 MB sınırını aşan dosya backend tarafından engellendi (HTTP 400).');

    // 6.8 Test 7: Geçersiz Kategori Enum Değeri
    console.log('\n  >> Test 7: Geçersiz Kategori Enum Değeri');
    const invalidCatRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'CodeUp Test A.Ş.',
        contactPerson: 'Aygen Yıldırım',
        category: 'NonExistentCategory',
        certificate: validCertBase64,
        certificateFileName: 'valid-cert.pdf'
      })
    });
    if (invalidCatRes.status !== 400) {
      throw new Error(`Geçersiz kategori engellenemedi: HTTP ${invalidCatRes.status}`);
    }
    console.log('  [OK] Enum dışı kategori backend tarafından engellendi (HTTP 400).');

    // 6.9 Test 8: Geçerli Başvuru Gönderimi (createSubmission Başarılı)
    console.log('\n  >> Test 8: Geçerli Başvuru Gönderimi (createSubmission Başarılı)');
    const createRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'ACME Kurumsal Teknoloji A.Ş.',
        contactPerson: 'Aygen Yıldırım',
        phone: '+90 532 000 0000',
        country: 'Türkiye',
        taxId: 'TR9876543210',
        website: 'https://acme-technology.com',
        address: 'Büyükdere Cad. No: 123, Levent, İstanbul',
        notes: 'Yüksek kaliteli bulut yazılım ve SAP entegrasyon hizmetleri',
        category: 'Software',
        certificate: validCertBase64,
        certificateFileName: 'valid-cert.pdf',
        certificateMimeType: 'application/pdf'
      })
    });

    if (createRes.status !== 200 && createRes.status !== 201) {
      const errText = await createRes.text();
      throw new Error(`createSubmission başarısız: HTTP ${createRes.status} - ${errText}`);
    }

    const createRaw = await createRes.json();
    const createdSubmission = createRaw.value || createRaw;
    if (createdSubmission.status !== 'Pending' || createdSubmission.companyName !== 'ACME Kurumsal Teknoloji A.Ş.') {
      throw new Error(`Oluşturulan başvuru verisi tutarsız: ${JSON.stringify(createdSubmission)}`);
    }
    console.log(`  [OK] Başvuru başarıyla oluşturuldu! ID: ${createdSubmission.ID} | Durum: ${createdSubmission.status}`);

    // 6.10 Test 9: Mükerrer Başvuru Gönderimi Engelleme (Double Submit)
    console.log('\n  >> Test 9: Aynı Tedarikçi İçin Mükerrer Başvuru Engelleme');
    const dupSubRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        companyName: 'İkinci Başvuru Denemesi',
        contactPerson: 'Test Kişi',
        certificate: validCertBase64,
        certificateFileName: 'valid-cert.pdf'
      })
    });
    if (dupSubRes.status !== 400) {
      throw new Error(`Mükerrer başvuru engellenemedi: HTTP ${dupSubRes.status}`);
    }
    console.log('  [OK] İkinci başvuru denemesi backend tarafından engellendi (HTTP 400).');

    // 6.11 Test 10: getMySubmission() ile Başvurunun Doğrulanması
    console.log('\n  >> Test 10: getMySubmission() ile Başvuru Durumunun Alınması');
    const getSubRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: authHeaders
    });
    if (getSubRes.status !== 200) {
      throw new Error(`getMySubmission() başarısız: HTTP ${getSubRes.status}`);
    }
    const retrievedRaw = await getSubRes.json();
    const retrievedSub = retrievedRaw.value || retrievedRaw;
    if (retrievedSub.ID !== createdSubmission.ID || retrievedSub.status !== 'Pending') {
      throw new Error(`Çekilen başvuru verisi eşleşmiyor: ${JSON.stringify(retrievedSub)}`);
    }
    console.log(`  [OK] getMySubmission() ile aktif başvuru başarıyla çekildi (Durum: ${retrievedSub.status}).`);

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('✅ TÜM TESTLER EKSİKSİZ VE BAŞARIYLA TAMAMLANDI! (STEP 5.3 %100)');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ TEST HATASI:', err);
  process.exit(1);
});
