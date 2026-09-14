const fs = require('fs');
const path = require('path');
const cds = require('@sap/cds');
const express = require('express');

async function main() {
  console.log('================================================================');
  console.log('FAZ 6.4-B: Manuel Red (Rejection Flow) Uçtan Uca Doğrulama Testi');
  console.log('================================================================\n');

  let passedTests = 0;
  const projectRoot = path.resolve(__dirname, '..');
  const webappDir = path.join(projectRoot, 'app', 'supplier-approvals', 'webapp');

  // -------------------------------------------------------------
  // 1. STATİK KOD, BİLEŞEN VE TASARIM STANDARTLARI DENETİMİ
  // -------------------------------------------------------------
  console.log('>>> 1. STATİK KOD, BİLEŞEN VE TASARIM STANDARTLARI DENETİMİ');

  // 1.1 Custom CSS ve Inline Style Denetimi
  function scanFiles(dir, ext) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(scanFiles(fullPath, ext));
      } else if (entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const cssFiles = scanFiles(webappDir, '.css');
  if (cssFiles.length > 0) {
    throw new Error(`KURAL İHLALİ: app/supplier-approvals altında özel CSS bulundu: ${cssFiles.join(', ')}`);
  }

  const xmlFiles = scanFiles(webappDir, '.xml');
  for (const xf of xmlFiles) {
    const content = fs.readFileSync(xf, 'utf8');
    if (content.includes('style=')) {
      throw new Error(`KURAL İHLALİ: ${xf} içinde inline style bulundu!`);
    }
  }
  console.log('  [OK] Sıfır Custom CSS ve sıfır inline style kuralı doğrulandı.');
  passedTests++;

  // 1.2 DetailDialog.fragment.xml btnApprove ve btnReject Yapılandırması
  const detailFragmentPath = path.join(webappDir, 'view', 'fragment', 'DetailDialog.fragment.xml');
  const detailXml = fs.readFileSync(detailFragmentPath, 'utf8');

  if (!detailXml.includes('id="btnApprove"')) {
    throw new Error('6.4-A Onayla butonu bozulmuş, DetailDialog içinde bulunamadı!');
  }
  if (!detailXml.includes('id="btnReject"')) {
    throw new Error('DetailDialog.fragment.xml içinde btnReject bulunamadı!');
  }
  if (!detailXml.includes('press=".onRejectPress"')) {
    throw new Error('btnReject için press=".onRejectPress" bulunamadı!');
  }
  if (!detailXml.includes('type="Reject"')) {
    throw new Error('btnReject için type="Reject" bulunamadı!');
  }
  if (!detailXml.includes('busy="{detailModel>/actionBusy}"')) {
    throw new Error('btnReject için duplicate engelleme (actionBusy) bulunamadı!');
  }
  console.log('  [OK] DetailDialog.fragment.xml Onayla ve Reddet butonları eksiksiz mevcut.');
  passedTests++;

  // 1.3 RejectDialog.fragment.xml Yapılandırması ve Whitelist Uyumu
  const rejectFragmentPath = path.join(webappDir, 'view', 'fragment', 'RejectDialog.fragment.xml');
  if (!fs.existsSync(rejectFragmentPath)) {
    throw new Error('RejectDialog.fragment.xml dosyası mevcut değil!');
  }
  const rejectXml = fs.readFileSync(rejectFragmentPath, 'utf8');

  if (!rejectXml.includes('id="taRejectionReason"')) {
    throw new Error('RejectDialog içinde taRejectionReason bulunamadı!');
  }
  if (!rejectXml.includes('liveChange=".onRejectReasonLiveChange"')) {
    throw new Error('taRejectionReason içinde onRejectReasonLiveChange bulunamadı!');
  }

  // Backend VALID_EDITABLE_FIELDS listesindeki 10 alanın eksiksiz varlığı
  const expectedFields = [
    'chkFieldCertificate', 'chkFieldTaxId', 'chkFieldPhone', 'chkFieldAddress',
    'chkFieldCategory', 'chkFieldCountry', 'chkFieldWebsite', 'chkFieldContactPerson',
    'chkFieldCompanyName', 'chkFieldNotes'
  ];
  for (const ef of expectedFields) {
    if (!rejectXml.includes(`id="${ef}"`)) {
      throw new Error(`RejectDialog içinde ${ef} checkbox'ı eksik!`);
    }
  }
  if (!rejectXml.includes('id="btnConfirmReject"') || !rejectXml.includes('press=".onConfirmReject"')) {
    throw new Error('RejectDialog içinde onConfirmReject butonu eksik!');
  }
  if (!rejectXml.includes('id="btnSelectCertOnly"') || !rejectXml.includes('id="btnClearAllFields"')) {
    throw new Error('RejectDialog içinde hızlı seçim butonları eksik!');
  }
  console.log('  [OK] RejectDialog.fragment.xml 10 kanonik alan ve Fiori kontrolleriyle eksiksiz doğrulandı.');
  passedTests++;

  // 1.4 Main.controller.js Red Fonksiyonları Denetimi
  const controllerPath = path.join(webappDir, 'controller', 'Main.controller.js');
  const controllerJs = fs.readFileSync(controllerPath, 'utf8');

  const requiredMethods = [
    'onRejectPress', 'onRejectReasonLiveChange', 'onRejectFieldSelect',
    'onSelectCertOnly', 'onClearAllFields', '_validateRejectForm',
    'onConfirmReject', 'onCloseRejectDialog'
  ];
  for (const rm of requiredMethods) {
    if (!controllerJs.includes(rm)) {
      throw new Error(`Main.controller.js içinde ${rm} fonksiyonu bulunamadı!`);
    }
  }
  if (!controllerJs.includes('/odata/v4/approval/Submissions(') || !controllerJs.includes('/reject')) {
    throw new Error('Main.controller.js içinde gerçek CAP bound reject action çağrısı bulunamadı!');
  }
  console.log('  [OK] Main.controller.js red mantığı ve validasyon fonksiyonları doğrulandı.');
  passedTests++;

  // 1.5 i18n TR/EN Simetrisi
  const i18nTr = fs.readFileSync(path.join(webappDir, 'i18n', 'i18n_tr.properties'), 'utf8');
  const i18nEn = fs.readFileSync(path.join(webappDir, 'i18n', 'i18n_en.properties'), 'utf8');
  const i18nDef = fs.readFileSync(path.join(webappDir, 'i18n', 'i18n.properties'), 'utf8');

  function getKeys(text) {
    return text.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => l.split('=')[0].trim());
  }

  const trKeys = getKeys(i18nTr);
  const enKeys = getKeys(i18nEn);
  const defKeys = getKeys(i18nDef);

  if (trKeys.length !== enKeys.length || trKeys.length !== defKeys.length) {
    throw new Error(`i18n anahtar sayıları uyuşmuyor! TR: ${trKeys.length}, EN: ${enKeys.length}`);
  }

  const requiredRejectKeys = [
    'rejectDialogTitle', 'rejectDialogDesc', 'rejectReasonLabel',
    'rejectReasonPlaceholder', 'rejectEditableFieldsLabel', 'btnConfirmReject',
    'btnCancel', 'btnSelectCertOnly', 'btnClearAllFields',
    'errRejectReasonRequired', 'errEditableFieldsRequired',
    'msgRejectSuccess', 'errRejectFailed',
    'fieldCompanyName', 'fieldContactPerson', 'fieldPhone', 'fieldCountry',
    'fieldTaxId', 'fieldWebsite', 'fieldAddress', 'fieldNotes',
    'fieldCategory', 'fieldCertificate'
  ];

  for (const k of requiredRejectKeys) {
    if (!trKeys.includes(k) || !enKeys.includes(k) || !defKeys.includes(k)) {
      throw new Error(`Zorunlu red i18n anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] i18n red anahtarları eksiksiz ve %100 simetrik (${trKeys.length} anahtar).`);
  passedTests++;

  // -------------------------------------------------------------
  // 2. CANLI CAP BACKEND REDDETME ENTEGRASYONU VE GÜVENLİK TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 2. CANLI CAP BACKEND REDDETME ENTEGRASYONU VE GÜVENLİK TESTLERİ');

  cds.env.requires.auth = {
    kind: 'mocked',
    users: {
      approver_user: { roles: ['Approval'] },
      unauthorized_user: { roles: ['StandardUser'] }
    }
  };

  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');

  const app = express();
  app.use(express.json());
  await cds.serve('all').in(app);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log('  CAP Test Sunucusu Dinlemede:', baseUrl);

  const approverHeaders = {
    authorization: 'Basic ' + Buffer.from('approver_user:').toString('base64'),
    'Content-Type': 'application/json'
  };

  const unauthorizedHeaders = {
    authorization: 'Basic ' + Buffer.from('unauthorized_user:').toString('base64'),
    'Content-Type': 'application/json'
  };

  async function httpGet(endpoint, headers = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, { method: 'GET', headers });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  async function httpPost(endpoint, body = {}, headers = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  const Submissions = 'codeup.supplier.management.Submissions';
  const Suppliers = 'codeup.supplier.management.Suppliers';

  const testSupplierId = '80000000-0000-4000-8000-000000000001';
  const testPendingId = '80000000-0000-4000-8000-000000000002';
  const testInReviewId = '80000000-0000-4000-8000-000000000003';
  const testApprovedId = '80000000-0000-4000-8000-000000000004';

  await cds.db.run(DELETE.from(Submissions).where({ ID: { in: [testPendingId, testInReviewId, testApprovedId] } })).catch(() => null);
  await cds.db.run(DELETE.from(Suppliers).where({ ID: testSupplierId })).catch(() => null);

  await cds.db.run(INSERT.into(Suppliers).entries({
    ID: testSupplierId,
    email: 'reject-flow-test@codeup.corp',
    passwordHash: '$2b$10$dummyHash'
  }));

  await cds.db.run(INSERT.into(Submissions).entries([
    {
      ID: testPendingId,
      supplier_ID: testSupplierId,
      companyName: 'Gamma Hardware Tech Ltd.',
      contactPerson: 'Eren Yurt',
      phone: '+90 533 111 2233',
      country: 'Türkiye',
      taxId: 'TR8881112233',
      category: 'Hardware',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificateFileName: 'gamma_cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testInReviewId,
      supplier_ID: testSupplierId,
      companyName: 'Delta Security Services A.Ş.',
      contactPerson: 'Ceren Dal',
      phone: '+90 533 222 3344',
      country: 'Türkiye',
      taxId: 'TR8882223344',
      category: 'Services',
      status: 'InReview',
      submissionDate: new Date().toISOString(),
      certificateFileName: 'delta_cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testApprovedId,
      supplier_ID: testSupplierId,
      companyName: 'Omega Systems Inc.',
      contactPerson: 'Barış Soydan',
      phone: '+90 533 333 4455',
      country: 'Türkiye',
      taxId: 'TR8883334455',
      category: 'Software',
      status: 'Approved',
      submissionDate: new Date().toISOString(),
      certificateFileName: 'omega_cert.pdf',
      certificateMimeType: 'application/pdf'
    }
  ]));

  // 2.1 Güvenlik: Anonim ve yetkisiz reject denemeleri
  const anonReject = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/reject`, {
    rejectionReason: 'Test',
    editableFields: 'phone'
  });
  if (anonReject.status !== 401) {
    throw new Error(`Anonim reject engellenmedi! Status: ${anonReject.status}`);
  }
  console.log('  [OK] Anonim reject çağrısı 401 Unauthorized ile engellendi.');
  passedTests++;

  const unauthReject = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/reject`, {
    rejectionReason: 'Test',
    editableFields: 'phone'
  }, unauthorizedHeaders);
  if (unauthReject.status !== 403) {
    throw new Error(`Yetkisiz reject engellenmedi! Status: ${unauthReject.status}`);
  }
  console.log('  [OK] Approval rolü olmayan kullanıcı 403 Forbidden ile engellendi.');
  passedTests++;

  // 2.2 Validasyon 1: Boş karar notu engellenmeli (400)
  const emptyReasonRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/reject`, {
    rejectionReason: '',
    editableFields: 'phone'
  }, approverHeaders);
  if (emptyReasonRes.status !== 400) {
    throw new Error(`Boş karar notu engellenmedi! Status: ${emptyReasonRes.status}`);
  }
  console.log('  [OK] Boş karar notu backend tarafından HTTP 400 ile engellendi.');
  passedTests++;

  // 2.3 Validasyon 2: Yalnızca boşluk (whitespace) karar notu engellenmeli (400)
  const whitespaceReasonRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/reject`, {
    rejectionReason: '     \t  \n  ',
    editableFields: 'phone'
  }, approverHeaders);
  if (whitespaceReasonRes.status !== 400) {
    throw new Error(`Whitespace karar notu engellenmedi! Status: ${whitespaceReasonRes.status}`);
  }
  console.log('  [OK] Whitespace-only karar notu HTTP 400 ile engellendi.');
  passedTests++;

  // 2.4 Validasyon 3: Düzenlenebilir alan seçilmeden reject engellenmeli (400)
  const emptyFieldsRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/reject`, {
    rejectionReason: 'Geçersiz başvuru.',
    editableFields: ''
  }, approverHeaders);
  if (emptyFieldsRes.status !== 400) {
    throw new Error(`Boş editableFields engellenmedi! Status: ${emptyFieldsRes.status}`);
  }
  console.log('  [OK] Düzenlenebilir alan seçilmeden yapılan reject HTTP 400 ile engellendi.');
  passedTests++;

  // 2.5 Validasyon 4: Whitelist dışı geçersiz alan adı engellenmeli (400)
  const invalidFieldRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/reject`, {
    rejectionReason: 'Geçersiz veri.',
    editableFields: 'creditCardNumber,phone'
  }, approverHeaders);
  if (invalidFieldRes.status !== 400) {
    throw new Error(`Geçersiz alan adı engellenmedi! Status: ${invalidFieldRes.status}`);
  }
  console.log('  [OK] Whitelist dışı geçersiz alan adı ("creditCardNumber") HTTP 400 ile engellendi.');
  passedTests++;

  // 2.6 Validasyon 5: Onaylanmış (Approved) bir başvurunun reddedilmesi engellenmeli (400)
  const rejectApprovedRes = await httpPost(`/odata/v4/approval/Submissions(${testApprovedId})/reject`, {
    rejectionReason: 'Vazgeçtim, reddediyorum.',
    editableFields: 'phone'
  }, approverHeaders);
  if (rejectApprovedRes.status !== 400) {
    throw new Error(`Approved başvuru reddedilebildi! Status: ${rejectApprovedRes.status}`);
  }
  console.log('  [OK] Onaylanmış (Approved) başvurunun reddedilmesi HTTP 400 ile engellendi.');
  passedTests++;

  // 2.7 Geçerli Reddetme İşlemi 1 (Pending -> Rejected, Çoklu Alan)
  const validReject1 = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/reject`, {
    rejectionReason: 'Vergi levhası ve yetkili iletişim telefonu güncellenmelidir.',
    editableFields: 'taxId,phone'
  }, approverHeaders);
  if (validReject1.status !== 200) {
    throw new Error(`Pending başvuru reddedilemedi! Status: ${validReject1.status} Data: ${JSON.stringify(validReject1.data)}`);
  }
  const verifySub1 = await httpGet(`/odata/v4/approval/Submissions(${testPendingId})`, approverHeaders);
  if (verifySub1.data?.status !== 'Rejected') {
    throw new Error(`Backend durumu Rejected olmadı! Durum: ${verifySub1.data?.status}`);
  }
  if (verifySub1.data?.rejectionReason !== 'Vergi levhası ve yetkili iletişim telefonu güncellenmelidir.') {
    throw new Error(`rejectionReason doğru kaydedilmedi! Gelen: ${verifySub1.data?.rejectionReason}`);
  }
  if (verifySub1.data?.editableFields !== 'taxId,phone') {
    throw new Error(`editableFields doğru kaydedilmedi! Gelen: ${verifySub1.data?.editableFields}`);
  }
  console.log('  [OK] Pending başvuru başarıyla Rejected yapıldı, rejectionReason ve editableFields veritabanında doğrulandı.');
  passedTests++;

  // 2.8 Geçerli Reddetme İşlemi 2 (InReview -> Rejected, Tek Alan: certificate)
  const validReject2 = await httpPost(`/odata/v4/approval/Submissions(${testInReviewId})/reject`, {
    rejectionReason: 'Yüklenen sertifika belgesinin geçerlilik tarihi dolmuştur.',
    editableFields: 'certificate'
  }, approverHeaders);
  if (validReject2.status !== 200) {
    throw new Error(`InReview başvuru reddedilemedi! Status: ${validReject2.status}`);
  }
  const verifySub2 = await httpGet(`/odata/v4/approval/Submissions(${testInReviewId})`, approverHeaders);
  if (verifySub2.data?.status !== 'Rejected' || verifySub2.data?.editableFields !== 'certificate') {
    throw new Error('InReview başvuru red doğrulaması başarısız!');
  }
  console.log('  [OK] InReview başvuru başarıyla Rejected yapıldı, "certificate" alanı doğrulandı.');
  passedTests++;

  // 2.9 Regresyon: 6.4-A Manuel Onay İşlemi Bozulmadı mı?
  // Yeni bir Pending başvuru oluşturup approve çağıralım
  const testRegPendingId = '80000000-0000-4000-8000-000000000005';
  await cds.db.run(INSERT.into(Submissions).entries({
    ID: testRegPendingId,
    supplier_ID: testSupplierId,
    companyName: 'Regression Check Ltd.',
    contactPerson: 'Test Person',
    category: 'Hardware',
    status: 'Pending',
    submissionDate: new Date().toISOString()
  }));
  const regApproveRes = await httpPost(`/odata/v4/approval/Submissions(${testRegPendingId})/approve`, {}, approverHeaders);
  if (regApproveRes.status !== 200 || regApproveRes.data?.status !== 'Approved') {
    throw new Error('REGRESYON HATASI: 6.4-A Manuel onay işlemi bozulmuş!');
  }
  console.log('  [OK] Regresyon Kontrolü: 6.4-A Manuel onay akışı kusursuz çalışmaya devam ediyor.');
  passedTests++;

  server.close();

  console.log('\n================================================================');
  console.log(`✅ TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${passedTests}/${passedTests} TEST GEÇTİ)`);
  console.log('   FAZ 6.4-B: MANUEL RED AKIŞI %100 DOĞRULANDI.');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ:', err);
  process.exit(1);
});
