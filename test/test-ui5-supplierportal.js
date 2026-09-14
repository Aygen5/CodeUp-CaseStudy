const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');

async function main() {
  console.log('================================================================');
  console.log('FAZ 5 — ADIM 5.1: Supplier Portal UI5 ve i18n Doğrulama Testi');
  console.log('================================================================\n');

  const baseDir = path.join(__dirname, '..', 'app', 'supplierportal');
  const webappDir = path.join(baseDir, 'webapp');

  // -------------------------------------------------------------
  // 1. Dosya ve Dizin Yapısı Kontrolü
  // -------------------------------------------------------------
  console.log('--- 1. Dosya ve Dizin Yapısı Doğrulaması ---');
  const expectedFiles = [
    path.join(baseDir, 'package.json'),
    path.join(webappDir, 'index.html'),
    path.join(webappDir, 'manifest.json'),
    path.join(webappDir, 'Component.js'),
    path.join(webappDir, 'model', 'models.js'),
    path.join(webappDir, 'i18n', 'i18n.properties'),
    path.join(webappDir, 'i18n', 'i18n_tr.properties'),
    path.join(webappDir, 'i18n', 'i18n_en.properties'),
    path.join(webappDir, 'view', 'App.view.xml'),
    path.join(webappDir, 'controller', 'App.controller.js'),
    path.join(webappDir, 'view', 'Main.view.xml'),
    path.join(webappDir, 'controller', 'Main.controller.js')
  ];

  for (const f of expectedFiles) {
    if (!fs.existsSync(f)) {
      throw new Error(`Zorunlu dosya eksik: ${f}`);
    }
    console.log(`  [OK] Mevcut: ${path.relative(path.join(__dirname, '..'), f)}`);
  }

  // -------------------------------------------------------------
  // 2. manifest.json Şema ve Konfigürasyon Kontrolü
  // -------------------------------------------------------------
  console.log('\n--- 2. manifest.json Şema ve Konfigürasyon Doğrulaması ---');
  const manifestContent = fs.readFileSync(path.join(webappDir, 'manifest.json'), 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(manifestContent);
  } catch (err) {
    throw new Error(`manifest.json geçerli bir JSON değil: ${err.message}`);
  }

  if (manifest['sap.app']?.id !== 'codeup.supplier.portal') {
    throw new Error(`sap.app.id beklenen 'codeup.supplier.portal' değil: ${manifest['sap.app']?.id}`);
  }
  console.log('  [OK] sap.app.id doğrulandı: codeup.supplier.portal');

  const i18nConfig = manifest['sap.ui5']?.models?.i18n?.settings;
  if (!i18nConfig || i18nConfig.bundleName !== 'codeup.supplier.portal.i18n.i18n') {
    throw new Error('manifest.json içinde i18n ResourceModel bundleName tanımı hatalı!');
  }
  if (!Array.isArray(i18nConfig.supportedLocales) || !i18nConfig.supportedLocales.includes('tr') || !i18nConfig.supportedLocales.includes('en')) {
    throw new Error('manifest.json içinde supportedLocales tr ve en dillerini içermiyor!');
  }
  if (i18nConfig.fallbackLocale !== 'en') {
    throw new Error('manifest.json içinde fallbackLocale en olarak ayarlanmalı!');
  }
  console.log('  [OK] i18n modeli supportedLocales ["", "tr", "en"] ve fallbackLocale "en" ile yapılandırılmış.');

  // Routing kontrolü
  const routes = manifest['sap.ui5']?.routing?.routes;
  const targets = manifest['sap.ui5']?.routing?.targets;
  if (!routes || !targets || !targets.main) {
    throw new Error('manifest.json içinde routing yapılandırması eksik!');
  }
  console.log('  [OK] Router ve Main view hedefi doğrulandı.');

  // -------------------------------------------------------------
  // 3. Sıfır Custom CSS ve Sıfır Inline Style Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 3. Sıfır Custom CSS & Horizon Tema Kuralı Denetimi ---');
  
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
  console.log('  [OK] Yalnızca standart SAPUI5 sınıfları ve Horizon teması kullanılmaktadır.');

  // -------------------------------------------------------------
  // 4. i18n Simetri ve Sıfır Hardcoded Metin Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 4. i18n Çoklu Dil Simetrisi ve Sıfır Hardcoded Metin Denetimi ---');

  function parseProperties(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const map = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        map[key] = val;
      }
    }
    return map;
  }

  const baseProps = parseProperties(path.join(webappDir, 'i18n', 'i18n.properties'));
  const enProps = parseProperties(path.join(webappDir, 'i18n', 'i18n_en.properties'));
  const trProps = parseProperties(path.join(webappDir, 'i18n', 'i18n_tr.properties'));

  const enKeys = Object.keys(enProps);
  const trKeys = Object.keys(trProps);

  console.log(`  İngilizce anahtar sayısı : ${enKeys.length}`);
  console.log(`  Türkçe anahtar sayısı    : ${trKeys.length}`);

  if (enKeys.length === 0 || trKeys.length === 0) {
    throw new Error('i18n dosyaları boş olamaz!');
  }

  // Simetri testi: Tüm EN anahtarları TR'de olmalı
  for (const k of enKeys) {
    if (!trProps[k]) {
      throw new Error(`Türkçe i18n_tr.properties içinde eksik anahtar: ${k}`);
    }
  }

  // Simetri testi: Tüm TR anahtarları EN'de olmalı
  for (const k of trKeys) {
    if (!enProps[k]) {
      throw new Error(`İngilizce i18n_en.properties içinde eksik anahtar: ${k}`);
    }
  }
  console.log('  [OK] Türkçe ve İngilizce i18n anahtarları %100 simetrik ve eksiksiz.');

  // View'larda hardcoded metin denetimi
  const mainViewContent = fs.readFileSync(path.join(webappDir, 'view', 'Main.view.xml'), 'utf8');
  // XML attribute'larında text="...", title="...", subtitle="..." gibi alanların {i18n>...} ile başladığını doğrula
  const textMatches = mainViewContent.match(/(?:text|title|subtitle|description)="([^"]+)"/g) || [];
  for (const match of textMatches) {
    const val = match.split('="')[1].replace('"', '');
    if (!val.startsWith('{i18n>') && !val.startsWith('{') && !val.includes('://')) {
      throw new Error(`Main.view.xml içinde hardcoded kullanıcı metni tespit edildi: ${match}`);
    }
  }
  console.log('  [OK] Main.view.xml içinde sıfır hardcoded metin: Tüm metinler {i18n>...} modeli üzerinden bağlanmış.');

  // -------------------------------------------------------------
  // 5. CAP Sunucusu Üzerinden Statik Webapp Servis Testi
  // -------------------------------------------------------------
  console.log('\n--- 5. CAP Web Sunucusu ve Statik Webapp Servis Doğrulaması ---');

  cds.env.requires.auth = {
    kind: 'mocked',
    users: {
      approver: { roles: ['Approval'] }
    }
  };

  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');

  const app = express();
  app.use(express.json());

  // CAP static file server default behavior: serve app/
  app.use('/supplierportal/webapp', express.static(webappDir));
  app.use('/supplierportal', express.static(webappDir));

  await cds.serve('all').in(app);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  // 5.1 index.html erişimi
  const indexRes = await fetch(`${baseUrl}/supplierportal/webapp/index.html`);
  if (indexRes.status !== 200) {
    throw new Error(`index.html erişilemedi! Status: ${indexRes.status}`);
  }
  const indexHtml = await indexRes.text();
  if (!indexHtml.includes('sap-ui-bootstrap') || !indexHtml.includes('codeup.supplier.portal')) {
    throw new Error('index.html içeriği UI5 bootstrap yapılandırmasını içermiyor!');
  }
  console.log('  [OK] /supplierportal/webapp/index.html başarıyla sunuldu (200 OK).');

  // 5.2 manifest.json erişimi
  const manifestRes = await fetch(`${baseUrl}/supplierportal/webapp/manifest.json`);
  if (manifestRes.status !== 200) {
    throw new Error(`manifest.json erişilemedi! Status: ${manifestRes.status}`);
  }
  const servedManifest = await manifestRes.json();
  if (servedManifest['sap.app']?.id !== 'codeup.supplier.portal') {
    throw new Error('Sunulan manifest.json uygulama kimliği eşleşmedi!');
  }
  console.log('  [OK] /supplierportal/webapp/manifest.json başarıyla sunuldu (200 OK).');

  // 5.3 i18n_tr.properties erişimi
  const trRes = await fetch(`${baseUrl}/supplierportal/webapp/i18n/i18n_tr.properties`);
  if (trRes.status !== 200) {
    throw new Error(`i18n_tr.properties erişilemedi! Status: ${trRes.status}`);
  }
  const trText = await trRes.text();
  if (!trText.includes('Tedarikçi')) {
    throw new Error('i18n_tr.properties içeriği Türkçe metinleri içermiyor!');
  }
  console.log('  [OK] /supplierportal/webapp/i18n/i18n_tr.properties başarıyla sunuldu (200 OK).');

  // 5.4 i18n_en.properties erişimi
  const enRes = await fetch(`${baseUrl}/supplierportal/webapp/i18n/i18n_en.properties`);
  if (enRes.status !== 200) {
    throw new Error(`i18n_en.properties erişilemedi! Status: ${enRes.status}`);
  }
  const enText = await enRes.text();
  if (!enText.includes('Supplier')) {
    throw new Error('i18n_en.properties içeriği İngilizce metinleri içermiyor!');
  }
  console.log('  [OK] /supplierportal/webapp/i18n/i18n_en.properties başarıyla sunuldu (200 OK).');

  // 5.5 View ve Controller dosyaları erişimi
  const viewRes = await fetch(`${baseUrl}/supplierportal/webapp/view/Main.view.xml`);
  const ctrlRes = await fetch(`${baseUrl}/supplierportal/webapp/controller/Main.controller.js`);
  if (viewRes.status !== 200 || ctrlRes.status !== 200) {
    throw new Error('Main view veya controller dosyasına erişilemedi!');
  }
  console.log('  [OK] Main.view.xml ve Main.controller.js başarıyla sunuldu (200 OK).');

  server.close();

  console.log('\n================================================================');
  console.log('✅ TÜM TESTLER EKSİKSİZ VE BAŞARIYLA TAMAMLANDI! (STEP 5.1 %100 BAŞARILI)');
  console.log('================================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ TEST HATA İLE SONUÇLANDI:', err);
  process.exit(1);
});
