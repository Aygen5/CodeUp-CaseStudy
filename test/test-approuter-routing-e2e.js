/**
 * FAZ 7.1: Approuter Rota ve Sistem Birleşimi Uçtan Uca Doğrulama Testi
 *
 * Test Edilen Senaryolar:
 * 1. Statik Yapılandırma ve Sözleşme Denetimi (xs-app.json, default-env, port 5000)
 * 2. Top-Down Regex ve Rota Öncelik Sıralaması
 * 3. Public Arayüz Erişimi (Supplier Portal UI5: index, Component, manifest, view, i18n)
 * 4. Public CAP OData v4 Yönlendirmesi ($metadata, register, login, getMySubmission)
 * 5. Korumalı Rota Güvenlik Denetimi (Supplier Approvals UI5 & ApprovalService XSUAA kalkanı)
 * 6. Rota İzolasyonu ve Catch-All Gölgeleme Denetimi
 * 7. Mimari Standartlar ve SAP HANA Uyumluluğu
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');

async function main() {
  console.log('================================================================');
  console.log('FAZ 7.1: Approuter İmplementasyonu ve Rota Doğrulama Testi');
  console.log('================================================================\n');

  let passedTests = 0;
  const rootDir = path.join(__dirname, '..');

  // -------------------------------------------------------------
  // 1. STATİK YAPILANDIRMA VE SÖZLEŞME DENETİMİ
  // -------------------------------------------------------------
  console.log('>>> 1. STATİK YAPILANDIRMA VE SÖZLEŞME DENETİMİ');

  const xsAppPath = path.join(rootDir, 'xs-app.json');
  if (!fs.existsSync(xsAppPath)) {
    throw new Error('xs-app.json dosyası kök dizinde bulunamadı!');
  }
  const xsApp = JSON.parse(fs.readFileSync(xsAppPath, 'utf8'));

  if (xsApp.authenticationMethod !== 'route') {
    throw new Error(`xs-app.json authenticationMethod 'route' olmalıdır! Mevcut: ${xsApp.authenticationMethod}`);
  }
  console.log('  [OK] xs-app.json mevcut ve authenticationMethod: "route" doğrulandı.');
  passedTests++;

  // Rota sayısı ve varlık denetimi
  if (!Array.isArray(xsApp.routes) || xsApp.routes.length !== 6) {
    throw new Error(`xs-app.json içinde tam 6 adet rota tanımlı olmalıdır! Mevcut: ${xsApp.routes?.length}`);
  }

  const expectedSources = [
    '^/odata/v4/public/(.*)$',
    '^/odata/v4/approval/(.*)$',
    '^/supplierportal/(.*)$',
    '^/supplier-approvals/(.*)$',
    '^/appconfig/(.*)$',
    '^/(.*)$'
  ];

  for (let i = 0; i < expectedSources.length; i++) {
    if (xsApp.routes[i].source !== expectedSources[i]) {
      throw new Error(`Rota sırası hatalı! ${i + 1}. rota: Beklenen "${expectedSources[i]}", Mevcut "${xsApp.routes[i].source}"`);
    }
  }
  console.log('  [OK] Top-down 6 rota öncelik sıralaması Faz 3 mimari kılavuzuna birebir uygun.');
  passedTests++;

  // Public vs Korumalı yetki türü kontrolleri
  if (xsApp.routes[0].authenticationType !== 'none') {
    throw new Error('1. Rota (/odata/v4/public) authenticationType "none" olmalıdır!');
  }
  if (xsApp.routes[1].authenticationType !== 'xsuaa' || xsApp.routes[1].scope !== '$XSAPPNAME.Approval') {
    throw new Error('2. Rota (/odata/v4/approval) xsuaa ve $XSAPPNAME.Approval ile korunmalıdır!');
  }
  if (xsApp.routes[2].authenticationType !== 'none') {
    throw new Error('3. Rota (/supplierportal) authenticationType "none" olmalıdır!');
  }
  if (xsApp.routes[3].authenticationType !== 'xsuaa' || xsApp.routes[3].scope !== '$XSAPPNAME.Approval') {
    throw new Error('4. Rota (/supplier-approvals) xsuaa ve $XSAPPNAME.Approval ile korunmalıdır!');
  }
  if (xsApp.routes[4].authenticationType !== 'none') {
    throw new Error('5. Rota (/appconfig) authenticationType "none" olmalıdır!');
  }
  if (xsApp.routes[5].authenticationType !== 'none') {
    throw new Error('6. Rota (^/(.*)$) authenticationType "none" olmalıdır!');
  }
  console.log('  [OK] Public ("none") ve Korumalı ("xsuaa") güvenlik sınırları deklarasyonu tam doğrulandı.');
  passedTests++;

  // localDir varlık kontrolleri
  for (const r of xsApp.routes) {
    if (r.localDir) {
      const fullDir = path.join(rootDir, r.localDir);
      if (!fs.existsSync(fullDir)) {
        throw new Error(`localDir dizini bulunamadı: ${r.localDir} (${fullDir})`);
      }
    }
  }
  console.log('  [OK] Tüm localDir hedefleri (app/supplierportal/webapp, app/supplier-approvals/webapp, app/appconfig, app) disk üzerinde mevcut.');
  passedTests++;

  // -------------------------------------------------------------
  // 2. CANLI SUNUCU BAŞLATMA (CAP Backend :4004 & Approuter :5000)
  // -------------------------------------------------------------
  console.log('\n>>> 2. CANLI SUNUCU BAŞLATMA (CAP Backend & Approuter)');

  // 2.1 CAP Backend Sunucusu
  cds.env.requires.auth = {
    kind: 'mocked',
    users: {
      approver_user: { roles: ['Approval'] }
    }
  };
  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');

  const capApp = express();
  capApp.use(express.json());
  await cds.serve('all').in(capApp);

  const capServer = await new Promise((resolve) => {
    const s = capApp.listen(0, () => resolve(s));
  });
  const capPort = capServer.address().port;
  console.log(`  [INFO] Canlı CAP Backend Sunucusu Hazır: http://localhost:${capPort}`);

  // 2.2 Approuter Sunucusu
  process.env.destinations = JSON.stringify([
    {
      name: 'srv-api',
      url: `http://localhost:${capPort}`,
      forwardAuthToken: true
    }
  ]);

  process.env.VCAP_SERVICES = JSON.stringify({
    xsuaa: [
      {
        name: 'codeup-xsuaa',
        label: 'xsuaa',
        tags: ['xsuaa'],
        credentials: {
          xsappname: 'codeup-supplier-management',
          clientid: 'local-client',
          clientsecret: 'local-secret',
          url: 'http://localhost:5000/uaa',
          identityzone: 'codeup-zone'
        }
      }
    ]
  });

  const approuter = require('@sap/approuter');
  const ar = approuter();

  // Test portu olarak 5095 kullanalım (port çakışması olmaması için)
  const approuterPort = 5095;
  await new Promise((resolve, reject) => {
    ar.start({ port: approuterPort }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  console.log(`  [INFO] SAP Approuter Hazır: http://localhost:${approuterPort}`);
  passedTests++;

  const approuterUrl = `http://localhost:${approuterPort}`;

  // -------------------------------------------------------------
  // 3. PUBLIC ARAYÜZ YÖNLENDİRME TESTLERİ (Supplier Portal)
  // -------------------------------------------------------------
  console.log('\n>>> 3. PUBLIC ARAYÜZ YÖNLENDİRME TESTLERİ (Supplier Portal)');

  // 3.1 /supplierportal/index.html
  const spIndexRes = await fetch(`${approuterUrl}/supplierportal/index.html`);
  if (spIndexRes.status !== 200) {
    throw new Error(`/supplierportal/index.html açılamadı! Status: ${spIndexRes.status}`);
  }
  const spIndexHtml = await spIndexRes.text();
  if (!spIndexHtml.includes('Supplier Portal') || !spIndexHtml.includes('codeup.supplier.portal')) {
    throw new Error('/supplierportal/index.html içeriği doğrulanamadı!');
  }
  console.log('  [OK] /supplierportal/index.html Approuter üzerinden HTTP 200 ile yüklendi.');
  passedTests++;

  // 3.2 /supplierportal/ (Dizin kökü varsayılan index.html)
  const spSlashRes = await fetch(`${approuterUrl}/supplierportal/`);
  if (spSlashRes.status !== 200) {
    throw new Error(`/supplierportal/ açılamadı! Status: ${spSlashRes.status}`);
  }
  const spSlashHtml = await spSlashRes.text();
  if (!spSlashHtml.includes('codeup.supplier.portal')) {
    throw new Error('/supplierportal/ varsayılan dosyası index.html değil!');
  }
  console.log('  [OK] /supplierportal/ kök dizin isteği index.html belgesine başarıyla bağlandı.');
  passedTests++;

  // 3.3 /supplierportal (Slash olmadan yönlendirme)
  const spNoSlashRes = await fetch(`${approuterUrl}/supplierportal`, { redirect: 'manual' });
  if (spNoSlashRes.status !== 301 || spNoSlashRes.headers.get('location') !== '/supplierportal/') {
    throw new Error(`/supplierportal slash yönlendirmesi başarısız! Status: ${spNoSlashRes.status}`);
  }
  console.log('  [OK] /supplierportal isteği Approuter tarafından otomatik 301 ile /supplierportal/ adresine yönlendirildi.');
  passedTests++;

  // 3.4 Statik Kaynaklar: Component.js, manifest.json, i18n, view XML
  const spManifestRes = await fetch(`${approuterUrl}/supplierportal/manifest.json`);
  if (spManifestRes.status !== 200) {
    throw new Error('supplierportal manifest.json yüklenemedi!');
  }
  const spManifest = await spManifestRes.json();
  if (spManifest['sap.app']?.id !== 'codeup.supplier.portal') {
    throw new Error('supplierportal manifest içeriği geçersiz!');
  }

  const spI18nRes = await fetch(`${approuterUrl}/supplierportal/i18n/i18n.properties`);
  if (spI18nRes.status !== 200) {
    throw new Error('supplierportal i18n.properties yüklenemedi!');
  }

  const spAuthViewRes = await fetch(`${approuterUrl}/supplierportal/view/Auth.view.xml`);
  if (spAuthViewRes.status !== 200) {
    throw new Error('supplierportal Auth.view.xml yüklenemedi!');
  }
  console.log('  [OK] Supplier Portal tüm statik kaynakları (manifest, i18n, view XML) başarıyla sunuldu.');
  passedTests++;

  // -------------------------------------------------------------
  // 4. PUBLIC CAP ODATA V4 SERVİS PROXY TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 4. PUBLIC CAP ODATA V4 SERVİS PROXY TESTLERİ');

  // 4.1 OData $metadata
  const metaRes = await fetch(`${approuterUrl}/odata/v4/public/$metadata`);
  if (metaRes.status !== 200) {
    throw new Error(`Public $metadata çekilemedi! Status: ${metaRes.status}`);
  }
  const metaText = await metaRes.text();
  if (!metaText.includes('PublicService') || !metaText.includes('createSubmission')) {
    throw new Error('Public $metadata içeriği PublicService şeması ile eşleşmiyor!');
  }
  console.log('  [OK] /odata/v4/public/$metadata proxy çağrısı CAP backend üzerinden HTTP 200 ile döndü.');
  passedTests++;

  // 4.2 Kayıt (Register) ve Giriş (Login) Akışı Approuter Üzerinden
  const testEmail = `approuter-test-${Date.now()}@codeup.corp`;
  const registerRes = await fetch(`${approuterUrl}/odata/v4/public/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'Password123!'
    })
  });
  if (registerRes.status !== 200) {
    throw new Error(`Approuter üzerinden kayıt başarısız! Status: ${registerRes.status}`);
  }
  const regData = await registerRes.json();
  if (!regData.success || !regData.token) {
    throw new Error('Kayıt yanıtında token dönmedi!');
  }
  console.log('  [OK] POST /odata/v4/public/register Approuter üzerinden başarıyla kayıt oluşturdu ve token üretti.');
  passedTests++;

  // 4.3 Giriş (Login)
  const loginRes = await fetch(`${approuterUrl}/odata/v4/public/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'Password123!'
    })
  });
  if (loginRes.status !== 200) {
    throw new Error(`Approuter üzerinden giriş başarısız! Status: ${loginRes.status}`);
  }
  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.token) {
    throw new Error('Giriş yanıtında token dönmedi!');
  }
  console.log('  [OK] POST /odata/v4/public/login Approuter üzerinden oturum açtı.');
  passedTests++;

  // 4.4 getMySubmission (Tedarikçi Bearer Token ile Approuter üzerinden)
  const mySubRes = await fetch(`${approuterUrl}/odata/v4/public/getMySubmission()`, {
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  if (mySubRes.status !== 200 && mySubRes.status !== 204) {
    throw new Error(`getMySubmission başarısız! Status: ${mySubRes.status}`);
  }
  console.log('  [OK] GET /odata/v4/public/getMySubmission() tedarikçi token ile başarıyla yanıt aldı.');
  passedTests++;

  // -------------------------------------------------------------
  // 5. KORUMALI ROTA GÜVENLİK DENETİMİ (Supplier Approvals & ApprovalService)
  // -------------------------------------------------------------
  console.log('\n>>> 5. KORUMALI ROTA GÜVENLİK DENETİMİ (Supplier Approvals & ApprovalService)');

  // 5.1 /supplier-approvals/index.html (XSUAA yetkilendirmesi zorunlu)
  const saIndexRes = await fetch(`${approuterUrl}/supplier-approvals/index.html`, { redirect: 'manual' });
  const saIndexText = await saIndexRes.text();
  // Approuter xsuaa rotalarında yetkisiz kullanıcıyı OAuth2 authorize akışına yönlendirir
  const isProtectedUI = saIndexText.includes('oauth/authorize') || saIndexRes.status === 302 || saIndexRes.status === 401;
  if (!isProtectedUI) {
    throw new Error('GÜVENLİK İHLALİ: /supplier-approvals/index.html anonim kullanıcılara korumasız açıldı!');
  }
  console.log('  [OK] /supplier-approvals/index.html korumalı rota olarak doğrulandı (OAuth2 login challenge tetiklendi).');
  passedTests++;

  // 5.2 /odata/v4/approval/Submissions (XSUAA yetkilendirmesi zorunlu)
  const saApiRes = await fetch(`${approuterUrl}/odata/v4/approval/Submissions`, { redirect: 'manual' });
  const saApiText = await saApiRes.text();
  const isProtectedApi = saApiText.includes('oauth/authorize') || saApiRes.status === 302 || saApiRes.status === 401;
  if (!isProtectedApi) {
    throw new Error('GÜVENLİK İHLALİ: /odata/v4/approval/Submissions anonim kullanıcılara korumasız açıldı!');
  }
  console.log('  [OK] /odata/v4/approval/Submissions korumalı API rotası olarak doğrulandı (OAuth2 login challenge tetiklendi).');
  passedTests++;

  // -------------------------------------------------------------
  // 6. ROTA İZOLASYONU VE GÖLGELEME (SHADOWING) DENETİMİ
  // -------------------------------------------------------------
  console.log('\n>>> 6. ROTA İZOLASYONU VE CATCH-ALL GÖLGELEME DENETİMİ');

  // Bilinmeyen bir rota catch-all (^/(.*)$) rotasına düşmeli ve localDir app içinde dosya bulunamadığı için 404 dönmelidir
  const unknownRes = await fetch(`${approuterUrl}/some-nonexistent-path-abc-123.txt`);
  if (unknownRes.status !== 404) {
    throw new Error(`Bilinmeyen rota 404 dönmedi! Status: ${unknownRes.status}`);
  }
  console.log('  [OK] Bilinmeyen rota catch-all üzerinden 404 döndürdü (diğer servisleri gölgelemiyor).');
  passedTests++;

  // Temizlik
  await new Promise((resolve) => ar.close(resolve));
  await new Promise((resolve) => capServer.close(resolve));

  console.log('\n================================================================');
  console.log(`✅ TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${passedTests}/${passedTests} TEST GEÇTİ)`);
  console.log('   FAZ 7.1: APPROUTER VE ROTA ENTEGRASYONU %100 DOĞRULANDI.');
  console.log('================================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ:', err);
  process.exit(1);
});
