const fs = require('fs');
const path = require('path');
const cds = require('@sap/cds');
const express = require('express');

async function main() {
  console.log('================================================================');
  console.log('FAZ 6.4-C: AI Sertifika Analizi Uçtan Uca Doğrulama Testi');
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

  // 1.2 Frontend Gizlilik ve Güvenlik Denetimi (Sıfır API Key / Secret)
  const jsFiles = scanFiles(webappDir, '.js');
  for (const jf of jsFiles) {
    const content = fs.readFileSync(jf, 'utf8');
    if (content.includes('AIza') || content.includes('api_key') || content.includes('apiKey') || content.includes('gemini.googleapis.com')) {
      throw new Error(`GÜVENLİK İHLALİ: ${jf} içinde API anahtarı veya doğrudan Gemini endpoint bulundu!`);
    }
  }
  console.log('  [OK] Frontend kodunda sıfır Gemini API key / credential kuralı kanıtlandı.');
  passedTests++;

  // 1.3 DetailDialog.fragment.xml AI Paneli ve Buton Yapılandırması
  const detailFragmentPath = path.join(webappDir, 'view', 'fragment', 'DetailDialog.fragment.xml');
  const detailXml = fs.readFileSync(detailFragmentPath, 'utf8');

  if (!detailXml.includes('id="btnAnalyzeAi"')) {
    throw new Error('DetailDialog içinde btnAnalyzeAi bulunamadı!');
  }
  if (!detailXml.includes('press=".onAnalyzeCertificate"')) {
    throw new Error('btnAnalyzeAi için press=".onAnalyzeCertificate" bulunamadı!');
  }
  if (!detailXml.includes('busy="{detailModel>/aiBusy}"')) {
    throw new Error('btnAnalyzeAi için duplicate engelleme (aiBusy) bulunamadı!');
  }
  if (!detailXml.includes('id="pnlAiReport"')) {
    throw new Error('DetailDialog içinde pnlAiReport paneli bulunamadı!');
  }
  if (!detailXml.includes('visible="{detailModel>/hasAiReport}"')) {
    throw new Error('pnlAiReport paneli visible="{detailModel>/hasAiReport}" ile bağlanmamış!');
  }
  if (!detailXml.includes('aiHumanInTheLoopDisclaimer')) {
    throw new Error('pnlAiReport içinde Human-in-the-Loop uyarı şeridi bulunamadı!');
  }

  // 6 Alanın XML Kontrolleri
  const expectedAiFields = [
    'txtAiValidityStatus',
    'txtAiRecommendation',
    'txtAiReason',
    'txtAiSuggestedFields',
    'txtAiFileName',
    'txtAiAnalyzedAt'
  ];
  for (const f of expectedAiFields) {
    if (!detailXml.includes(`id="${f}"`)) {
      throw new Error(`DetailDialog içinde AI rapor alanı ${f} bulunamadı!`);
    }
  }

  // AI Red Önerisi Hızlı Aksiyon Butonu
  if (!detailXml.includes('id="btnQuickRejectWithAi"')) {
    throw new Error('DetailDialog içinde btnQuickRejectWithAi butonu bulunamadı!');
  }

  // Regresyon: Onayla ve Reddet butonları yerinde mi?
  if (!detailXml.includes('id="btnApprove"') || !detailXml.includes('id="btnReject"')) {
    throw new Error('DetailDialog içinde Onayla veya Reddet butonu kaybolmuş!');
  }
  console.log('  [OK] DetailDialog.fragment.xml AI Karar Destek paneli ve 6 alan eksiksiz doğrulandı.');
  passedTests++;

  // 1.4 Main.controller.js AI Fonksiyonları Denetimi
  const controllerPath = path.join(webappDir, 'controller', 'Main.controller.js');
  const controllerJs = fs.readFileSync(controllerPath, 'utf8');

  if (!controllerJs.includes('onAnalyzeCertificate')) {
    throw new Error('Main.controller.js içinde onAnalyzeCertificate fonksiyonu bulunamadı!');
  }
  if (!controllerJs.includes('/odata/v4/approval/Submissions(') || !controllerJs.includes('/analyzeCertificate')) {
    throw new Error('onAnalyzeCertificate içinde gerçek CAP bound analyzeCertificate çağrısı bulunamadı!');
  }
  if (!controllerJs.includes('aiBusy')) {
    throw new Error('onAnalyzeCertificate içinde aiBusy yükleme ve kilit bayrağı bulunamadı!');
  }
  console.log('  [OK] Main.controller.js AI kontrolör metodları ve duplicate engelleme doğrulandı.');
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

  const requiredAiKeys = [
    'btnAnalyzeAi', 'aiReportTitle', 'aiHumanInTheLoopDisclaimer',
    'aiValidityStatus', 'aiRecommendation', 'aiReason',
    'aiSuggestedFields', 'aiAnalyzedAt', 'aiFileName',
    'aiAnalyzing', 'msgAiAnalysisSuccess', 'errAiDestinationFailed',
    'errAiNoCertificate', 'btnQuickRejectWithAi'
  ];

  for (const k of requiredAiKeys) {
    if (!trKeys.includes(k) || !enKeys.includes(k) || !defKeys.includes(k)) {
      throw new Error(`Zorunlu AI i18n anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] i18n AI anahtarları eksiksiz ve %100 simetrik (${trKeys.length} anahtar).`);
  passedTests++;

  // -------------------------------------------------------------
  // 2. CANLI CAP BACKEND AI ANALİZ ENTEGRASYONU VE GÜVENLİK TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 2. CANLI CAP BACKEND AI ANALİZ ENTEGRASYONU VE GÜVENLİK TESTLERİ');

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

  const testSupplierId = '60000000-0000-4000-8000-000000000001';
  const testSubValidCert = '60000000-0000-4000-8000-000000000002';
  const testSubExpiredCert = '60000000-0000-4000-8000-000000000003';
  const testSubNoCert = '60000000-0000-4000-8000-000000000004';

  await cds.db.run(DELETE.from(Submissions).where({ ID: { in: [testSubValidCert, testSubExpiredCert, testSubNoCert] } })).catch(() => null);
  await cds.db.run(DELETE.from(Suppliers).where({ ID: testSupplierId })).catch(() => null);

  await cds.db.run(INSERT.into(Suppliers).entries({
    ID: testSupplierId,
    email: 'ai-analysis-test@codeup.corp',
    passwordHash: '$2b$10$dummyHash'
  }));

  const validCertBuffer = fs.readFileSync(path.join(projectRoot, 'test', 'files', 'valid-cert.pdf'));
  const expiredCertBuffer = fs.readFileSync(path.join(projectRoot, 'test', 'files', 'expired-cert.pdf'));

  await cds.db.run(INSERT.into(Submissions).entries([
    {
      ID: testSubValidCert,
      supplier_ID: testSupplierId,
      companyName: 'Quantum AI Systems GmbH',
      contactPerson: 'Zeynep Ay',
      phone: '+90 534 111 2233',
      country: 'Türkiye',
      taxId: 'TR9991112233',
      category: 'Software',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: validCertBuffer,
      certificateFileName: 'valid-cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testSubExpiredCert,
      supplier_ID: testSupplierId,
      companyName: 'Vintage Hardware Corp.',
      contactPerson: 'Can Kaya',
      phone: '+90 534 222 3344',
      country: 'Türkiye',
      taxId: 'TR9992223344',
      category: 'Hardware',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: expiredCertBuffer,
      certificateFileName: 'expired-cert.pdf',
      certificateMimeType: 'application/pdf'
    },
    {
      ID: testSubNoCert,
      supplier_ID: testSupplierId,
      companyName: 'Missing Cert Consultancy',
      contactPerson: 'Ali Veli',
      phone: '+90 534 333 4455',
      country: 'Türkiye',
      taxId: 'TR9993334455',
      category: 'Consulting',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: null,
      certificateFileName: null,
      certificateMimeType: null
    }
  ]));

  // 2.1 Güvenlik: Anonim istek kapıda engellenmeli (401)
  const anonRes = await httpPost(`/odata/v4/approval/Submissions(${testSubValidCert})/analyzeCertificate`, {});
  if (anonRes.status !== 401) {
    throw new Error(`Anonim analyzeCertificate engellenmedi! Status: ${anonRes.status}`);
  }
  console.log('  [OK] Anonim analyzeCertificate çağrısı 401 Unauthorized ile engellendi.');
  passedTests++;

  // 2.2 Güvenlik: Approval rolü olmayan istek engellenmeli (403)
  const unauthRes = await httpPost(`/odata/v4/approval/Submissions(${testSubValidCert})/analyzeCertificate`, {}, unauthorizedHeaders);
  if (unauthRes.status !== 403) {
    throw new Error(`Yetkisiz analyzeCertificate engellenmedi! Status: ${unauthRes.status}`);
  }
  console.log('  [OK] Approval rolü olmayan istek 403 Forbidden ile engellendi.');
  passedTests++;

  // 2.3 Girdi Kontrolü: Sertifikası olmayan başvuruya AI analizi engellenmeli (400)
  const noCertRes = await httpPost(`/odata/v4/approval/Submissions(${testSubNoCert})/analyzeCertificate`, {}, approverHeaders);
  if (noCertRes.status !== 400) {
    throw new Error(`Sertifikasız başvuru AI analizine sokulabildi! Status: ${noCertRes.status}`);
  }
  console.log('  [OK] Sertifikasız başvuru analizi HTTP 400 ile engellendi:', noCertRes.data?.error?.message);
  passedTests++;

  // 2.4 Hata Yönetimi: Yerel ortamda BTP Destination bağlı olmadığında temiz 502 hatası
  const noDestRes = await httpPost(`/odata/v4/approval/Submissions(${testSubValidCert})/analyzeCertificate`, {}, approverHeaders);
  if (noDestRes.status !== 502) {
    throw new Error(`Destination bulunamadığında 502 dönmedi! Status: ${noDestRes.status}`);
  }
  const noDestMsg = noDestRes.data?.error?.message || '';
  if (!noDestMsg.includes('gemini') && !noDestMsg.includes('Destination')) {
    throw new Error(`Beklenen Destination hata mesajı alınamadı: ${noDestMsg}`);
  }
  if (noDestMsg.includes('AIza') || noDestMsg.includes('key=') || noDestMsg.includes('secret')) {
    throw new Error(`GÜVENLİK İHLALİ: Hata mesajında sır/anahtar sızdı: ${noDestMsg}`);
  }
  console.log('  [OK] BTP Destination yokken güvenli ve sır sızdırmayan HTTP 502 hata yakalaması doğrulandı.');
  passedTests++;

  // 2.5 BTP Destination Simülasyonu ile Canlı AI Analizi ve Human-in-the-Loop Doğrulaması
  const originalConnectTo = cds.connect.to;
  let simulatedCertName = 'valid-cert.pdf';

  cds.connect.to = async function (serviceName) {
    if (serviceName === 'gemini') {
      return {
        async post(path, data) {
          if (simulatedCertName === 'expired-cert.pdf') {
            return {
              candidates: [{
                content: {
                  parts: [{
                    text: JSON.stringify({
                      validityStatus: 'Expired',
                      recommendation: 'Öneri: Reddet',
                      reason: 'Sertifikanın geçerlilik süresi 15.01.2024 tarihinde sona ermiştir.',
                      suggestedFields: 'certificate'
                    })
                  }]
                }
              }]
            };
          }

          return {
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    validityStatus: 'Valid',
                    recommendation: 'Öneri: Onayla',
                    reason: 'ISO 27001 kurumsal güvenlik sertifikası geçerlidir. Bitiş tarihi: 2028-12-31.',
                    suggestedFields: ''
                  })
                }]
              }
            }]
          };
        },
        async send(req) {
          return this.post(req.path, req.data);
        }
      };
    }
    return originalConnectTo.apply(this, arguments);
  };

  // 2.5.1 Geçerli Sertifika Analizi (Valid -> Öneri: Onayla)
  simulatedCertName = 'valid-cert.pdf';
  const validAiRes = await httpPost(`/odata/v4/approval/Submissions(${testSubValidCert})/analyzeCertificate`, {}, approverHeaders);
  if (validAiRes.status !== 200) {
    throw new Error(`Geçerli sertifika analizi başarısız! Status: ${validAiRes.status}`);
  }
  const validReport = validAiRes.data;
  if (validReport.validityStatus !== 'Valid' || validReport.recommendation !== 'Öneri: Onayla') {
    throw new Error(`Beklenen geçerli sertifika AI raporu alınamadı: ${JSON.stringify(validReport)}`);
  }
  console.log('  [OK] Geçerli sertifika AI analizi (HTTP 200) başarıyla tamamlandı:');
  console.log(`       Durum: "${validReport.validityStatus}" | Öneri: "${validReport.recommendation}" | Gerekçe: "${validReport.reason}"`);
  passedTests++;

  // HUMAN-IN-THE-LOOP TESTİ 1: Veritabanındaki başvuru durumu DEĞİŞMEMELİDİR!
  const checkSub1 = await cds.db.run(SELECT.one.from(Submissions).where({ ID: testSubValidCert }));
  if (checkSub1.status !== 'Pending') {
    throw new Error(`KRİTİK GÜVENLİK İHLALİ: AI analizi başvuruyu otomatik olarak güncelledi! Durum: ${checkSub1.status}`);
  }
  console.log('  [OK] Human-in-the-Loop Doğrulandı: AI analizi sonrasında başvuru durumu "Pending" olarak korundu.');
  passedTests++;

  // 2.5.2 Süresi Dolan Sertifika Analizi (Expired -> Öneri: Reddet)
  simulatedCertName = 'expired-cert.pdf';
  const expiredAiRes = await httpPost(`/odata/v4/approval/Submissions(${testSubExpiredCert})/analyzeCertificate`, {}, approverHeaders);
  if (expiredAiRes.status !== 200) {
    throw new Error(`Süresi dolan sertifika analizi başarısız! Status: ${expiredAiRes.status}`);
  }
  const expiredReport = expiredAiRes.data;
  if (expiredReport.validityStatus !== 'Expired' || expiredReport.recommendation !== 'Öneri: Reddet' || expiredReport.suggestedFields !== 'certificate') {
    throw new Error(`Beklenen red önerisi AI raporu alınamadı: ${JSON.stringify(expiredReport)}`);
  }
  console.log('  [OK] Süresi dolan sertifika AI analizi başarıyla tamamlandı:');
  console.log(`       Durum: "${expiredReport.validityStatus}" | Öneri: "${expiredReport.recommendation}" | Önerilen Alan: "${expiredReport.suggestedFields}"`);
  passedTests++;

  // HUMAN-IN-THE-LOOP TESTİ 2: AI red önerse bile başvuru veritabanında REDDEDİLMEMELİDİR!
  const checkSub2 = await cds.db.run(SELECT.one.from(Submissions).where({ ID: testSubExpiredCert }));
  if (checkSub2.status !== 'Pending') {
    throw new Error(`KRİTİK GÜVENLİK İHLALİ: AI analizi başvuruyu otomatik olarak reddetti! Durum: ${checkSub2.status}`);
  }
  console.log('  [OK] Human-in-the-Loop Doğrulandı: AI red önerisine rağmen başvuru durumu "Pending" olarak korundu.');
  passedTests++;

  // 2.6 Regresyon Testi: 6.4-A Onaylama ve 6.4-B Reddetme Akışları Bozulmadı mı?
  const regApprove = await httpPost(`/odata/v4/approval/Submissions(${testSubValidCert})/approve`, {}, approverHeaders);
  if (regApprove.status !== 200 || regApprove.data?.status !== 'Approved') {
    throw new Error('REGRESYON HATASI: 6.4-A Onaylama işlemi başarısız!');
  }
  console.log('  [OK] Regresyon Doğrulandı: AI analizi sonrası onaycı manuel olarak başvuruyu onaylayabildi.');
  passedTests++;

  const regReject = await httpPost(`/odata/v4/approval/Submissions(${testSubExpiredCert})/reject`, {
    rejectionReason: expiredReport.reason,
    editableFields: expiredReport.suggestedFields
  }, approverHeaders);
  if (regReject.status !== 200 || regReject.data?.status !== 'Rejected') {
    throw new Error('REGRESYON HATASI: 6.4-B Reddetme işlemi başarısız!');
  }
  console.log('  [OK] Regresyon Doğrulandı: AI red önerisi onaycının kararıyla reject aksiyonuna başarıyla bağlandı.');
  passedTests++;

  cds.connect.to = originalConnectTo;
  server.close();

  console.log('\n================================================================');
  console.log(`✅ TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${passedTests}/${passedTests} TEST GEÇTİ)`);
  console.log('   FAZ 6.4-C: AI SERTİFİKA ANALİZİ ENTEGRASYONU %100 DOĞRULANDI.');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ:', err);
  process.exit(1);
});
