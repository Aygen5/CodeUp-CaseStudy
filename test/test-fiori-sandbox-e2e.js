/**
 * test/test-fiori-sandbox-e2e.js
 * 
 * FAZ 7.2: Local SAP Fiori Launchpad Sandbox & Approuter E2E Doğrulama Testi
 * 
 * Bu test:
 * 1. app/index.html ve app/appconfig/fioriSandboxConfig.json dosyalarının varlığını ve sözdizimini doğrular.
 * 2. Launchpad Sandbox konfigürasyonunun (applications, tiles, semantic targets, icons) eksiksizliğini denetler.
 * 3. Canlı Approuter sunucusu başlatarak /index.html, / ve /appconfig/fioriSandboxConfig.json rotalarını HTTP üzerinden test eder.
 * 4. UI5 Component hedeflerinin (/supplierportal/Component.js) Approuter üzerinden erişilebilir olduğunu doğrular.
 * 5. Özel CSS ve inline style yasağına (Horizon temasının korunması) uygunluğu denetler.
 * 6. SAP HANA uyumluluğunu doğrular.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
let passedTests = 0;

async function runTests() {
  console.log('================================================================');
  console.log('FAZ 7.2: SAP FIORI LAUNCHPAD SANDBOX & APPROUTER E2E TEST BAŞLIYOR');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. STATİK DOSYA VE BOM KONTROLLERİ
  // -------------------------------------------------------------
  console.log('>>> 1. STATİK DOSYA VE BOM KONTROLLERİ');

  const indexPath = path.join(rootDir, 'app', 'index.html');
  const configPath = path.join(rootDir, 'app', 'appconfig', 'fioriSandboxConfig.json');

  if (!fs.existsSync(indexPath)) {
    throw new Error('app/index.html dosyası bulunamadı!');
  }
  if (!fs.existsSync(configPath)) {
    throw new Error('app/appconfig/fioriSandboxConfig.json dosyası bulunamadı!');
  }

  // BOM Kontrolü
  const indexBuf = fs.readFileSync(indexPath);
  if (indexBuf[0] === 0xEF && indexBuf[1] === 0xBB && indexBuf[2] === 0xBF) {
    throw new Error('app/index.html dosyasında UTF-8 BOM tespit edildi!');
  }

  const configBuf = fs.readFileSync(configPath);
  if (configBuf[0] === 0xEF && configBuf[1] === 0xBB && configBuf[2] === 0xBF) {
    throw new Error('app/appconfig/fioriSandboxConfig.json dosyasında UTF-8 BOM tespit edildi!');
  }
  console.log('  [OK] app/index.html ve app/appconfig/fioriSandboxConfig.json mevcut ve UTF-8 (BOM-suz).');
  passedTests++;

  // -------------------------------------------------------------
  // 2. LAUNCHPAD SANDBOX KONFİGÜRASYON DENETİMİ
  // -------------------------------------------------------------
  console.log('\n>>> 2. LAUNCHPAD SANDBOX KONFİGÜRASYON DENETİMİ');

  let sandboxConfig;
  try {
    sandboxConfig = JSON.parse(configBuf.toString('utf8'));
  } catch (e) {
    throw new Error(`fioriSandboxConfig.json geçerli bir JSON değil: ${e.message}`);
  }

  // 2.1 Applications Kontrolü
  if (!sandboxConfig.applications) {
    throw new Error('fioriSandboxConfig.json içinde "applications" nesnesi eksik!');
  }

  const portalApp = sandboxConfig.applications['SupplierPortal-display'];
  if (!portalApp) {
    throw new Error('applications["SupplierPortal-display"] tanımı eksik!');
  }
  if (portalApp.additionalInformation !== 'SAPUI5.Component=codeup.supplier.portal' || portalApp.url !== '/supplierportal') {
    throw new Error('SupplierPortal-display uygulama ayarları hatalı!');
  }

  const approvalsApp = sandboxConfig.applications['SupplierApprovals-manage'];
  if (!approvalsApp) {
    throw new Error('applications["SupplierApprovals-manage"] tanımı eksik!');
  }
  if (approvalsApp.additionalInformation !== 'SAPUI5.Component=codeup.supplier.approvals' || approvalsApp.url !== '/supplier-approvals') {
    throw new Error('SupplierApprovals-manage uygulama ayarları hatalı!');
  }
  console.log('  [OK] Inbound Semantic Objects tanımlı: #SupplierPortal-display ve #SupplierApprovals-manage.');
  passedTests++;

  // 2.2 Tiles & Groups Kontrolü
  const groups = sandboxConfig.services?.LaunchPageAdapter?.config?.groups;
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('LaunchPageAdapter config içinde groups tanımlanmamış!');
  }

  const group = groups[0];
  const tiles = group.tiles;
  if (!Array.isArray(tiles) || tiles.length < 2) {
    throw new Error('Fiori Launchpad grubunda en az 2 tile bulunmalıdır!');
  }

  const tilePortal = tiles.find(t => t.properties?.targetURL === '#SupplierPortal-display');
  const tileApprovals = tiles.find(t => t.properties?.targetURL === '#SupplierApprovals-manage');

  if (!tilePortal) {
    throw new Error('Supplier Portal için #SupplierPortal-display hedefli tile bulunamadı!');
  }
  if (tilePortal.properties.title !== 'Supplier Portal' || tilePortal.properties.icon !== 'sap-icon://supplier') {
    throw new Error('Supplier Portal tile özellikleri (başlık/ikon) hatalı!');
  }

  if (!tileApprovals) {
    throw new Error('Supplier Approvals için #SupplierApprovals-manage hedefli tile bulunamadı!');
  }
  if (tileApprovals.properties.title !== 'Supplier Approvals' || tileApprovals.properties.icon !== 'sap-icon://approvals') {
    throw new Error('Supplier Approvals tile özellikleri (başlık/ikon) hatalı!');
  }
  console.log('  [OK] Launchpad Tiles doğrulandı: Supplier Portal (sap-icon://supplier) ve Supplier Approvals (sap-icon://approvals).');
  passedTests++;

  // -------------------------------------------------------------
  // 3. INDEX.HTML BOOTSTRAP VE TASARIM DENETİMİ
  // -------------------------------------------------------------
  console.log('\n>>> 3. INDEX.HTML BOOTSTRAP VE TASARIM DENETİMİ');

  const indexContent = indexBuf.toString('utf8');

  // Ushell sandbox bootstrap script
  if (!indexContent.includes('sap-ushell-bootstrap') || !indexContent.includes('sandbox.js')) {
    throw new Error('index.html ushell sandbox bootstrap scripti (sandbox.js) içermiyor!');
  }

  // SAPUI5 Core bootstrap script
  if (!indexContent.includes('sap-ui-core.js')) {
    throw new Error('index.html sap-ui-core.js bootstrap scripti içermiyor!');
  }

  // sap_horizon teması
  if (!indexContent.includes('sap_horizon')) {
    throw new Error('index.html sap_horizon teması içermiyor!');
  }

  // Resource roots
  if (!indexContent.includes('codeup.supplier.portal') || !indexContent.includes('codeup.supplier.approvals')) {
    throw new Error('index.html data-sap-ui-resourceroots içinde bileşen kökleri tanımlanmamış!');
  }

  // ushell renderer fiori2
  if (!indexContent.includes('sap.ushell.Container.createRenderer')) {
    throw new Error('index.html fiori2 renderer başlatma çağrısı içermiyor!');
  }

  // Özel CSS veya Inline Style Yasağı (Kural 4)
  if (indexContent.includes('<style') || indexContent.includes('.css')) {
    throw new Error('index.html içinde özel CSS veya style etiketi tespit edildi (Kural 4 ihlali)!');
  }
  console.log('  [OK] app/index.html ushell sandbox, sap-ui-core, sap_horizon teması ve fiori2 renderer ile uyumlu; sıfır özel CSS.');
  passedTests++;

  // -------------------------------------------------------------
  // 4. CANLI APPROUTER HTTP SUNUCU TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 4. CANLI APPROUTER HTTP SUNUCU TESTLERİ');

  // Approuter başlatma ortam değişkenleri
  process.env.destinations = JSON.stringify([
    {
      name: 'srv-api',
      url: 'http://localhost:4004',
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
  const testPort = 5096;

  await new Promise((resolve, reject) => {
    ar.start({ port: testPort }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  console.log(`  [INFO] SAP Approuter Test Sunucusu Başlatıldı: http://localhost:${testPort}`);
  passedTests++;

  const approuterUrl = `http://localhost:${testPort}`;

  // 4.1 GET /index.html
  const resIndex = await fetch(`${approuterUrl}/index.html`);
  if (resIndex.status !== 200) {
    throw new Error(`GET /index.html başarısız! Status: ${resIndex.status}`);
  }
  const textIndex = await resIndex.text();
  if (!textIndex.includes('CodeUp Supplier Management — Fiori Launchpad') || !textIndex.includes('sap-ushell-bootstrap')) {
    throw new Error('GET /index.html beklenen Fiori Launchpad içeriğini döndürmedi!');
  }
  console.log('  [OK] GET /index.html HTTP 200 ile Fiori Launchpad Sandbox kabuğunu döndürdü.');
  passedTests++;

  // 4.2 GET / (Varsayılan index.html)
  const resRoot = await fetch(`${approuterUrl}/`);
  if (resRoot.status !== 200) {
    throw new Error(`GET / başarısız! Status: ${resRoot.status}`);
  }
  const textRoot = await resRoot.text();
  if (!textRoot.includes('CodeUp Supplier Management — Fiori Launchpad')) {
    throw new Error('GET / index.html belgesini döndürmedi!');
  }
  console.log('  [OK] GET / kök rotası index.html belgesini başarıyla sundu.');
  passedTests++;

  // 4.3 GET /appconfig/fioriSandboxConfig.json
  const resConfig = await fetch(`${approuterUrl}/appconfig/fioriSandboxConfig.json`);
  if (resConfig.status !== 200) {
    throw new Error(`GET /appconfig/fioriSandboxConfig.json başarısız! Status: ${resConfig.status}`);
  }
  const jsonConfig = await resConfig.json();
  if (!jsonConfig.applications?.['SupplierPortal-display'] || !jsonConfig.applications?.['SupplierApprovals-manage']) {
    throw new Error('GET /appconfig/fioriSandboxConfig.json beklenen konfigürasyonu döndürmedi!');
  }
  console.log('  [OK] GET /appconfig/fioriSandboxConfig.json HTTP 200 ile geçerli JSON konfigürasyonunu sundu.');
  passedTests++;

  // 4.4 GET /supplierportal/Component.js
  const resPortalComp = await fetch(`${approuterUrl}/supplierportal/Component.js`);
  if (resPortalComp.status !== 200) {
    throw new Error(`GET /supplierportal/Component.js yüklenemedi! Status: ${resPortalComp.status}`);
  }
  const textPortalComp = await resPortalComp.text();
  if (!textPortalComp.includes('codeup.supplier.portal.Component')) {
    throw new Error('Supplier Portal Component.js içeriği doğrulanamadı!');
  }
  console.log('  [OK] GET /supplierportal/Component.js Launchpad embed yüklemesi için hazır ve HTTP 200 döndürdü.');
  passedTests++;

  // 4.5 GET /supplierportal/manifest.json
  const resPortalManifest = await fetch(`${approuterUrl}/supplierportal/manifest.json`);
  if (resPortalManifest.status !== 200) {
    throw new Error(`GET /supplierportal/manifest.json yüklenemedi! Status: ${resPortalManifest.status}`);
  }
  console.log('  [OK] GET /supplierportal/manifest.json HTTP 200 döndürdü.');
  passedTests++;

  // -------------------------------------------------------------
  // 5. SAP HANA MODEL DERLEME KONTROLÜ (Kural 2)
  // -------------------------------------------------------------
  console.log('\n>>> 5. SAP HANA MODEL DERLEME KONTROLÜ (Kural 2)');
  try {
    const cds = require('@sap/cds');
    const csn = await cds.load('*');
    const ddlStatements = cds.compile.to.sql(csn, { dialect: 'hana' });
    if (!Array.isArray(ddlStatements) || ddlStatements.length === 0) {
      throw new Error('HANA DDL ifadeleri üretilemedi!');
    }
    const hasHanaTables = ddlStatements.some(s => s.includes('CREATE TABLE codeup_supplier_management_'));
    if (!hasHanaTables) {
      throw new Error('HANA DDL içinde beklenen tablolar bulunamadı!');
    }
    console.log(`  [OK] cds.compile.to.sql(..., { dialect: 'hana' }) başarıyla ${ddlStatements.length} adet SAP HANA DDL ifadesi üretti (Kural 2 korundu).`);
    passedTests++;
  } catch (err) {
    throw new Error(`SAP HANA derleme hatası: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log(`FAZ 7.2 TÜM E2E DOĞRULAMA TESTLERİ BAŞARIYLA TAMAMLANDI! (${passedTests}/${passedTests})`);
  console.log('================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ:', err.message);
  process.exit(1);
});
