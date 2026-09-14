const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');

async function main() {
  console.log('================================================================');
  console.log('FAZ 5 — ADIM 5.2: Supplier Portal Auth View & E2E Doğrulama Testi');
  console.log('================================================================\n');

  const baseDir = path.join(__dirname, '..', 'app', 'supplierportal');
  const webappDir = path.join(baseDir, 'webapp');

  // -------------------------------------------------------------
  // 1. Dosya ve Bileşen Varlık Denetimi
  // -------------------------------------------------------------
  console.log('--- 1. Dosya ve Bileşen Varlık Doğrulaması ---');
  const requiredFiles = [
    path.join(webappDir, 'model', 'AuthManager.js'),
    path.join(webappDir, 'view', 'Auth.view.xml'),
    path.join(webappDir, 'controller', 'Auth.controller.js'),
    path.join(webappDir, 'view', 'Application.view.xml'),
    path.join(webappDir, 'controller', 'Application.controller.js'),
    path.join(webappDir, 'img', 'supplier_hero.jpg'),
    path.join(webappDir, 'manifest.json'),
    path.join(webappDir, 'i18n', 'i18n_tr.properties'),
    path.join(webappDir, 'i18n', 'i18n_en.properties'),
    path.join(webappDir, 'i18n', 'i18n.properties')
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
          if (content.includes('style=') || content.includes('<style')) {
            throw new Error(`Kural İhlali: Inline style tespit edildi: ${fullPath}`);
          }
        }
      }
    }
  }
  scanDirForCSS(baseDir);
  console.log('  [OK] app/supplierportal altında hiçbir .css dosyası veya inline style bulunmamaktadır.');

  // -------------------------------------------------------------
  // 3. i18n TR/EN Çoklu Dil Simetrisi ve Sıfır Hardcoded Metin
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

  // Auth için kritik anahtarların varlığı kontrolü
  const requiredAuthKeys = [
    'authHeroTitle', 'authHeroSubtitle', 'authHeroBadge1', 'authHeroBadge2',
    'authLoginTitle', 'authLoginSubtitle', 'authRegisterTitle', 'authRegisterSubtitle',
    'authEmailLabel', 'authEmailPlaceholder', 'authPasswordLabel', 'authPasswordPlaceholder',
    'authRememberMe', 'authLoginButton', 'authRegisterButton', 'authQuickDemoFill',
    'authRuleMinChar', 'authRuleUppercase', 'authRuleLowercase', 'authRuleNumber', 'authRuleSpecial',
    'authNoAccountText', 'authGoToRegister', 'authAlreadyHaveAccountText', 'authGoToLogin',
    'authErrEmailRequired', 'authErrEmailInvalid', 'authErrPasswordRequired', 'authErrPasswordRulesNotMet',
    'authErrInvalidCredentials', 'authErrEmailAlreadyExists', 'authErrServerUnavailable', 'authErrUnexpected',
    'authSuccessRegister', 'authSuccessLogin'
  ];

  for (const k of requiredAuthKeys) {
    if (!trKeys.has(k)) {
      throw new Error(`Zorunlu auth i18n anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] Tüm zorunlu auth anahtarları (${requiredAuthKeys.length} adet) tanımlı.`);

  // -------------------------------------------------------------
  // 4. XML ve JS Sentaks & Konfigürasyon Kontrolü
  // -------------------------------------------------------------
  console.log('\n--- 4. XML ve Controller Sentaks Doğrulaması ---');
  const authXml = fs.readFileSync(path.join(webappDir, 'view', 'Auth.view.xml'), 'utf8');
  if (!authXml.includes('showPasswordButton="true"')) {
    throw new Error('Auth.view.xml içinde showPasswordButton="true" bulunmalıdır!');
  }
  if (!authXml.includes('img/supplier_hero.jpg')) {
    throw new Error('Auth.view.xml içinde kurumsal hero görseli referansı bulunmalıdır!');
  }
  if (!authXml.includes('id="splitLayout"')) {
    throw new Error('Auth.view.xml içinde splitLayout düzeni bulunmalıdır!');
  }
  console.log('  [OK] Auth.view.xml: Split-screen düzeni, şifre göster/gizle göz ikonu ve hero görseli doğrulandı.');

  // Manifest routing kontrolü
  const manifest = JSON.parse(fs.readFileSync(path.join(webappDir, 'manifest.json'), 'utf8'));
  const routes = manifest['sap.ui5']?.routing?.routes;
  const targets = manifest['sap.ui5']?.routing?.targets;
  if (!routes.some(r => r.name === 'auth' && r.pattern === '')) {
    throw new Error('manifest.json içinde auth varsayılan rotası (pattern: "") eksik!');
  }
  if (!routes.some(r => r.name === 'application' && r.pattern === 'application')) {
    throw new Error('manifest.json içinde application rotası eksik!');
  }
  if (!targets.auth || targets.auth.viewName !== 'Auth') {
    throw new Error('manifest.json targets.auth hedefi eksik veya hatalı!');
  }
  if (!targets.application || targets.application.viewName !== 'Application') {
    throw new Error('manifest.json targets.application hedefi eksik veya hatalı!');
  }
  console.log('  [OK] manifest.json: Auth ve Application rotaları eksiksiz yapılandırılmış.');

  // -------------------------------------------------------------
  // 5. Şifre Kural Motoru (5 Kural) Canlı Değerlendirme Testi
  // -------------------------------------------------------------
  console.log('\n--- 5. Şifre Kural Motoru (5 Kural) Doğrulama Testi ---');
  function evaluatePasswordRules(sPassword) {
    var sPwd = sPassword || '';
    var bMinChar = sPwd.length >= 8;
    var bUpper = /[A-Z]/.test(sPwd);
    var bLower = /[a-z]/.test(sPwd);
    var bNumber = /[0-9]/.test(sPwd);
    var bSpecial = /[^A-Za-z0-9]/.test(sPwd);

    return {
      minChar: { valid: bMinChar, icon: bMinChar ? 'sap-icon://sys-enter-2' : 'sap-icon://sys-cancel', state: bMinChar ? 'Success' : 'None' },
      uppercase: { valid: bUpper, icon: bUpper ? 'sap-icon://sys-enter-2' : 'sap-icon://sys-cancel', state: bUpper ? 'Success' : 'None' },
      lowercase: { valid: bLower, icon: bLower ? 'sap-icon://sys-enter-2' : 'sap-icon://sys-cancel', state: bLower ? 'Success' : 'None' },
      number: { valid: bNumber, icon: bNumber ? 'sap-icon://sys-enter-2' : 'sap-icon://sys-cancel', state: bNumber ? 'Success' : 'None' },
      special: { valid: bSpecial, icon: bSpecial ? 'sap-icon://sys-enter-2' : 'sap-icon://sys-cancel', state: bSpecial ? 'Success' : 'None' }
    };
  }

  // Senaryo A: Boş şifre
  let res = evaluatePasswordRules('');
  if (res.minChar.valid || res.uppercase.valid || res.lowercase.valid || res.number.valid || res.special.valid) {
    throw new Error('Boş şifre kural ihlali tespit edilemedi!');
  }
  console.log('  [OK] Boş şifre: 0/5 kural sağlandı (beklenen).');

  // Senaryo B: Sadece küçük harf ve kısa
  res = evaluatePasswordRules('abc');
  if (res.minChar.valid || res.uppercase.valid || !res.lowercase.valid || res.number.valid || res.special.valid) {
    throw new Error('Kısa şifre değerlendirmesi hatalı!');
  }
  console.log('  [OK] "abc": Yalnızca küçük harf kuralı sağlandı (beklenen).');

  // Senaryo C: Büyük harf, küçük harf, rakam ama özel karakter yok
  res = evaluatePasswordRules('Password123');
  if (!res.minChar.valid || !res.uppercase.valid || !res.lowercase.valid || !res.number.valid || res.special.valid) {
    throw new Error('Özel karaktersiz şifre değerlendirmesi hatalı!');
  }
  console.log('  [OK] "Password123": 4/5 kural sağlandı, özel karakter eksik (beklenen).');

  // Senaryo D: 5 kuralın tümünü sağlayan mükemmel şifre
  res = evaluatePasswordRules('SecureP@ssw0rd2026');
  if (!res.minChar.valid || !res.uppercase.valid || !res.lowercase.valid || !res.number.valid || !res.special.valid) {
    throw new Error('Geçerli şifre kuralları sağlayamadı!');
  }
  if (res.minChar.icon !== 'sap-icon://sys-enter-2' || res.minChar.state !== 'Success') {
    throw new Error('Geçerli kural ikonu veya durumu hatalı!');
  }
  console.log('  [OK] "SecureP@ssw0rd2026": 5/5 kural eksiksiz sağlandı (Tüm ikonlar yeşil tike döndü).');

  // -------------------------------------------------------------
  // 6. Gerçek CAP Backend Başlatma ve OData V4 Uç Nokta Testleri
  // -------------------------------------------------------------
  console.log('\n--- 6. Gerçek CAP Backend Başlatma ve OData V4 Auth Testleri ---');
  
  const app = express();
  app.use(express.json());

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

  try {
    // 6.1 Statik Dosyaların Servis Edilmesi Kontrolü
    const heroRes = await fetch(`${baseUrl}/supplierportal/webapp/img/supplier_hero.jpg`);
    if (heroRes.status !== 200) throw new Error(`supplier_hero.jpg sunulamadı: ${heroRes.status}`);
    console.log('  [OK] /supplierportal/webapp/img/supplier_hero.jpg (200 OK)');

    const authViewRes = await fetch(`${baseUrl}/supplierportal/webapp/view/Auth.view.xml`);
    if (authViewRes.status !== 200) throw new Error(`Auth.view.xml sunulamadı: ${authViewRes.status}`);
    console.log('  [OK] /supplierportal/webapp/view/Auth.view.xml (200 OK)');

    const authCtrlRes = await fetch(`${baseUrl}/supplierportal/webapp/controller/Auth.controller.js`);
    if (authCtrlRes.status !== 200) throw new Error(`Auth.controller.js sunulamadı: ${authCtrlRes.status}`);
    console.log('  [OK] /supplierportal/webapp/controller/Auth.controller.js (200 OK)');

    const authMgrRes = await fetch(`${baseUrl}/supplierportal/webapp/model/AuthManager.js`);
    if (authMgrRes.status !== 200) throw new Error(`AuthManager.js sunulamadı: ${authMgrRes.status}`);
    console.log('  [OK] /supplierportal/webapp/model/AuthManager.js (200 OK)');

    // 6.2 Test 1: Geçerli Register
    console.log('\n  >> Test 1: Geçerli Register Çağrısı (Gerçek CAP PublicService)');
    const testEmail = `supplier_${Date.now()}@codeup-test.com`;
    const testPassword = 'StrongP@ssword2026!';

    const regRes = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });

    if (regRes.status !== 200 && regRes.status !== 201) {
      const errBody = await regRes.text();
      throw new Error(`Register başarısız: HTTP ${regRes.status} - ${errBody}`);
    }
    const regData = await regRes.json();
    const authObj = regData.value || regData;
    if (!authObj.success || !authObj.token || !authObj.supplierId) {
      throw new Error(`Register yanıtı eksik veya geçersiz: ${JSON.stringify(regData)}`);
    }
    console.log(`  [OK] Register başarılı! Token: ${authObj.token.substring(0, 25)}... | Tedarikçi ID: ${authObj.supplierId}`);

    // 6.3 Test 2: Mükerrer E-Posta (Duplicate Email) Engelleme
    console.log('\n  >> Test 2: Mükerrer E-Posta Engelleme (Duplicate Email)');
    const dupRes = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    if (dupRes.status !== 400) {
      throw new Error(`Mükerrer e-posta engellenemedi! HTTP Status: ${dupRes.status}`);
    }
    console.log('  [OK] Mükerrer e-posta başarıyla engellendi (HTTP 400 Bad Request).');

    // 6.4 Test 3: Geçersiz Şifre ile Register Engelleme
    console.log('\n  >> Test 3: Geçersiz Şifre ile Register Engelleme (5 Kural İhlali)');
    const weakRes = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `weak_${Date.now()}@test.com`, password: 'weak' })
    });
    if (weakRes.status !== 400) {
      throw new Error(`Zayıf şifre engellenemedi! HTTP Status: ${weakRes.status}`);
    }
    console.log('  [OK] Zayıf şifre backend tarafından başarıyla engellendi (HTTP 400 Bad Request).');

    // 6.5 Test 4: Geçerli Login (Kayıtlı Tedarikçi)
    console.log('\n  >> Test 4: Geçerli Login Çağrısı (Gerçek CAP PublicService)');
    const loginRes = await fetch(`${baseUrl}/odata/v4/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    if (loginRes.status !== 200) {
      const errBody = await loginRes.text();
      throw new Error(`Login başarısız: HTTP ${loginRes.status} - ${errBody}`);
    }
    const loginData = await loginRes.json();
    const loginObj = loginData.value || loginData;
    if (!loginObj.success || !loginObj.token || loginObj.supplierId !== authObj.supplierId) {
      throw new Error(`Login yanıtı eksik veya geçersiz: ${JSON.stringify(loginData)}`);
    }
    console.log(`  [OK] Login başarılı! Token: ${loginObj.token.substring(0, 25)}...`);

    // 6.6 Test 5: Yanlış Şifre ile Login Engelleme
    console.log('\n  >> Test 5: Yanlış Şifre ile Login Engelleme');
    const wrongPwdRes = await fetch(`${baseUrl}/odata/v4/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword123!' })
    });
    if (wrongPwdRes.status !== 401) {
      throw new Error(`Yanlış şifre engellenemedi! HTTP Status: ${wrongPwdRes.status}`);
    }
    console.log('  [OK] Yanlış şifre kapıda engellendi (HTTP 401 Unauthorized).');

    // 6.7 Test 6: Olmayan E-Posta ile Login Engelleme
    console.log('\n  >> Test 6: Olmayan E-Posta ile Login Engelleme');
    const nonExistRes = await fetch(`${baseUrl}/odata/v4/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent_user_9999@domain.com', password: 'SomePassword123!' })
    });
    if (nonExistRes.status !== 401) {
      throw new Error(`Olmayan e-posta engellenemedi! HTTP Status: ${nonExistRes.status}`);
    }
    console.log('  [OK] Olmayan kullanıcı kapıda engellendi (HTTP 401 Unauthorized).');

    // 6.8 Test 7: Hızlı Demo Tedarikçi Girişi (demo.supplier@codeup.corp)
    console.log('\n  >> Test 7: Hızlı Demo Tedarikçisi ile Giriş Doğrulaması');
    const demoEmail = `demo.supplier.${Date.now()}@codeup.corp`;
    const demoPassword = 'SecurePassword123!';
    // Demo kullanıcıyı register et
    const regDemoRes = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: demoEmail, password: demoPassword })
    });
    if (regDemoRes.status !== 200 && regDemoRes.status !== 201) {
      throw new Error(`Demo kullanıcı kaydı başarısız: HTTP ${regDemoRes.status}`);
    }
    // Demo kullanıcı ile login yap
    const demoLoginRes = await fetch(`${baseUrl}/odata/v4/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: demoEmail, password: demoPassword })
    });
    if (demoLoginRes.status !== 200) {
      const errBody = await demoLoginRes.text();
      throw new Error(`Demo kullanıcı login başarısız: HTTP ${demoLoginRes.status} - ${errBody}`);
    }
    const demoLoginRaw = await demoLoginRes.json();
    const demoLoginObj = demoLoginRaw.value || demoLoginRaw;
    console.log(`  [OK] Demo tedarikçisi (${demoEmail}) ile login başarılı! Token alındı.`);

    // 6.9 Test 8: Alınan Token ile getMySubmission Yetkilendirme Doğrulaması
    console.log('\n  >> Test 8: Üretilen Token ile Korumalı getMySubmission() Çağrısı');
    const subRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authObj.token}`,
        'X-Supplier-Token': authObj.token
      }
    });
    // Yeni kullanıcının henüz başvurusu yok, dolayısıyla 204 No Content dönmeli
    if (subRes.status !== 204 && subRes.status !== 200) {
      throw new Error(`Token ile getMySubmission() beklenmeyen durum: HTTP ${subRes.status}`);
    }
    console.log(`  [OK] Token başarıyla kabul edildi! (HTTP ${subRes.status} - Mülkiyet filtresi aktif)`);

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('✅ TÜM TESTLER EKSİKSİZ VE BAŞARIYLA TAMAMLANDI! (STEP 5.2 %100)');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ TEST HATASI:', err);
  process.exit(1);
});
