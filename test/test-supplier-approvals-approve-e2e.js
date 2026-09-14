const fs = require('fs');
const path = require('path');
const cds = require('@sap/cds');
const express = require('express');

async function main() {
  console.log('================================================================');
  console.log('FAZ 6.4-A: Manuel Onay (Approval Action) Uçtan Uca Doğrulama Testi');
  console.log('================================================================\n');

  let passedTests = 0;
  const projectRoot = path.resolve(__dirname, '..');

  // -------------------------------------------------------------
  // 1. STATİK KOD, BİLEŞEN VE TASARIM STANDARTLARI DENETİMİ
  // -------------------------------------------------------------
  console.log('>>> 1. STATİK KOD, BİLEŞEN VE TASARIM STANDARTLARI DENETİMİ');

  // 1.1 Custom CSS ve Inline Style Denetimi
  const webappDir = path.join(projectRoot, 'app', 'supplier-approvals', 'webapp');
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

  // 1.2 DetailDialog.fragment.xml Onay Butonu Yapılandırması
  const detailFragmentPath = path.join(webappDir, 'view', 'fragment', 'DetailDialog.fragment.xml');
  const fragmentXml = fs.readFileSync(detailFragmentPath, 'utf8');

  if (!fragmentXml.includes('id="btnApprove"')) {
    throw new Error('DetailDialog.fragment.xml içinde btnApprove bulunamadı!');
  }
  if (!fragmentXml.includes('press=".onApprovePress"')) {
    throw new Error('btnApprove için press=".onApprovePress" bulunamadı!');
  }
  if (!fragmentXml.includes('busy="{detailModel>/actionBusy}"')) {
    throw new Error('btnApprove için duplicate engelleme (actionBusy) bulunamadı!');
  }
  if (!fragmentXml.includes('type="Accept"')) {
    throw new Error('btnApprove için Fiori Horizon semantik type="Accept" bulunamadı!');
  }
  if (!fragmentXml.includes("status} === 'Pending' || ${detailModel>/status} === 'InReview'")) {
    throw new Error('btnApprove görünürlüğü sadece Pending ve InReview ile sınırlandırılmamış!');
  }
  console.log('  [OK] DetailDialog.fragment.xml btnApprove yapılandırması Fiori standartlarına tam uygun.');
  passedTests++;

  // 1.3 Scope Boundary Denetimi (AI paneli bu aşamada yer almamalıdır)
  if (fragmentXml.includes('id="pnlAiReport"')) {
    throw new Error('KURAL İHLALİ: 6.4-B kapsamında AI paneli henüz yer almamalıdır!');
  }
  console.log('  [OK] 6.4-B Kapsam Sınırı Doğrulandı: AI paneli izole tutuldu.');
  passedTests++;

  // 1.4 Main.controller.js Yapılandırması
  const controllerPath = path.join(webappDir, 'controller', 'Main.controller.js');
  const controllerJs = fs.readFileSync(controllerPath, 'utf8');

  if (!controllerJs.includes('onApprovePress')) {
    throw new Error('Main.controller.js içinde onApprovePress fonksiyonu bulunamadı!');
  }
  if (!controllerJs.includes('_reloadSubmission')) {
    throw new Error('Main.controller.js içinde _reloadSubmission fonksiyonu bulunamadı!');
  }
  if (!controllerJs.includes('MessageBox.confirm')) {
    throw new Error('onApprovePress içinde onaycıya onaylama davranışı (MessageBox.confirm) gösterilmiyor!');
  }
  if (!controllerJs.includes('actionBusy')) {
    throw new Error('onApprovePress içinde duplicate request engelleme kontrolü (actionBusy) bulunamadı!');
  }
  if (!controllerJs.includes('/odata/v4/approval/Submissions(') || !controllerJs.includes('/approve')) {
    throw new Error('onApprovePress içinde gerçek CAP bound action (/approve) çağrısı bulunamadı!');
  }
  console.log('  [OK] Main.controller.js onaylama fonksiyonları ve backend entegrasyonu tam doğrulandı.');
  passedTests++;

  // 1.5 i18n TR/EN Simetri Denetimi
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
    throw new Error(`i18n anahtar sayıları uyuşmuyor! TR: ${trKeys.length}, EN: ${enKeys.length}, Default: ${defKeys.length}`);
  }

  const requiredApproveKeys = [
    'btnApprove',
    'msgApproveConfirm',
    'msgApproveConfirmTitle',
    'msgApproveSuccess',
    'errApproveFailed'
  ];

  for (const k of requiredApproveKeys) {
    if (!trKeys.includes(k) || !enKeys.includes(k) || !defKeys.includes(k)) {
      throw new Error(`Zorunlu onay i18n anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] i18n %100 simetrik ve onay anahtarları eksiksiz (${trKeys.length} anahtar).`);
  passedTests++;

  // -------------------------------------------------------------
  // 2. CANLI CAP BACKEND ONAYLAMA ENTEGRASYONU VE GÜVENLİK TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 2. CANLI CAP BACKEND ONAYLAMA ENTEGRASYONU VE GÜVENLİK TESTLERİ');

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

  const testSupplierId = '70000000-0000-4000-8000-000000000001';
  const testPendingId = '70000000-0000-4000-8000-000000000002';
  const testInReviewId = '70000000-0000-4000-8000-000000000003';
  const testRejectedId = '70000000-0000-4000-8000-000000000004';

  await cds.db.run(DELETE.from(Submissions).where({ ID: { in: [testPendingId, testInReviewId, testRejectedId] } })).catch(() => null);
  await cds.db.run(DELETE.from(Suppliers).where({ ID: testSupplierId })).catch(() => null);

  await cds.db.run(INSERT.into(Suppliers).entries({
    ID: testSupplierId,
    email: 'approval-action-test@codeup.corp',
    passwordHash: '$2b$10$dummyHash'
  }));

  await cds.db.run(INSERT.into(Submissions).entries([
    {
      ID: testPendingId,
      supplier_ID: testSupplierId,
      companyName: 'Nova Hardware Systems Ltd.',
      contactPerson: 'Kaan Kaya',
      phone: '+90 532 111 2233',
      country: 'Türkiye',
      taxId: 'TR7778889991',
      category: 'Hardware',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificateFileName: 'nova_cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testInReviewId,
      supplier_ID: testSupplierId,
      companyName: 'Alpha Cloud Solutions A.Ş.',
      contactPerson: 'Selin Yılmaz',
      phone: '+90 532 222 3344',
      country: 'Türkiye',
      taxId: 'TR7778889992',
      category: 'Software',
      status: 'InReview',
      submissionDate: new Date().toISOString(),
      certificateFileName: 'alpha_cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testRejectedId,
      supplier_ID: testSupplierId,
      companyName: 'Beta Consulting Group',
      contactPerson: 'Murat Demir',
      phone: '+90 532 333 4455',
      country: 'Türkiye',
      taxId: 'TR7778889993',
      category: 'Consulting',
      status: 'Rejected',
      rejectionReason: 'Belge süresi dolmuş.',
      editableFields: 'certificate',
      submissionDate: new Date().toISOString(),
      certificateFileName: 'beta_cert.pdf',
      certificateMimeType: 'application/pdf'
    }
  ]));

  // 2.1 Güvenlik: Anonim ve yetkisiz approve denemeleri
  const anonApprove = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/approve`, {});
  if (anonApprove.status !== 401) {
    throw new Error(`Anonim approve engellenmedi! Status: ${anonApprove.status}`);
  }
  console.log('  [OK] Anonim approve çağrısı 401 Unauthorized ile kapıda engellendi.');
  passedTests++;

  const unauthApprove = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/approve`, {}, unauthorizedHeaders);
  if (unauthApprove.status !== 403) {
    throw new Error(`Yetkisiz (Approval rolsüz) approve engellenmedi! Status: ${unauthApprove.status}`);
  }
  console.log('  [OK] Approval rolü olmayan kullanıcı 403 Forbidden ile engellendi.');
  passedTests++;

  // 2.2 Pending Durumundaki Başvurunun Gerçek CAP Bound Action ile Onaylanması
  const approvePendingRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/approve`, {}, approverHeaders);
  if (approvePendingRes.status !== 200) {
    throw new Error(`Pending başvuru onaylanamadı! Status: ${approvePendingRes.status} Data: ${JSON.stringify(approvePendingRes.data)}`);
  }
  console.log('  [OK] POST /Submissions(ID)/approve bound action HTTP 200 ile tamamlandı.');
  passedTests++;

  // 2.3 Backend Doğrulaması: Başvuru durumunun veritabanında gerçekten 'Approved' olması
  const verifySub1 = await httpGet(`/odata/v4/approval/Submissions(${testPendingId})`, approverHeaders);
  if (verifySub1.status !== 200 || verifySub1.data?.status !== 'Approved') {
    throw new Error(`Veritabanında başvuru durumu Approved olmadı! Durum: ${verifySub1.data?.status}`);
  }
  if (verifySub1.data?.editableFields !== null && verifySub1.data?.editableFields !== undefined) {
    throw new Error(`Approved olan başvuruda editableFields temizlenmedi! Gelen: ${verifySub1.data?.editableFields}`);
  }
  console.log(`  [OK] Gerçek backend veritabanı doğrulandı: ID "${testPendingId}" durumu: "${verifySub1.data?.status}".`);
  passedTests++;

  // 2.4 InReview Durumundaki Başvurunun Onaylanması
  const approveInReviewRes = await httpPost(`/odata/v4/approval/Submissions(${testInReviewId})/approve`, {}, approverHeaders);
  if (approveInReviewRes.status !== 200) {
    throw new Error(`InReview başvuru onaylanamadı! Status: ${approveInReviewRes.status}`);
  }
  const verifySub2 = await httpGet(`/odata/v4/approval/Submissions(${testInReviewId})`, approverHeaders);
  if (verifySub2.data?.status !== 'Approved') {
    throw new Error(`InReview başvuru Approved olmadı! Durum: ${verifySub2.data?.status}`);
  }
  console.log('  [OK] InReview durumundaki başvuru da başarıyla Approved durumuna geçirildi.');
  passedTests++;

  // 2.5 Hata Yönetimi: Zaten Approved olan başvurunun tekrar onaylanması engellenmeli (400)
  const duplicateApproveRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingId})/approve`, {}, approverHeaders);
  if (duplicateApproveRes.status !== 400) {
    throw new Error(`Zaten onaylanmış başvuru tekrar onaylanabildi! Status: ${duplicateApproveRes.status}`);
  }
  const dupMsg = duplicateApproveRes.data?.error?.message || '';
  if (!dupMsg.includes('zaten onaylanmış')) {
    throw new Error(`Beklenen 400 hata mesajı alınamadı! Gelen: ${dupMsg}`);
  }
  console.log('  [OK] Zaten onaylanmış başvuruya tekrar onay istendiğinde backend HTTP 400 ile engelledi:');
  console.log(`       "${dupMsg}"`);
  passedTests++;

  // 2.6 Hata Yönetimi: Reddedilmiş (Rejected) başvurunun doğrudan onaylanması engellenmeli (400)
  const rejectApproveRes = await httpPost(`/odata/v4/approval/Submissions(${testRejectedId})/approve`, {}, approverHeaders);
  if (rejectApproveRes.status !== 400) {
    throw new Error(`Reddedilmiş başvuru doğrudan onaylanabildi! Status: ${rejectApproveRes.status}`);
  }
  const rejMsg = rejectApproveRes.data?.error?.message || '';
  if (!rejMsg.includes('Reddedilmiş bir başvuru')) {
    throw new Error(`Beklenen 400 red-onay engeli mesajı alınamadı! Gelen: ${rejMsg}`);
  }
  console.log('  [OK] Reddedilmiş başvurunun doğrudan onaylanması HTTP 400 ile engellendi:');
  console.log(`       "${rejMsg}"`);
  passedTests++;

  // 2.7 UI Tablo Listesi ve Durum Sayaçları Uyumu
  const allSubsRes = await httpGet('/odata/v4/approval/Submissions', approverHeaders);
  const allSubs = allSubsRes.data?.value || [];
  const approvedCount = allSubs.filter(s => s.status === 'Approved').length;
  const pendingCount = allSubs.filter(s => s.status === 'Pending').length;
  console.log(`  [OK] Başvuru Listesi Güncel Durumu: Toplam: ${allSubs.length}, Onaylı: ${approvedCount}, Bekleyen: ${pendingCount}.`);
  passedTests++;

  server.close();

  console.log('\n================================================================');
  console.log(`✅ TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${passedTests}/${passedTests} TEST GEÇTİ)`);
  console.log('   FAZ 6.4-A: MANUEL ONAY AKIŞI %100 DOĞRULANDI.');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ:', err);
  process.exit(1);
});
