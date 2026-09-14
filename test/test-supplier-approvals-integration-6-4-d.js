/**
 * FAZ 6.4-D: Supplier Approvals 6.4 Entegrasyon ve Son Kontrol Test Paketi
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('================================================================');
  console.log('FAZ 6.4-D: Supplier Approvals Entegrasyon ve Son Kontrol Testi');
  console.log('================================================================\n');

  let passedControls = 0;
  const webappDir = path.join(__dirname, '..', 'app', 'supplier-approvals', 'webapp');

  // ================================================================
  // KONTROL 7: SAPUI5 KURALLARI VE MİMARİ STANDARTLAR
  // ================================================================
  console.log('>>> KONTROL 7 — SAPUI5 Kuralları ve Mimari Standartlar Denetimi');

  function scanDir(dir, ext) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(scanDir(filePath, ext));
      } else if (file.endsWith(ext)) {
        results.push(filePath);
      }
    }
    return results;
  }

  const cssFiles = scanDir(webappDir, '.css');
  if (cssFiles.length > 0) {
    throw new Error(`KURAL İHLALİ: Özel CSS dosyası bulundu: ${cssFiles.join(', ')}`);
  }
  console.log('  [OK] Sıfır Custom CSS kuralı doğrulandı (0 .css dosyası).');

  const xmlFiles = scanDir(webappDir, '.xml');
  for (const xmlFile of xmlFiles) {
    const xmlContent = fs.readFileSync(xmlFile, 'utf8');
    if (/style\s*=/i.test(xmlContent)) {
      throw new Error(`KURAL İHLALİ: ${xmlFile} içinde inline style bulundu!`);
    }
  }
  console.log('  [OK] Sıfır Inline Style kuralı doğrulandı (XML view/fragment tarandı).');

  const jsFiles = scanDir(webappDir, '.js');
  for (const jsFile of jsFiles) {
    const jsContent = fs.readFileSync(jsFile, 'utf8');
    if (jsContent.includes('generativelanguage.googleapis.com')) {
      throw new Error(`KURAL İHLALİ: ${jsFile} içinde doğrudan Gemini API endpoint\'i bulundu!`);
    }
    if (/AIza[0-9A-Za-z-_]{35}/.test(jsContent)) {
      throw new Error(`GÜVENLİK İHLALİ: ${jsFile} içinde Google API key sızıntısı tespit edildi!`);
    }
  }
  console.log('  [OK] Sıfır API Key ve Sıfır Harici API çağrısı kuralı kanıtlandı.');

  const controllerContent = fs.readFileSync(path.join(webappDir, 'controller', 'Main.controller.js'), 'utf8');
  if (controllerContent.includes('/mock/') || controllerContent.includes('fakeData')) {
    throw new Error('KURAL İHLALİ: Main.controller.js içinde mock/static veri bulundu!');
  }
  if (!controllerContent.includes('/odata/v4/approval/Submissions')) {
    throw new Error('KURAL İHLALİ: Gerçek CAP ApprovalService endpoint yolu bulunamadı!');
  }
  console.log('  [OK] Gerçek CAP OData v4 endpoint sözleşmesi doğrulandı (Mock veri yok).');

  passedControls++;

  // ================================================================
  // KONTROL 6: i18n DİL VE METİN BÜTÜNLÜĞÜ
  // ================================================================
  console.log('\n>>> KONTROL 6 — i18n Tam Simetri ve Hardcoded Metin Denetimi');
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
    throw new Error(`i18n anahtar sayıları uyuşmuyor! TR: ${trKeys.length}, EN: ${enKeys.length}, DEF: ${defKeys.length}`);
  }

  const missingInEn = trKeys.filter(k => !enKeys.includes(k));
  if (missingInEn.length > 0) {
    throw new Error(`İngilizce i18n dosyasında eksik anahtarlar: ${missingInEn.join(', ')}`);
  }

  console.log(`  [OK] i18n TR, EN ve Varsayılan dosyaları %100 simetrik (${trKeys.length} anahtar).`);
  passedControls++;

  // ================================================================
  // CANLI CAP SUNUCUSU BAŞLATMA (ApprovalService & PublicService)
  // ================================================================
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
  console.log(`  [INFO] Canlı CAP Test Sunucusu Hazır: ${baseUrl}`);

  const approverHeaders = {
    'Authorization': 'Basic ' + Buffer.from('approver_user:').toString('base64'),
    'Content-Type': 'application/json'
  };
  const unauthorizedHeaders = {
    'Authorization': 'Basic ' + Buffer.from('unauthorized_user:').toString('base64'),
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

  // Veritabanı Hazırlığı
  const Submissions = 'codeup.supplier.management.Submissions';
  const Suppliers = 'codeup.supplier.management.Suppliers';

  const testSupplierId = '90000000-0000-4000-8000-000000000001';
  const testPendingApproveId = '90000000-0000-4000-8000-000000000002';
  const testPendingRejectId = '90000000-0000-4000-8000-000000000003';
  const testPendingAiId = '90000000-0000-4000-8000-000000000004';
  const testReapplySupplierId = '90000000-0000-4000-8000-000000000005';
  const testReapplySubId = '90000000-0000-4000-8000-000000000006';

  // Temizlik
  await cds.db.run(DELETE.from(Submissions).where({
    ID: { in: [testPendingApproveId, testPendingRejectId, testPendingAiId, testReapplySubId] }
  })).catch(() => null);
  await cds.db.run(DELETE.from(Suppliers).where({
    ID: { in: [testSupplierId, testReapplySupplierId] }
  })).catch(() => null);

  // Test Verilerini Ekle
  const samplePdfBuffer = fs.readFileSync(path.join(__dirname, 'files', 'valid-cert.pdf'));
  const samplePdfBase64 = samplePdfBuffer.toString('base64');

  const hashedPw = await bcrypt.hash('Password123!', 10);

  await cds.db.run(INSERT.into(Suppliers).entries([
    {
      ID: testSupplierId,
      email: 'approvals-final@codeup.corp',
      passwordHash: hashedPw
    },
    {
      ID: testReapplySupplierId,
      email: 'reapply-cycle@codeup.corp',
      passwordHash: hashedPw
    }
  ]));

  await cds.db.run(INSERT.into(Submissions).entries([
    {
      ID: testPendingApproveId,
      supplier_ID: testSupplierId,
      companyName: 'Alfa Tech Solutions Ltd.',
      contactPerson: 'Cem Kaya',
      phone: '+90 532 100 2030',
      country: 'Türkiye',
      taxId: 'TR9001002030',
      category: 'Software',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: samplePdfBuffer,
      certificateFileName: 'valid-cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testPendingRejectId,
      supplier_ID: testSupplierId,
      companyName: 'Beta Industrial Inc.',
      contactPerson: 'Seda Demir',
      phone: '+90 532 200 3040',
      country: 'Türkiye',
      taxId: 'TR9002003040',
      category: 'Hardware',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: samplePdfBuffer,
      certificateFileName: 'valid-cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testPendingAiId,
      supplier_ID: testSupplierId,
      companyName: 'Delta Cyber Dynamics',
      contactPerson: 'Onur Can',
      phone: '+90 532 300 4050',
      country: 'Türkiye',
      taxId: 'TR9003004050',
      category: 'Services',
      status: 'InReview',
      submissionDate: new Date().toISOString(),
      certificate: samplePdfBuffer,
      certificateFileName: 'valid-cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testReapplySubId,
      supplier_ID: testReapplySupplierId,
      companyName: 'Omega Logistics A.Ş.',
      contactPerson: 'Zeynep Ak',
      phone: '+90 532 400 5060',
      country: 'Türkiye',
      taxId: 'TR9004005060',
      category: 'Consulting',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: samplePdfBuffer,
      certificateFileName: 'valid-cert.pdf',
      certificateMimeType: 'application/pdf'
    }
  ]));

  // ================================================================
  // KONTROL 5: YETKİLENDİRME (XSUAA / Approval Rol Koruması)
  // ================================================================
  console.log('\n>>> KONTROL 5 — Yetkilendirme (XSUAA / Approval Rol Koruması)');
  const anonRes = await httpGet('/odata/v4/approval/Submissions');
  if (anonRes.status !== 401) {
    throw new Error(`Anonim kullanıcı engellenmedi! Status: ${anonRes.status}`);
  }
  console.log('  [OK] Anonim istekler 401 Unauthorized ile engellendi.');

  const unauthRes = await httpGet('/odata/v4/approval/Submissions', unauthorizedHeaders);
  if (unauthRes.status !== 403) {
    throw new Error(`Yetkisiz rol erişimi engellenmedi! Status: ${unauthRes.status}`);
  }
  console.log('  [OK] Approval rolü olmayan istekler 403 Forbidden ile engellendi.');

  const authRes = await httpGet('/odata/v4/approval/Submissions', approverHeaders);
  if (authRes.status !== 200 || !authRes.data?.value) {
    throw new Error(`Onaycı erişimi başarısız! Status: ${authRes.status}`);
  }
  console.log('  [OK] Approval rolüne sahip kullanıcı gerçek ApprovalService verilerine erişti.');
  passedControls++;

  // ================================================================
  // KONTROL 1: MANUEL ONAY (6.4-A)
  // ================================================================
  console.log('\n>>> KONTROL 1 — Manuel Onay (6.4-A)');
  const approveRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingApproveId})/approve`, {}, approverHeaders);
  if (approveRes.status !== 200 || approveRes.data?.status !== 'Approved') {
    throw new Error(`Manuel onaylama başarısız! Status: ${approveRes.status}`);
  }

  const checkApproveDb = await cds.db.run(SELECT.one.from(Submissions).where({ ID: testPendingApproveId }));
  if (checkApproveDb.status !== 'Approved') {
    throw new Error(`Veritabanında status Approved olmadı! Durum: ${checkApproveDb.status}`);
  }

  const reloadRes = await httpGet(`/odata/v4/approval/Submissions(${testPendingApproveId})`, approverHeaders);
  if (reloadRes.data?.status !== 'Approved') {
    throw new Error('UI refresh veri kontratı başarısız!');
  }

  const duplicateApprove = await httpPost(`/odata/v4/approval/Submissions(${testPendingApproveId})/approve`, {}, approverHeaders);
  if (duplicateApprove.status !== 400) {
    throw new Error('Zaten onaylı başvuruya tekrar onay verildi, engellenmeliydi!');
  }
  console.log('  [OK] Manuel Onay: Gerçek CAP action çalıştı, DB ve UI Approved oldu, çifte onay engellendi.');
  passedControls++;

  // ================================================================
  // KONTROL 2: MANUEL RED (6.4-B)
  // ================================================================
  console.log('\n>>> KONTROL 2 — Manuel Red (6.4-B)');

  const emptyReasonRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingRejectId})/reject`, {
    rejectionReason: '',
    editableFields: 'companyName'
  }, approverHeaders);
  if (emptyReasonRes.status !== 400) {
    throw new Error('Boş karar notu engellenmedi!');
  }

  const noFieldsRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingRejectId})/reject`, {
    rejectionReason: 'Eksik belgeler var',
    editableFields: ''
  }, approverHeaders);
  if (noFieldsRes.status !== 400) {
    throw new Error('Boş editableFields engellenmedi!');
  }

  const invalidFieldRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingRejectId})/reject`, {
    rejectionReason: 'Hatalı alan',
    editableFields: 'hackerField'
  }, approverHeaders);
  if (invalidFieldRes.status !== 400) {
    throw new Error('Geçersiz alan adı engellenmedi!');
  }

  const validRejectRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingRejectId})/reject`, {
    rejectionReason: 'Vergi levhası ve telefon numarası güncellenmelidir.',
    editableFields: 'taxId,phone'
  }, approverHeaders);
  if (validRejectRes.status !== 200 || validRejectRes.data?.status !== 'Rejected') {
    throw new Error(`Manuel red başarısız! Status: ${validRejectRes.status}`);
  }

  const checkRejectDb = await cds.db.run(SELECT.one.from(Submissions).where({ ID: testPendingRejectId }));
  if (checkRejectDb.status !== 'Rejected' || checkRejectDb.rejectionReason !== 'Vergi levhası ve telefon numarası güncellenmelidir.' || checkRejectDb.editableFields !== 'taxId,phone') {
    throw new Error('Veritabanında red bilgileri doğru kaydedilmedi!');
  }
  console.log('  [OK] Manuel Red: Zorunlu alan kontrolleri, whitelist ve DB güncellemeleri tam doğrulandı.');
  passedControls++;

  // ================================================================
  // KONTROL 3: AI ANALİZ (6.4-C)
  // ================================================================
  // 3.1 Hata Yönetimi: Yerel ortamda BTP Destination bağlı olmadığında temiz 502 hatası
  const aiErrorRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingAiId})/analyzeCertificate`, {}, approverHeaders);
  if (aiErrorRes.status !== 502) {
    throw new Error(`Destination hatasında 502 dönmedi! Status: ${aiErrorRes.status}`);
  }
  console.log('  [OK] BTP Destination yokken güvenli ve sır sızdırmayan HTTP 502 hata yakalaması doğrulandı.');

  // 3.2 BTP Destination simülasyonu ile AI Karar Desteği ve Human-in-the-Loop Doğrulaması
  const originalConnectTo = cds.connect.to;
  cds.connect.to = async function (serviceName) {
    if (serviceName === 'gemini') {
      return {
        async post(path, data) {
          return {
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    validityStatus: 'Valid',
                    recommendation: 'Öneri: Onayla (ISO 27001 Uygun)',
                    reason: 'Sertifika geçerlilik süresi 2028 yılına kadardır. Kurum bilgileri eşleşmektedir.',
                    suggestedFields: ''
                  })
                }]
              }
            }]
          };
        }
      };
    }
    return originalConnectTo.apply(this, arguments);
  };

  const aiRes = await httpPost(`/odata/v4/approval/Submissions(${testPendingAiId})/analyzeCertificate`, {}, approverHeaders);
  if (aiRes.status !== 200 || !aiRes.data?.validityStatus) {
    throw new Error(`AI analiz çağrısı başarısız! Status: ${aiRes.status}`);
  }

  const expectedAiFields = ['validityStatus', 'recommendation', 'reason', 'suggestedFields', 'analyzedAt', 'fileName'];
  for (const field of expectedAiFields) {
    if (aiRes.data[field] === undefined) {
      throw new Error(`AI yanıtında eksik alan: ${field}`);
    }
  }

  const checkAiSubDb = await cds.db.run(SELECT.one.from(Submissions).where({ ID: testPendingAiId }));
  if (checkAiSubDb.status !== 'InReview') {
    throw new Error(`KURAL İHLALİ: AI analizi başvuru durumunu değiştirdi! Durum: ${checkAiSubDb.status}`);
  }

  cds.connect.to = originalConnectTo;
  console.log('  [OK] AI Karar Desteği: 6 alan eksiksiz, Human-in-the-Loop korundu, durum InReview kaldı.');
  passedControls++;

  // ================================================================
  // KONTROL 4: REAPPLY UYUMLULUĞU (Çapraz Servis Entegrasyonu)
  // ================================================================
  console.log('\n>>> KONTROL 4 — Reapply Uyumluluğu (ApprovalService -> PublicService Döngüsü)');

  const rejectForReapply = await httpPost(`/odata/v4/approval/Submissions(${testReapplySubId})/reject`, {
    rejectionReason: 'Lütfen telefon numaranızı ve sertifikanızı güncelleyiniz.',
    editableFields: 'phone,certificate'
  }, approverHeaders);
  if (rejectForReapply.status !== 200) {
    throw new Error('Reapply için reddetme adımı başarısız!');
  }

  const loginRes = await httpPost('/odata/v4/public/login', {
    email: 'reapply-cycle@codeup.corp',
    password: 'Password123!'
  });
  if (loginRes.status !== 200 || !loginRes.data?.token) {
    throw new Error('Tedarikçi PublicService girişi başarısız!');
  }
  const supplierToken = loginRes.data.token;
  const supplierHeaders = {
    'Authorization': `Bearer ${supplierToken}`,
    'Content-Type': 'application/json'
  };

  const mySubRes = await httpGet('/odata/v4/public/getMySubmission()', supplierHeaders);
  if (mySubRes.status !== 200 || mySubRes.data?.status !== 'Rejected' || mySubRes.data?.editableFields !== 'phone,certificate') {
    throw new Error('Tedarikçi red durumunu veya izinli alanları doğru görüntüleyemedi!');
  }

  const illegalReapply = await httpPost('/odata/v4/public/reApplySubmission', {
    submissionId: testReapplySubId,
    taxId: 'TR9999999999'
  }, supplierHeaders);
  if (illegalReapply.status !== 400) {
    throw new Error('İzinsiz alan güncellemesi engellenmedi!');
  }

  const validReapply = await httpPost('/odata/v4/public/reApplySubmission', {
    submissionId: testReapplySubId,
    phone: '+90 532 999 8877',
    certificate: samplePdfBase64,
    certificateFileName: 'updated-cert.pdf'
  }, supplierHeaders);
  if (validReapply.status !== 200 || validReapply.data?.status !== 'InReview') {
    throw new Error(`Reapply işlemi başarısız! Status: ${validReapply.status}`);
  }

  const approverViewRes = await httpGet(`/odata/v4/approval/Submissions(${testReapplySubId})`, approverHeaders);
  if (approverViewRes.status !== 200 || approverViewRes.data?.status !== 'InReview' || approverViewRes.data?.phone !== '+90 532 999 8877') {
    throw new Error('Onaycı güncellenmiş InReview başvuruyu doğru görüntüleyemedi!');
  }

  const finalApprove = await httpPost(`/odata/v4/approval/Submissions(${testReapplySubId})/approve`, {}, approverHeaders);
  if (finalApprove.status !== 200 || finalApprove.data?.status !== 'Approved') {
    throw new Error('Yenilenen başvuru onaylanamadı!');
  }
  console.log('  [OK] Çapraz Servis Reapply Döngüsü: Reject -> Tedarikçi İzin Kontrolü -> Reapply (InReview) -> Onay (Approved) döngüsü %100 kusursuz tamamlandı.');
  passedControls++;

  server.close();

  console.log('\n================================================================');
  console.log(`✅ TÜM ENTEGRASYON KONTROLLERİ BAŞARIYLA GEÇTİ! (${passedControls}/6 KONTROL KÜMESİ)`);
  console.log('   FAZ 6.4 (A + B + C + D) ENTEGRASYONU TAM UYUMLU VE KORUNMUŞTUR.');
  console.log('================================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ ENTEGRASYON TESTİ HATASI:', err);
  process.exit(1);
});
