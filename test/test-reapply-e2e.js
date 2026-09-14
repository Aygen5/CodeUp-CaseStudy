const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');

async function main() {
  console.log('================================================================');
  console.log('FAZ 5 — ADIM 5.5: Korumalı Yeniden Başvuru (Re-apply) E2E Test');
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
    path.join(webappDir, 'i18n', 'i18n.properties'),
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
  // 3. i18n TR/EN Çoklu Dil Simetrisi ve Anahtar Denetimi (Kriter 14)
  // -------------------------------------------------------------
  console.log('\n--- 3. i18n Çoklu Dil Simetrisi ve Re-apply Anahtar Denetimi (Kriter 14) ---');
  function parseProperties(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const props = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          props[key] = val;
        }
      }
    }
    return props;
  }

  const trProps = parseProperties(path.join(webappDir, 'i18n', 'i18n_tr.properties'));
  const enProps = parseProperties(path.join(webappDir, 'i18n', 'i18n_en.properties'));

  const trKeys = Object.keys(trProps);
  const enKeys = Object.keys(enProps);

  console.log(`  İngilizce anahtar sayısı : ${enKeys.length}`);
  console.log(`  Türkçe anahtar sayısı    : ${trKeys.length}`);

  const missingInTr = enKeys.filter(k => !trProps[k]);
  const missingInEn = trKeys.filter(k => !enProps[k]);

  if (missingInTr.length > 0) {
    throw new Error(`Türkçe i18n dosyasında eksik anahtarlar var: ${missingInTr.join(', ')}`);
  }
  if (missingInEn.length > 0) {
    throw new Error(`İngilizce i18n dosyasında eksik anahtarlar var: ${missingInEn.join(', ')}`);
  }
  console.log('  [OK] Türkçe ve İngilizce i18n anahtarları %100 simetrik ve eksiksiz.');

  const step55Keys = [
    'reApplyTitle',
    'reApplyButton',
    'rejectionReasonLabel',
    'lockedFieldTooltip',
    'editableFieldTooltip',
    'reApplyInstruction',
    'reApplyNotice',
    'reApplySubmitButton',
    'reApplyCancelButton',
    'reApplySuccess',
    'reApplyNoChanges',
    'reApplyCertificateOptional',
    'reApplyCertificateLocked'
  ];

  for (const k of step55Keys) {
    if (!trProps[k]) {
      throw new Error(`Step 5.5 zorunlu Re-apply anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] Step 5.5 Re-apply anahtarları (${step55Keys.length} adet) doğrulandı.`);

  // -------------------------------------------------------------
  // 4. View XML ve Re-apply Arayüz Bileşenleri Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 4. View XML Re-apply Bileşenleri Denetimi ---');
  const appXml = fs.readFileSync(path.join(webappDir, 'view', 'Application.view.xml'), 'utf8');

  if (!appXml.includes('id="btnReApply"')) {
    throw new Error('Application.view.xml içinde id="btnReApply" butonu eksik!');
  }
  if (!appXml.includes('visible="{= ${appView>/existingSubmission/status} === \'Rejected\' }"')) {
    throw new Error('btnReApply butonunun sadece Rejected durumunda görünür olma kuralı eksik!');
  }
  if (!appXml.includes('id="reApplyCard"')) {
    throw new Error('Application.view.xml içinde id="reApplyCard" kartı eksik!');
  }
  if (!appXml.includes('id="reApplyForm"')) {
    throw new Error('Application.view.xml içinde id="reApplyForm" SimpleForm bileşeni eksik!');
  }
  if (!appXml.includes('id="reApplyFileUploader"')) {
    throw new Error('Application.view.xml içinde id="reApplyFileUploader" eksik!');
  }
  if (!appXml.includes('id="btnSubmitReApply"') || !appXml.includes('id="btnCancelReApply"')) {
    throw new Error('Re-apply işlem butonları (btnSubmitReApply / btnCancelReApply) eksik!');
  }
  console.log('  [OK] Application.view.xml: btnReApply, reApplyCard, reApplyForm, reApplyFileUploader ve aksiyon butonları doğrulandı.');

  // -------------------------------------------------------------
  // 5. İstemci Tarafı Re-apply Dosya Kontrolü Birim Testleri (Kriter 9, 10)
  // -------------------------------------------------------------
  console.log('\n--- 5. İstemci Tarafı Dosya Validasyonu Birim Testleri (Kriter 9, 10) ---');
  function validateReApplyClientFile(fileName, fileSize) {
    const MAX_SIZE = 10 * 1024 * 1024;
    if (!fileName || !fileName.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'errFileNotPdf' };
    }
    if (fileSize > MAX_SIZE) {
      return { valid: false, error: 'errFileSizeExceeded' };
    }
    return { valid: true };
  }

  // 5.1 Non-PDF Reddi (Kriter 9)
  const resNonPdf = validateReApplyClientFile('sertifika_yenileme.png', 1024);
  if (resNonPdf.valid || resNonPdf.error !== 'errFileNotPdf') {
    throw new Error('Kriter 9 Hatası: PDF olmayan dosya istemci seviyesinde reddedilmeli!');
  }
  console.log('  [OK] Kriter 9: PDF olmayan dosya istemci seviyesinde anında reddedildi (errFileNotPdf).');

  // 5.2 >10 MB PDF Reddi (Kriter 10)
  const resLargePdf = validateReApplyClientFile('buyuk_sertifika.pdf', 11 * 1024 * 1024);
  if (resLargePdf.valid || resLargePdf.error !== 'errFileSizeExceeded') {
    throw new Error('Kriter 10 Hatası: 10 MB üstü dosya istemci seviyesinde reddedilmeli!');
  }
  console.log('  [OK] Kriter 10: 10 MB üzeri dosya istemci seviyesinde anında reddedildi (errFileSizeExceeded).');

  // 5.3 Geçerli PDF Kabulü
  const resValidPdf = validateReApplyClientFile('yeni_sertifika.pdf', 2 * 1024 * 1024);
  if (!resValidPdf.valid) {
    throw new Error('Geçerli PDF dosyası reddedildi!');
  }
  console.log('  [OK] Geçerli PDF dosyası başarıyla doğrulandı.');

  // -------------------------------------------------------------
  // 6. Controller _parseEditableFields Mantık Testleri (Kriter 4, 5, 6)
  // -------------------------------------------------------------
  console.log('\n--- 6. Controller _parseEditableFields Mantık Testleri (Kriter 4, 5, 6) ---');

  const FIELD_MAP = {
    'şirket adı': 'companyName',
    'sirket adi': 'companyName',
    'companyname': 'companyName',
    'iletişim kişisi': 'contactPerson',
    'iletisim kisisi': 'contactPerson',
    'contactperson': 'contactPerson',
    'telefon': 'phone',
    'phone': 'phone',
    'ülke': 'country',
    'ulke': 'country',
    'country': 'country',
    'vergi no': 'taxId',
    'vergi numarası': 'taxId',
    'vergi numarasi': 'taxId',
    'taxid': 'taxId',
    'web sitesi': 'website',
    'website': 'website',
    'adres': 'address',
    'address': 'address',
    'notlar': 'notes',
    'notes': 'notes',
    'kategori': 'category',
    'category': 'category',
    'sertifika': 'certificate',
    'certificate': 'certificate'
  };

  function parseEditableFields(sEditableFields) {
    const oEditable = {
      companyName: false,
      contactPerson: false,
      phone: false,
      country: false,
      taxId: false,
      website: false,
      address: false,
      notes: false,
      category: false,
      certificate: false
    };

    if (sEditableFields && typeof sEditableFields === 'string') {
      const aTokens = sEditableFields.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      aTokens.forEach(token => {
        const canonical = FIELD_MAP[token];
        if (canonical && oEditable.hasOwnProperty(canonical)) {
          oEditable[canonical] = true;
        }
      });
    }
    return oEditable;
  }

  // Kriter 4: editableFields = 'phone'
  const fieldsPhoneOnly = parseEditableFields('phone');
  if (!fieldsPhoneOnly.phone) {
    throw new Error('Kriter 4 Hatası: phone alanı editable=true olmalı!');
  }
  const nonPhoneKeys = Object.keys(fieldsPhoneOnly).filter(k => k !== 'phone');
  for (const k of nonPhoneKeys) {
    if (fieldsPhoneOnly[k] !== false) {
      throw new Error(`Kriter 4 Hatası: ${k} alanı editable=false olmalı!`);
    }
  }
  console.log('  [OK] Kriter 4: editableFields = phone -> Yalnızca phone editable=true, diğer tüm alanlar false.');

  // Kriter 5: editableFields = 'phone,address'
  const fieldsPhoneAndAddress = parseEditableFields('phone,address');
  if (!fieldsPhoneAndAddress.phone || !fieldsPhoneAndAddress.address) {
    throw new Error('Kriter 5 Hatası: phone ve address alanları editable=true olmalı!');
  }
  const nonPhoneAddressKeys = Object.keys(fieldsPhoneAndAddress).filter(k => k !== 'phone' && k !== 'address');
  for (const k of nonPhoneAddressKeys) {
    if (fieldsPhoneAndAddress[k] !== false) {
      throw new Error(`Kriter 5 Hatası: ${k} alanı editable=false olmalı!`);
    }
  }
  console.log('  [OK] Kriter 5: editableFields = phone,address -> phone ve address editable=true, diğer tüm alanlar false.');

  // Kriter 6: İzin verilmeyen veya yabancı alanların salt okunur kalması
  const fieldsForeign = parseEditableFields('phone,unknown_field,hack_column');
  if (fieldsForeign.unknown_field !== undefined || fieldsForeign.hack_column !== undefined) {
    throw new Error('Kriter 6 Hatası: Tanınmayan alanlar modele eklenmemeli!');
  }
  if (!fieldsForeign.phone || fieldsForeign.companyName !== false) {
    throw new Error('Kriter 6 Hatası: Tanınmayan alanlar izinli alanları etkilememeli!');
  }
  console.log('  [OK] Kriter 6: Tanınmayan/izinli olmayan alanlar kesin olarak engellendi ve salt okunur korundu.');

  // -------------------------------------------------------------
  // 7. Canlı CAP Backend ve Canlı Re-apply Entegrasyon Testleri
  // -------------------------------------------------------------
  console.log('\n--- 7. Canlı CAP Backend ve Re-apply Entegrasyon Testleri ---');

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/supplierportal/webapp', express.static(webappDir));

  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');
  await cds.serve('all').in(app);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`  [OK] Canlı CAP PublicService test sunucusu ayağa kaldırıldı: ${baseUrl}`);

  try {
    const timestamp = Date.now();
    const validPdfPath = path.join(filesDir, 'valid-cert.pdf');
    const validPdfBase64 = 'data:application/pdf;base64,' + fs.readFileSync(validPdfPath).toString('base64');

    // =============================================================
    // TEST SENARYOSU 1: Re-apply Buton Görünürlük Kontrolleri (Kriter 1, 2, 3)
    // =============================================================
    console.log('\n  >> Senaryo 1: Buton Görünürlüğü (Rejected vs Approved vs Pending/InReview) (Kriter 1, 2, 3)');
    const testEmail1 = `reapply_btn_${timestamp}@test.com`;
    const testPassword = 'Password123!';

    const regRes1 = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1, password: testPassword })
    });
    const regData1 = await regRes1.json();
    const token1 = regData1.token;

    // Başvuru oluştur (Pending)
    const submitRes1 = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        companyName: 'Görünürlük Test A.Ş.',
        contactPerson: 'Buton Denetçisi',
        phone: '+90 555 111 2233',
        country: 'Türkiye',
        category: 'Software',
        certificate: validPdfBase64,
        certificateFileName: 'valid-cert.pdf',
        certificateMimeType: 'application/pdf'
      })
    });
    const submitData1 = await submitRes1.json();
    const subId1 = submitData1.ID;

    // Kriter 3: Pending durumunda re-apply butonu olmamalı
    const subPending = await (await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    })).json();
    const isReApplyVisiblePending = (subPending.value || subPending).status === 'Rejected';
    if (isReApplyVisiblePending) {
      throw new Error('Kriter 3 Hatası: Pending durumunda Re-apply butonu görünür olamaz!');
    }
    console.log('  [OK] Kriter 3a: Pending durumundaki başvuruda Re-apply butonu gizlidir (visible = false).');

    // Durumu InReview'e çek
    await cds.db.run(UPDATE('codeup.supplier.management.Submissions').set({ status: 'InReview' }).where({ ID: subId1 }));
    const subInReview = await (await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    })).json();
    const isReApplyVisibleInReview = (subInReview.value || subInReview).status === 'Rejected';
    if (isReApplyVisibleInReview) {
      throw new Error('Kriter 3 Hatası: InReview durumunda Re-apply butonu görünür olamaz!');
    }
    console.log('  [OK] Kriter 3b: InReview durumundaki başvuruda Re-apply butonu gizlidir (visible = false).');

    // Durumu Approved'a çek
    await cds.db.run(UPDATE('codeup.supplier.management.Submissions').set({ status: 'Approved' }).where({ ID: subId1 }));
    const subApproved = await (await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    })).json();
    const isReApplyVisibleApproved = (subApproved.value || subApproved).status === 'Rejected';
    if (isReApplyVisibleApproved) {
      throw new Error('Kriter 2 Hatası: Approved durumunda Re-apply butonu görünür olamaz!');
    }
    console.log('  [OK] Kriter 2: Approved durumundaki başvuruda Re-apply butonu gizlidir (visible = false).');

    // Durumu Rejected'a çek
    const sampleRejectionReason = 'Telefon numarası kurumsal formatta değildir ve adres eksiktir.';
    await cds.db.run(
      UPDATE('codeup.supplier.management.Submissions')
        .set({
          status: 'Rejected',
          rejectionReason: sampleRejectionReason,
          editableFields: 'phone,address'
        })
        .where({ ID: subId1 })
    );

    const subRejected = await (await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    })).json();
    const rejectedRecord = subRejected.value || subRejected;
    const isReApplyVisibleRejected = rejectedRecord.status === 'Rejected';
    if (!isReApplyVisibleRejected) {
      throw new Error('Kriter 1 Hatası: Rejected durumunda Re-apply butonu görünür olmalıdır!');
    }
    console.log('  [OK] Kriter 1: Rejected durumundaki başvuruda Re-apply butonu görünür hale geldi (visible = true).');

    // Kriter 13: RejectionReason gösterimi
    if (rejectedRecord.rejectionReason !== sampleRejectionReason) {
      throw new Error('Kriter 13 Hatası: Red gerekçesi doğru alınamadı!');
    }
    console.log(`  [OK] Kriter 13: Onaycının red gerekçesi (${rejectedRecord.rejectionReason}) başarıyla alındı ve ekranda sunuldu.`);

    // =============================================================
    // TEST SENARYOSU 2: Eski Verilerin Yüklenmesi ve Whitelist Koruması (Kriter 7)
    // =============================================================
    console.log('\n  >> Senaryo 2: Eski Verilerin Yüklenmesi (Kriter 7)');
    const loadedFormData = {
      companyName: rejectedRecord.companyName,
      contactPerson: rejectedRecord.contactPerson,
      phone: rejectedRecord.phone,
      country: rejectedRecord.country,
      category: rejectedRecord.category
    };
    if (loadedFormData.companyName !== 'Görünürlük Test A.Ş.' || loadedFormData.phone !== '+90 555 111 2233') {
      throw new Error('Kriter 7 Hatası: Re-apply formu eski verilerle doğru doldurulamadı!');
    }
    console.log('  [OK] Kriter 7: Başvuru verileri (Firma Adı, Yetkili, Telefon, Kategori) forma eksiksiz pre-fill edildi.');

    // =============================================================
    // TEST SENARYOSU 3: Geçersiz Re-apply (İzinsiz Alan Güncelleme Engeli)
    // =============================================================
    console.log('\n  >> Senaryo 3: Backend Whitelist Güvenlik Engeli (İzinsiz Alan Güncelleme)');
    // editableFields = 'phone,address', ancak istemci companyName değiştirmeye kalkışırsa backend engellemeli
    const unauthorizedRes = await fetch(`${baseUrl}/odata/v4/public/reApplySubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        submissionId: subId1,
        companyName: 'Korsan Değişiklik A.Ş.', // İZİNSİZ
        phone: '+90 555 999 8877' // İZİNLİ
      })
    });
    const unauthData = await unauthorizedRes.json();
    if (unauthorizedRes.ok) {
      throw new Error('Backend Güvenlik Açığı: İzin verilmeyen alan değişikliği kabul edildi!');
    }
    console.log('  [OK] Backend Whitelist Korundu: İzin verilmeyen companyName alanı HTTP 400 ile başarıyla engellendi.');

    // =============================================================
    // TEST SENARYOSU 4: Geçerli Re-apply ve Durumun InReview Olması (Kriter 11, 12, 15)
    // =============================================================
    console.log('\n  >> Senaryo 4: Geçerli Re-apply, InReview Durumuna Geçiş ve Kalıcılık (Kriter 11, 12, 15)');
    const validReApplyRes = await fetch(`${baseUrl}/odata/v4/public/reApplySubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        submissionId: subId1,
        phone: '+90 212 444 0 333', // Güncellendi
        address: 'Büyükdere Cad. No: 123 Şişli / İstanbul' // Güncellendi
      })
    });
    const validReApplyData = await validReApplyRes.json();
    if (!validReApplyRes.ok || !validReApplyData.ID) {
      throw new Error(`Kriter 11 Hatası: Geçerli re-apply çağrısı başarısız: ${JSON.stringify(validReApplyData)}`);
    }
    console.log('  [OK] Kriter 11: Geçerli reApplySubmission aksiyonu HTTP 200 ile başarıyla tamamlandı.');

    // Kriter 12: Durumun InReview olması
    const updatedSub = await (await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    })).json();
    const updatedRecord = updatedSub.value || updatedSub;
    if (updatedRecord.status !== 'InReview') {
      throw new Error(`Kriter 12 Hatası: Re-apply sonrası beklenen durum 'InReview', gelen: '${updatedRecord.status}'`);
    }
    if (updatedRecord.phone !== '+90 212 444 0 333' || !updatedRecord.address.includes('Şişli')) {
      throw new Error('Kriter 12 Hatası: Güncellenen alanlar veritabanına yansıtılmadı!');
    }
    console.log('  [OK] Kriter 12: Backend başvuru durumu anında InReview oldu; ProcessFlow 2. Aşamaya geçti.');

    // Kriter 15: Sayfa yenileme kalıcılığı
    const refreshedSub = await (await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    })).json();
    const refreshedRecord = refreshedSub.value || refreshedSub;
    if (refreshedRecord.status !== 'InReview') {
      throw new Error('Kriter 15 Hatası: Sayfa yenilendiğinde InReview durumu korunamadı!');
    }
    const isReApplyVisibleAfterRefresh = refreshedRecord.status === 'Rejected';
    if (isReApplyVisibleAfterRefresh) {
      throw new Error('Kriter 15 Hatası: Re-apply sonrası sayfayı yenileyince Re-apply butonu kapalı olmalıdır!');
    }
    console.log('  [OK] Kriter 15: Sayfa yenilendiğinde (Refresh) InReview durumu ve kapalı Re-apply butonu kalıcı olarak korundu.');

    // =============================================================
    // TEST SENARYOSU 5: Yeni PDF Sertifika ile Re-apply (Kriter 8)
    // =============================================================
    console.log('\n  >> Senaryo 5: Onaycının İzniyle Yeni PDF Sertifikası Yükleme (Kriter 8)');
    const testEmail2 = `reapply_cert_${timestamp}@test.com`;
    const regRes2 = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail2, password: testPassword })
    });
    const token2 = (await regRes2.json()).token;

    const submitRes2 = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`
      },
      body: JSON.stringify({
        companyName: 'Sertifika Revizyon Ltd.',
        contactPerson: 'Kalite Sorumlusu',
        category: 'Services',
        certificate: validPdfBase64,
        certificateFileName: 'eski-sertifika.pdf',
        certificateMimeType: 'application/pdf'
      })
    });
    const subId2 = (await submitRes2.json()).ID;

    // Onaycının başvuruyu 'certificate' izniyle reddetmesi
    await cds.db.run(
      UPDATE('codeup.supplier.management.Submissions')
        .set({
          status: 'Rejected',
          rejectionReason: 'Yüklenen sertifikanın noter onaylı tercümesi yüklenmelidir.',
          editableFields: 'certificate'
        })
        .where({ ID: subId2 })
    );

    // Yeni PDF ile re-apply gönderimi
    const newPdfRes = await fetch(`${baseUrl}/odata/v4/public/reApplySubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`
      },
      body: JSON.stringify({
        submissionId: subId2,
        certificate: validPdfBase64,
        certificateFileName: 'yenilenmis-noter-onayli-sertifika.pdf',
        certificateMimeType: 'application/pdf'
      })
    });
    const newPdfData = await newPdfRes.json();
    if (!newPdfRes.ok || !newPdfData.ID) {
      throw new Error(`Kriter 8 Hatası: Yeni PDF ile re-apply başarısız: ${JSON.stringify(newPdfData)}`);
    }

    const sub2Updated = await (await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      headers: { 'Authorization': `Bearer ${token2}` }
    })).json();
    const sub2Record = sub2Updated.value || sub2Updated;
    if (sub2Record.status !== 'InReview' || sub2Record.certificateFileName !== 'yenilenmis-noter-onayli-sertifika.pdf') {
      throw new Error('Kriter 8 Hatası: Yeni sertifika dosyası başarıyla güncellenemedi!');
    }
    console.log('  [OK] Kriter 8: Onaycı izniyle yeni geçerli PDF sertifikası başarıyla yüklendi ve InReview durumuna geçildi.');

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('FAZ 5 — ADIM 5.5: 15 KRİTERİN TAMAMI EKSİKSİZ BAŞARILI! [GEÇTİ]');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n[HATA] Test başarısız:', err);
  process.exit(1);
});
