/**
 * test/test-btp-xsuaa-hybrid-e2e.js
 * 
 * FAZ 7.3: BTP Hibrit Bağlantı, Gerçek XSUAA Entegrasyonu ve Approval Rol Doğrulama Testi
 * 
 * Bu test:
 * 1. .cdsrc-private.json ve default-env.json içindeki gerçek BTP XSUAA hibrit yapılandırmasını ve secret güvenliğini doğrular.
 * 2. SAP BTP XSUAA sunucusundan (7d591f40trial.authentication.us10.hana.ondemand.com) doğrudan gerçek OAuth2 JWT token alır.
 * 3. CAP Backend sunucusunu hibrit modda (CDS_ENV=hybrid, jwt-auth) başlatır.
 * 4. ApprovalService yetkisiz token ile çağrıldığında (Approval rolü/scope'u eksik) HTTP 403 Forbidden döndüğünü doğrular.
 * 5. Public servislerin (PublicService, tedarikçi giriş/başvuru) XSUAA'dan bağımsız çalıştığını doğrular.
 * 6. Approuter'ı gerçek BTP XSUAA yapılandırmasıyla çalıştırarak:
 *    - /supplier-approvals/ ve /odata/v4/approval/ rotalarında gerçek BTP OAuth2 login meydan okumasını,
 *    - /supplierportal/ rotasında public erişimi,
 *    - /user-api/currentUser rotasında kullanıcı bilgi servisinin varlığını,
 *    - /index.html Launchpad Sandbox kabuğunu doğrular.
 * 7. SAP HANA model uyumluluğunu denetler.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');

const rootDir = path.resolve(__dirname, '..');
let passedTests = 0;

async function runTests() {
  console.log('================================================================');
  console.log('FAZ 7.3: BTP HİBRİT XSUAA VE APPROVAL ROL DOĞRULAMA TESTİ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. YAPILANDIRMA VE SECRET GÜVENLİĞİ DENETİMİ (Kural 5 & 10)
  // -------------------------------------------------------------
  console.log('>>> 1. YAPILANDIRMA VE SECRET GÜVENLİĞİ DENETİMİ');

  const gitignorePath = path.join(rootDir, '.gitignore');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignoreContent.includes('.cdsrc-private.json') || !gitignoreContent.includes('default-env.json')) {
    throw new Error('Secret içeren dosyalar (.cdsrc-private.json, default-env.json) .gitignore içinde değil!');
  }
  console.log('  [OK] .cdsrc-private.json ve default-env.json .gitignore ile korunuyor (Sıfır secret sızıntısı).');
  passedTests++;

  // 1.2 default-env.json denetimi
  const defaultEnvPath = path.join(rootDir, 'default-env.json');
  if (!fs.existsSync(defaultEnvPath)) {
    throw new Error('default-env.json dosyası bulunamadı!');
  }
  const defaultEnv = JSON.parse(fs.readFileSync(defaultEnvPath, 'utf8'));
  const xsuaaCreds = defaultEnv.VCAP_SERVICES?.xsuaa?.[0]?.credentials;
  if (!xsuaaCreds || !xsuaaCreds.url || !xsuaaCreds.clientid || !xsuaaCreds.clientsecret) {
    throw new Error('default-env.json içinde geçerli BTP XSUAA kimlik bilgileri eksik!');
  }
  if (!xsuaaCreds.xsappname.startsWith('codeup-supplier-management')) {
    throw new Error(`Beklenmeyen xsappname: ${xsuaaCreds.xsappname}`);
  }
  console.log(`  [OK] default-env.json gerçek BTP XSUAA instance (${xsuaaCreds.xsappname}) ile yapılandırılmış.`);
  passedTests++;

  // 1.3 .cdsrc-private.json denetimi
  const cdsrcPath = path.join(rootDir, '.cdsrc-private.json');
  if (!fs.existsSync(cdsrcPath)) {
    throw new Error('.cdsrc-private.json dosyası bulunamadı! cds bind çalıştırıldı mı?');
  }
  const cdsrc = JSON.parse(fs.readFileSync(cdsrcPath, 'utf8'));
  const hybridBinding = cdsrc.requires?.['[hybrid]']?.auth?.binding;
  if (!hybridBinding || hybridBinding.instance !== 'codeup-xsuaa') {
    throw new Error('.cdsrc-private.json içinde codeup-xsuaa hibrit binding bulunamadı!');
  }
  console.log('  [OK] .cdsrc-private.json Cloud Foundry codeup-xsuaa hibrit servisine bağlı.');
  passedTests++;

  // -------------------------------------------------------------
  // 2. GERÇEK BTP XSUAA OAUTH2 TOKEN ALMA
  // -------------------------------------------------------------
  console.log('\n>>> 2. GERÇEK BTP XSUAA OAUTH2 TOKEN ALMA');

  const tokenUrl = `${xsuaaCreds.url}/oauth/token`;
  const tokenParams = new URLSearchParams();
  tokenParams.append('grant_type', 'client_credentials');
  tokenParams.append('client_id', xsuaaCreds.clientid);
  tokenParams.append('client_secret', xsuaaCreds.clientsecret);

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  });

  if (tokenRes.status !== 200) {
    throw new Error(`BTP XSUAA token alınamadı! Status: ${tokenRes.status}`);
  }
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('BTP XSUAA yanıtında access_token bulunamadı!');
  }

  // Token payload incelemesi
  const tokenPayload = JSON.parse(Buffer.from(tokenData.access_token.split('.')[1], 'base64').toString('utf8'));
  console.log(`  [INFO] Gerçek BTP XSUAA JWT Token başarıyla alındı. Issuer: ${tokenPayload.iss}`);
  console.log(`  [INFO] Token Client ID: ${tokenPayload.client_id}`);
  console.log(`  [INFO] Token Kapsamları (Scopes): ${JSON.stringify(tokenPayload.scope)}`);

  const hasApprovalScope = tokenPayload.scope?.some(s => s.endsWith('.Approval') || s === 'Approval');
  if (hasApprovalScope) {
    throw new Error('Client credentials tokeninde beklenmedik Approval scope tespit edildi!');
  }
  console.log('  [OK] Client credentials tokeninde "Approval" rolü bulunmuyor (Yetkisiz kullanıcı senaryosu için ideal).');
  passedTests++;

  // -------------------------------------------------------------
  // 3. CANLI CAP BACKEND HİBRİT XSUAA GÜVENLİK TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 3. CANLI CAP BACKEND HİBRİT XSUAA GÜVENLİK TESTLERİ');

  process.env.CDS_ENV = 'hybrid';
  const cds = require('@sap/cds');
  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');

  const capApp = express();
  capApp.use(express.json());
  await cds.serve('all').in(capApp);

  const capServer = await new Promise((resolve) => {
    const s = capApp.listen(0, () => resolve(s));
  });
  const capPort = capServer.address().port;
  console.log(`  [INFO] Canlı CAP Backend (Hybrid XSUAA) Hazır: http://localhost:${capPort}`);
  passedTests++;

  // 3.1 Yetkisiz İstek (Hiç Token Yok) -> 401 veya 403
  const noAuthRes = await fetch(`http://localhost:${capPort}/odata/v4/approval/Submissions`);
  if (noAuthRes.status !== 401 && noAuthRes.status !== 403) {
    throw new Error(`Yetkisiz erişim engellenmedi! Status: ${noAuthRes.status}`);
  }
  console.log(`  [OK] Tokensiz ApprovalService çağrısı CAP tarafından HTTP ${noAuthRes.status} ile engellendi.`);
  passedTests++;

  // 3.2 Yetkisiz İstek (Gerçek BTP XSUAA Tokeni Var Ancak Approval Rolü Yok) -> 403 Forbidden
  const unauthRes = await fetch(`http://localhost:${capPort}/odata/v4/approval/Submissions`, {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
  });
  if (unauthRes.status !== 403) {
    throw new Error(`Approval rolü olmayan BTP tokeni ile erişim engellenemedi! Status: ${unauthRes.status}`);
  }
  console.log('  [OK] Gerçek BTP XSUAA tokeninde "Approval" rolü olmadığı için CAP HTTP 403 Forbidden döndürdü (Yetkisiz Kullanıcı Testi Başarılı).');
  passedTests++;

  // 3.3 Public Servis Bağımsızlığı (Tedarikçi Kayıt/Giriş XSUAA'ya Bağımlı Değildir)
  const publicMetaRes = await fetch(`http://localhost:${capPort}/odata/v4/public/$metadata`);
  if (publicMetaRes.status !== 200) {
    throw new Error(`Public servis erişimi bozuldu! Status: ${publicMetaRes.status}`);
  }
  console.log('  [OK] /odata/v4/public/$metadata public servis uç noktası XSUAA kısıtlaması olmadan HTTP 200 döndürdü.');
  passedTests++;

  // -------------------------------------------------------------
  // 4. CANLI APPROUTER GERÇEK BTP ENTEGRASYONU VE LAUNCHPAD
  // -------------------------------------------------------------
  console.log('\n>>> 4. CANLI APPROUTER GERÇEK BTP ENTEGRASYONU VE LAUNCHPAD');

  // Approuter'ı 5097 portunda başlatalım
  const testApprouterPort = 5097;
  process.env.PORT = `${testApprouterPort}`;
  process.env.destinations = JSON.stringify([
    {
      name: 'srv-api',
      url: `http://localhost:${capPort}`,
      forwardAuthToken: true
    }
  ]);

  const { startApprouter } = require('../approuter.js');
  const ar = startApprouter({ port: testApprouterPort });
  console.log(`  [INFO] SAP Approuter Test Sunucusu Başlatıldı: http://localhost:${testApprouterPort}`);
  passedTests++;

  const approuterUrl = `http://localhost:${testApprouterPort}`;

  // 4.1 Korumalı Rota BTP Login Yönlendirmesi (/supplier-approvals/index.html)
  const saAppRes = await fetch(`${approuterUrl}/supplier-approvals/index.html`, { redirect: 'manual' });
  const saAppText = await saAppRes.text();
  // Approuter XSUAA ile korunmuş rotalarda BTP login sayfasına client-side redirect HTML'i döner
  const btpHost = new URL(xsuaaCreds.url).hostname;
  if (!saAppText.includes(btpHost) && !saAppText.includes('oauth/authorize')) {
    throw new Error(`Supplier Approvals BTP OAuth yönlendirmesi içermiyor! Yanıt: ${saAppText.slice(0, 300)}`);
  }
  console.log(`  [OK] /supplier-approvals/index.html erişimi gerçek BTP XSUAA (${btpHost}) login meydan okumasını tetikledi.`);
  passedTests++;

  // 4.2 Korumalı API Rota BTP Login Yönlendirmesi (/odata/v4/approval/Submissions)
  const saApiRes = await fetch(`${approuterUrl}/odata/v4/approval/Submissions`, { redirect: 'manual' });
  const saApiText = await saApiRes.text();
  if (!saApiText.includes(btpHost) && !saApiText.includes('oauth/authorize')) {
    throw new Error(`ApprovalService API BTP OAuth yönlendirmesi içermiyor! Yanıt: ${saApiText.slice(0, 300)}`);
  }
  console.log('  [OK] /odata/v4/approval/Submissions API çağrısı gerçek BTP XSUAA login meydan okumasını tetikledi.');
  passedTests++;

  // 4.3 Public Rota Doğrulaması (/supplierportal/index.html)
  const spRes = await fetch(`${approuterUrl}/supplierportal/index.html`);
  if (spRes.status !== 200) {
    throw new Error(`/supplierportal/index.html açılamadı! Status: ${spRes.status}`);
  }
  console.log('  [OK] /supplierportal/index.html tedarikçi portalı XSUAA login zorunluluğu olmadan açıldı.');
  passedTests++;

  // 4.4 /user-api/currentUser Kullanıcı Servisi
  const userApiRes = await fetch(`${approuterUrl}/user-api/currentUser`);
  if (userApiRes.status !== 200) {
    throw new Error(`/user-api/currentUser başarısız! Status: ${userApiRes.status}`);
  }
  const userApiData = await userApiRes.json();
  if (!('email' in userApiData) || !('displayName' in userApiData)) {
    throw new Error('/user-api/currentUser beklenen kullanıcı şemasını döndürmedi!');
  }
  console.log('  [OK] /user-api/currentUser servisi Fiori Launchpad shell entegrasyonu için hazır.');
  passedTests++;

  // 4.5 Launchpad Sandbox Kabuğu (/index.html XSUAA Login Yönlendirmesi)
  const lpRes = await fetch(`${approuterUrl}/index.html`, { redirect: 'manual' });
  const lpLocation = lpRes.headers.get('location') || '';
  const lpText = await lpRes.text();
  const isBtpChallenge = lpText.includes(btpHost) || lpLocation.includes(btpHost) || lpText.includes('oauth/authorize') || lpLocation.includes('oauth/authorize');
  if (!isBtpChallenge) {
    throw new Error('Launchpad /index.html beklenen XSUAA login yönlendirmesini tetiklemedi!');
  }
  // Statik dosyanın UserInfo entegrasyonu denetimi
  const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'app', 'index.html'), 'utf8');
  if (!indexHtmlContent.includes('/user-api/currentUser') || !indexHtmlContent.includes('UserInfo')) {
    throw new Error('Launchpad index.html UserInfo entegrasyon kodunu içermiyor!');
  }
  console.log('  [OK] Fiori Launchpad Sandbox kabuğu (/index.html) gerçek XSUAA login koruması ve UserInfo entegrasyonuna sahip.');
  passedTests++;

  // -------------------------------------------------------------
  // 5. SAP HANA UYUMLULUĞU DENETİMİ (Kural 2)
  // -------------------------------------------------------------
  console.log('\n>>> 5. SAP HANA UYUMLULUĞU DENETİMİ (Kural 2)');
  const ddlStatements = cds.compile.to.sql(cds.model, { dialect: 'hana' });
  if (!Array.isArray(ddlStatements) || ddlStatements.length === 0) {
    throw new Error('SAP HANA DDL ifadeleri üretilemedi!');
  }
  console.log(`  [OK] SAP HANA DDL (${ddlStatements.length} ifade) başarıyla derlendi (Kural 2 korundu).`);
  passedTests++;

  console.log('\n================================================================');
  console.log(`FAZ 7.3 TÜM HİBRİT XSUAA TESTLERİ BAŞARIYLA TAMAMLANDI! (${passedTests}/${passedTests})`);
  console.log('================================================================');

  // Sunucuları temiz bir şekilde kapat
  capServer.close();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ HATA:', err.message);
  process.exit(1);
});
