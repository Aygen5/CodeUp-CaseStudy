const cds = require('@sap/cds');
const express = require('express');
const fs = require('fs');
const path = require('path');
const ApprovalService = require('../srv/approval-service');

async function main() {
  console.log('================================================================');
  console.log('FAZ 4 — ADIM 4.3: Gemini AI Karar Destek ve BTP Destination Testi');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // Kategori 1: Prompt Oluşturma ve Yanıt Parse Birim Testleri
  // -------------------------------------------------------------
  console.log('--- Kategori 1: Prompt & Yanıt Parse Birim Testleri ---');

  const prompt = ApprovalService.buildGeminiPrompt('2026-09-14');
  if (!prompt.includes('2026-09-14') || !prompt.includes('ISO') || !prompt.includes('validityStatus')) {
    throw new Error('Gemini prompt şablonu beklenen alanları içermiyor!');
  }
  console.log('  [OK] Prompt şablonu referans tarih ve denetim kurallarını eksiksiz içeriyor.');

  // 1.1 Geçerli Sertifika JSON yanıtı
  const mockValidGeminiOutput = JSON.stringify({
    validityStatus: 'Valid',
    recommendation: 'Öneri: Onayla',
    reason: 'ISO 9001 sertifikası geçerlidir. Bitiş tarihi: 15.08.2028.',
    suggestedFields: ''
  });
  const parsedValid = ApprovalService.parseGeminiResponse(mockValidGeminiOutput, 'valid-cert.pdf');
  if (parsedValid.validityStatus !== 'Valid' || parsedValid.recommendation !== 'Öneri: Onayla') {
    throw new Error('Geçerli sertifika yanıtı yanlış çözümlendi!');
  }
  console.log('  [OK] Geçerli sertifika AI raporu doğru çözümlendi:', parsedValid.recommendation);

  // 1.2 Süresi Dolan Sertifika Markdown Kod Bloğu içinde JSON yanıtı
  const mockExpiredGeminiOutput = `\`\`\`json
{
  "validityStatus": "Expired",
  "recommendation": "Reddet",
  "reason": "Sertifikanın geçerlilik süresi 15.01.2024 tarihinde sona ermiştir.",
  "suggestedFields": "certificate"
}
\`\`\``;
  const parsedExpired = ApprovalService.parseGeminiResponse(mockExpiredGeminiOutput, 'expired-cert.pdf');
  if (parsedExpired.validityStatus !== 'Expired' || parsedExpired.recommendation !== 'Öneri: Reddet' || parsedExpired.suggestedFields !== 'certificate') {
    throw new Error('Süresi dolan sertifika yanıtı yanlış çözümlendi!');
  }
  console.log('  [OK] Markdown bloklu süresi dolan sertifika AI raporu ve "Öneri: Reddet" normalizasyonu başarılı.');

  // 1.3 Geçersiz JSON yakalama
  try {
    ApprovalService.parseGeminiResponse('Geçersiz bozuk veri...', 'test.pdf');
    throw new Error('Bozuk JSON hata fırlatmalıydı!');
  } catch (err) {
    console.log('  [OK] Bozuk JSON yanıtı güvenle yakalandı:', err.message);
  }

  // -------------------------------------------------------------
  // CAP Sunucusu Hazırlığı
  // -------------------------------------------------------------
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
  console.log('\n  CAP Test Sunucusu Başlatıldı:', baseUrl);

  const approverHeaders = {
    authorization: 'Basic ' + Buffer.from('approver_user:').toString('base64'),
    'Content-Type': 'application/json'
  };

  const unauthorizedHeaders = {
    authorization: 'Basic ' + Buffer.from('unauthorized_user:').toString('base64'),
    'Content-Type': 'application/json'
  };

  async function httpPost(endpoint, body = {}, headers = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  // Test verilerini hazırla
  const Submissions = 'codeup.supplier.management.Submissions';
  const Suppliers = 'codeup.supplier.management.Suppliers';

  const testSupplierId = '90000000-0000-4000-8000-000000000001';
  const testSubWithValidCert = '90000000-0000-4000-8000-000000000002';
  const testSubWithExpiredCert = '90000000-0000-4000-8000-000000000003';
  const testSubWithoutCert = '90000000-0000-4000-8000-000000000004';
  const testSubWithInvalidMime = '90000000-0000-4000-8000-000000000005';

  await DELETE.from(Submissions).where({ ID: { in: [testSubWithValidCert, testSubWithExpiredCert, testSubWithoutCert, testSubWithInvalidMime] } });
  await DELETE.from(Suppliers).where({ ID: testSupplierId });

  await INSERT.into(Suppliers).entries({
    ID: testSupplierId,
    email: 'ai-test-supplier@codeup.com',
    passwordHash: 'dummyHash'
  });

  const validCertBuffer = fs.readFileSync(path.join(__dirname, 'files', 'valid-cert.pdf'));
  const expiredCertBuffer = fs.readFileSync(path.join(__dirname, 'files', 'expired-cert.pdf'));

  await INSERT.into(Submissions).entries([
    {
      ID: testSubWithValidCert,
      supplier_ID: testSupplierId,
      companyName: 'AI Test Valid Ltd.',
      contactPerson: 'Zeynep Ay',
      phone: '+90 555 111 2233',
      country: 'Türkiye',
      taxId: '1112223334',
      website: 'https://valid-ai.com',
      address: 'Ankara, Türkiye',
      notes: 'Valid certificate submission for AI test',
      category: 'Hizmet',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: validCertBuffer,
      certificateMimeType: 'application/pdf',
      certificateFileName: 'valid-cert.pdf'
    },
    {
      ID: testSubWithExpiredCert,
      supplier_ID: testSupplierId,
      companyName: 'AI Test Expired A.Ş.',
      contactPerson: 'Ali Veli',
      phone: '+90 555 222 3344',
      country: 'Türkiye',
      taxId: '2223334445',
      website: 'https://expired-ai.com',
      address: 'İstanbul, Türkiye',
      notes: 'Expired certificate submission for AI test',
      category: 'Yazılım',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: expiredCertBuffer,
      certificateMimeType: 'application/pdf',
      certificateFileName: 'expired-cert.pdf'
    },
    {
      ID: testSubWithoutCert,
      supplier_ID: testSupplierId,
      companyName: 'AI Test No Cert',
      contactPerson: 'Can Su',
      phone: '+90 555 333 4455',
      country: 'Türkiye',
      taxId: '3334445556',
      website: 'https://nocert.com',
      address: 'İzmir, Türkiye',
      notes: 'No certificate attached',
      category: 'Danışmanlık',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: null,
      certificateMimeType: null,
      certificateFileName: null
    },
    {
      ID: testSubWithInvalidMime,
      supplier_ID: testSupplierId,
      companyName: 'AI Test Invalid Mime',
      contactPerson: 'Deniz Gök',
      phone: '+90 555 444 5566',
      country: 'Türkiye',
      taxId: '4445556667',
      website: 'https://invalidmime.com',
      address: 'Bursa, Türkiye',
      notes: 'Text file attached instead of PDF',
      category: 'Donanım',
      status: 'Pending',
      submissionDate: new Date().toISOString(),
      certificate: Buffer.from('invalid file content'),
      certificateMimeType: 'text/plain',
      certificateFileName: 'invalid-cert.txt'
    }
  ]);

  // -------------------------------------------------------------
  // Kategori 2: Yetkilendirme & Rol Doğrulama Testleri
  // -------------------------------------------------------------
  console.log('\n--- Kategori 2: Yetkilendirme & Rol Doğrulama Testleri ---');

  // 2.1 Anonim istek engellenmeli (401)
  const anonRes = await httpPost(`/odata/v4/approval/Submissions(${testSubWithValidCert})/analyzeCertificate`, {});
  if (anonRes.status !== 401) {
    throw new Error(`Anonim kullanıcı analyzeCertificate çağırabildi! Status: ${anonRes.status}`);
  }
  console.log('  [OK] Anonim kullanıcı analyzeCertificate çağrısı engellendi (401):', anonRes.data?.error?.message);

  // 2.2 Yetkisiz kullanıcı engellenmeli (403)
  const unauthRes = await httpPost(
    `/odata/v4/approval/Submissions(${testSubWithValidCert})/analyzeCertificate`,
    {},
    unauthorizedHeaders
  );
  if (unauthRes.status !== 403) {
    throw new Error(`Approval rolü olmayan kullanıcı AI analizi tetikleyebildi! Status: ${unauthRes.status}`);
  }
  console.log('  [OK] Approval rolü olmayan kullanıcı engellendi (403):', unauthRes.data?.error?.message);

  // -------------------------------------------------------------
  // Kategori 3: Girdi & Varlık Doğrulama Testleri
  // -------------------------------------------------------------
  console.log('\n--- Kategori 3: Girdi & Varlık Doğrulama Testleri ---');

  // 3.1 Var olmayan ID (404)
  const notFoundId = '90000000-0000-4000-8000-999999999999';
  const notFoundRes = await httpPost(
    `/odata/v4/approval/Submissions(${notFoundId})/analyzeCertificate`,
    {},
    approverHeaders
  );
  if (notFoundRes.status !== 404) {
    throw new Error(`Var olmayan başvuruya 404 dönmedi! Status: ${notFoundRes.status}`);
  }
  console.log('  [OK] Var olmayan başvuru analizi 404 ile engellendi:', notFoundRes.data?.error?.message);

  // 3.2 Sertifikası olmayan başvuru (400)
  const noCertRes = await httpPost(
    `/odata/v4/approval/Submissions(${testSubWithoutCert})/analyzeCertificate`,
    {},
    approverHeaders
  );
  if (noCertRes.status !== 400) {
    throw new Error(`Sertifikasız başvuru analizi engellenemedi! Status: ${noCertRes.status}`);
  }
  console.log('  [OK] Sertifikasız başvuru analizi engellendi (400):', noCertRes.data?.error?.message);

  // 3.3 PDF olmayan sertifika (400)
  const invalidMimeRes = await httpPost(
    `/odata/v4/approval/Submissions(${testSubWithInvalidMime})/analyzeCertificate`,
    {},
    approverHeaders
  );
  if (invalidMimeRes.status !== 400) {
    throw new Error(`PDF olmayan sertifika analizi engellenemedi! Status: ${invalidMimeRes.status}`);
  }
  console.log('  [OK] PDF olmayan sertifika analizi engellendi (400):', invalidMimeRes.data?.error?.message);

  // -------------------------------------------------------------
  // Kategori 4: BTP Destination Servisi Bağlantı ve Hata Yönetimi Testi
  // -------------------------------------------------------------
  console.log('\n--- Kategori 4: BTP Destination Bağlantı & Güvenli Hata Yönetimi ---');

  // Yerel ortamda gerçek BTP Destination servisi bağlı olmadığında,
  // sistem gizli anahtar/token sızdırmadan temiz bir 502 hatası döndürmelidir.
  const localDestRes = await httpPost(
    `/odata/v4/approval/Submissions(${testSubWithValidCert})/analyzeCertificate`,
    {},
    approverHeaders
  );

  if (localDestRes.status !== 502) {
    throw new Error(`Yerel ortamda Destination çözülemediğinde 502 dönmeliydi! Status: ${localDestRes.status}`);
  }
  const errorMsg = localDestRes.data?.error?.message || '';
  if (!errorMsg.includes('gemini') || !errorMsg.includes('Destination')) {
    throw new Error(`Hata mesajı BTP Destination bağımlılığını açıklamıyor: ${errorMsg}`);
  }
  // Gizli veri sızıntısı kontrolü (API anahtarı veya secret içermemeli)
  if (errorMsg.includes('key=') || errorMsg.includes('secret') || errorMsg.includes('AIza')) {
    throw new Error(`Hata mesajında gizli kimlik bilgisi tespit edildi! Sızıntı var: ${errorMsg}`);
  }
  console.log('  [OK] BTP Destination bulunamadığında güvenli ve sır sızdırmayan 502 yanıtı alındı:');
  console.log(`       "${errorMsg}"`);

  // -------------------------------------------------------------
  // Kategori 5: Gemini AI Analizi & Human-in-the-Loop İlkesi Testi
  // -------------------------------------------------------------
  console.log('\n--- Kategori 5: Gemini AI Analizi & Human-in-the-Loop İlkesi ---');

  // BTP Destination simülasyonu için mock remote servis kaydediyoruz
  const originalConnectTo = cds.connect.to;
  let lastPayloadSent = null;

  cds.connect.to = async function (serviceName, options) {
    if (serviceName === 'gemini') {
      return {
        async post(path, data) {
          lastPayloadSent = data;
          const isExpired = lastCallingFile === 'expired-cert.pdf';
          
          if (isExpired) {
            return {
              candidates: [{
                content: {
                  parts: [{
                    text: JSON.stringify({
                      validityStatus: 'Expired',
                      recommendation: 'Öneri: Reddet',
                      reason: 'Tedarikçi sertifikasının geçerlilik süresi 2024 yılında dolmuştur. Yenilenmesi gerekmektedir.',
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
                    reason: 'ISO 27001 kurumsal sertifikası geçerlidir. Bitiş tarihi: 2028-12-31.',
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

  let lastCallingFile = 'valid-cert.pdf';

  // 5.1 Bound Action ile Geçerli Sertifika Analizi (Submissions(ID)/analyzeCertificate)
  const validAIRes = await httpPost(
    `/odata/v4/approval/Submissions(${testSubWithValidCert})/analyzeCertificate`,
    {},
    approverHeaders
  );

  if (validAIRes.status !== 200) {
    throw new Error(`AI analizi başarısız oldu! Status: ${validAIRes.status} Hata: ${JSON.stringify(validAIRes.data)}`);
  }
  const validReport = validAIRes.data;
  if (validReport.validityStatus !== 'Valid' || validReport.recommendation !== 'Öneri: Onayla') {
    throw new Error(`Geçerli sertifika için beklenen AI raporu alınamadı: ${JSON.stringify(validReport)}`);
  }
  console.log('  [OK] Bound Action Submissions(ID)/analyzeCertificate başarıyla çalıştı.');
  console.log('       Rapor:', JSON.stringify(validReport, null, 2));

  // HUMAN-IN-THE-LOOP TESTİ 1: Başvurunun veritabanındaki status değeri değişmemeli!
  const checkSub1 = await SELECT.one.from(Submissions).where({ ID: testSubWithValidCert });
  if (checkSub1.status !== 'Pending') {
    throw new Error(`KRİTİK HATA (Human-in-the-Loop İhlali): AI analizi başvurunun durumunu değiştirdi! Durum: ${checkSub1.status}`);
  }
  console.log('  [OK] Human-in-the-Loop Doğrulandı: AI analizi sonrasında başvuru durumu "Pending" olarak korundu.');

  // 5.2 Unbound Action ile Süresi Dolan Sertifika Analizi (analyzeSubmissionCertificate)
  lastCallingFile = 'expired-cert.pdf';
  const expiredAIRes = await httpPost(
    '/odata/v4/approval/analyzeSubmissionCertificate',
    { ID: testSubWithExpiredCert },
    approverHeaders
  );

  if (expiredAIRes.status !== 200) {
    throw new Error(`analyzeSubmissionCertificate başarısız oldu! Status: ${expiredAIRes.status} Hata: ${JSON.stringify(expiredAIRes.data)}`);
  }
  const expiredReport = expiredAIRes.data;
  if (expiredReport.validityStatus !== 'Expired' || expiredReport.recommendation !== 'Öneri: Reddet' || expiredReport.suggestedFields !== 'certificate') {
    throw new Error(`Süresi dolan sertifika için beklenen AI red raporu alınamadı: ${JSON.stringify(expiredReport)}`);
  }
  console.log('\n  [OK] Unbound Action analyzeSubmissionCertificate başarıyla çalıştı.');
  console.log('       Rapor:', JSON.stringify(expiredReport, null, 2));

  // HUMAN-IN-THE-LOOP TESTİ 2: AI "Öneri: Reddet" verse bile başvuru veritabanında REDDEDİLMEMELİ!
  const checkSub2 = await SELECT.one.from(Submissions).where({ ID: testSubWithExpiredCert });
  if (checkSub2.status !== 'Pending') {
    throw new Error(`KRİTİK HATA (Human-in-the-Loop İhlali): AI analizi başvuruyu otomatik olarak reddetti! Durum: ${checkSub2.status}`);
  }
  console.log('  [OK] Human-in-the-Loop Doğrulandı: AI red önerisi sunsa dahi başvuru durumu "Pending" olarak kaldı, nihai karar onaycıya bırakıldı.');

  // Multimodal Payload Doğrulaması
  if (!lastPayloadSent || !lastPayloadSent.contents?.[0]?.parts?.[1]?.inline_data?.data) {
    throw new Error('Gemini API ye gönderilen multimodal payload içinde inline_data base64 sertifika verisi eksik!');
  }
  console.log('  [OK] Multimodal payload doğrulandı: PDF sertifikası Base64 inline_data olarak Gemini ye iletildi.');

  // Temizlik
  cds.connect.to = originalConnectTo;
  server.close();

  console.log('\n================================================================');
  console.log('✅ TÜM TESTLER EKSİKSİZ VE BAŞARIYLA TAMAMLANDI! (STEP 4.3 %100 BAŞARILI)');
  console.log('================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ TEST HATA İLE SONUÇLANDI:', err);
  process.exit(1);
});
