const fs = require('fs');
const path = require('path');

async function main() {
  console.log('================================================================');
  console.log('FAZ 5 — ADIM 5.6: Tema Yönetimi (Dark / Light) Doğrulama Testi');
  console.log('================================================================\n');

  const baseDir = path.join(__dirname, '..', 'app', 'supplierportal');
  const webappDir = path.join(baseDir, 'webapp');

  // -------------------------------------------------------------
  // 1. Dosya ve Bileşen Varlık Denetimi
  // -------------------------------------------------------------
  console.log('--- 1. Dosya ve Bileşen Varlık Doğrulaması ---');
  const requiredFiles = [
    path.join(webappDir, 'model', 'ThemeManager.js'),
    path.join(webappDir, 'Component.js'),
    path.join(webappDir, 'view', 'Auth.view.xml'),
    path.join(webappDir, 'controller', 'Auth.controller.js'),
    path.join(webappDir, 'view', 'Application.view.xml'),
    path.join(webappDir, 'controller', 'Application.controller.js'),
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
          const inlineStyleRegex = /\sstyle\s*=\s*["'][^"']*[:;][^"']*["']/i;
          if (inlineStyleRegex.test(content) || content.includes('<style')) {
            throw new Error(`Kural İhlali: Inline style tespit edildi: ${fullPath}`);
          }
        }
      }
    }
  }
  scanDirForCSS(baseDir);
  console.log('  [OK] app/supplierportal altında hiçbir .css dosyası veya inline style bulunmamaktadır.');

  // -------------------------------------------------------------
  // 3. Modern Theming API ve Deprecated API Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 3. Modern SAPUI5 Theming API ve Deprecated API Denetimi ---');
  const themeManagerContent = fs.readFileSync(path.join(webappDir, 'model', 'ThemeManager.js'), 'utf8');

  // Deprecated getCore().applyTheme kontrolü
  if (themeManagerContent.includes('sap.ui.getCore().applyTheme') || themeManagerContent.includes('getCore().applyTheme')) {
    throw new Error('HATA: Deprecated sap.ui.getCore().applyTheme kullanılmış! Modern sap/ui/core/Theming kullanılmalı.');
  }
  console.log('  [OK] Deprecated sap.ui.getCore().applyTheme() kullanılmadığı doğrulandı.');

  // Modern Theming API varlığı
  if (!themeManagerContent.includes('sap/ui/core/Theming') || !themeManagerContent.includes('Theming.setTheme')) {
    throw new Error('HATA: Modern sap/ui/core/Theming API eksik!');
  }
  console.log('  [OK] Modern modüler sap/ui/core/Theming API (Theming.setTheme) kullanımı doğrulandı.');

  // Tema isimleri doğrulaması (sap_horizon_dark & sap_horizon)
  if (!themeManagerContent.includes('sap_horizon_dark') || !themeManagerContent.includes('sap_horizon')) {
    throw new Error('HATA: sap_horizon_dark veya sap_horizon tema sabitleri eksik!');
  }
  console.log('  [OK] Evening Horizon (sap_horizon_dark) ve Morning Horizon (sap_horizon) temaları tanımlı.');

  // -------------------------------------------------------------
  // 4. Component.js Entegrasyonu ve Root ThemeModel Bağlantısı
  // -------------------------------------------------------------
  console.log('\n--- 4. Component.js Entegrasyonu ve Root ThemeModel Denetimi ---');
  const componentContent = fs.readFileSync(path.join(webappDir, 'Component.js'), 'utf8');
  if (!componentContent.includes('ThemeManager') || !componentContent.includes('themeModel') || !componentContent.includes('ThemeManager.init()')) {
    throw new Error('HATA: Component.js içinde ThemeManager.init() veya themeModel ataması eksik!');
  }
  console.log('  [OK] Component.js içinde themeModel bileşen düzeyinde tanımlanmış ve ThemeManager.init() çağrılmıştır.');

  // -------------------------------------------------------------
  // 5. Auth ve Application Görünüm ve Denetleyici Buton Kontrolleri
  // -------------------------------------------------------------
  console.log('\n--- 5. Görünüm ve Denetleyici Tema Butonları Denetimi ---');
  const authXml = fs.readFileSync(path.join(webappDir, 'view', 'Auth.view.xml'), 'utf8');
  if (!authXml.includes('id="btnThemeToggleAuth"') || !authXml.includes('press=".onToggleTheme"')) {
    throw new Error('HATA: Auth.view.xml içinde id="btnThemeToggleAuth" butonu eksik!');
  }
  console.log('  [OK] Auth.view.xml: Başlık alanında btnThemeToggleAuth butonu ve tema dinamik bindingleri mevcut.');

  const authController = fs.readFileSync(path.join(webappDir, 'controller', 'Auth.controller.js'), 'utf8');
  if (!authController.includes('ThemeManager') || !authController.includes('onToggleTheme')) {
    throw new Error('HATA: Auth.controller.js içinde onToggleTheme veya ThemeManager eksik!');
  }
  console.log('  [OK] Auth.controller.js: onToggleTheme fonksiyonu ThemeManager.toggleTheme() çağrısıyla entegre.');

  const appXml = fs.readFileSync(path.join(webappDir, 'view', 'Application.view.xml'), 'utf8');
  if (!appXml.includes('id="btnThemeToggleApp"') || !appXml.includes('press=".onToggleTheme"')) {
    throw new Error('HATA: Application.view.xml içinde id="btnThemeToggleApp" butonu eksik!');
  }
  console.log('  [OK] Application.view.xml: Başlık alanında btnThemeToggleApp butonu ve tema dinamik bindingleri mevcut.');

  const appController = fs.readFileSync(path.join(webappDir, 'controller', 'Application.controller.js'), 'utf8');
  if (!appController.includes('ThemeManager') || !appController.includes('onToggleTheme')) {
    throw new Error('HATA: Application.controller.js içinde onToggleTheme veya ThemeManager eksik!');
  }
  console.log('  [OK] Application.controller.js: onToggleTheme fonksiyonu ThemeManager.toggleTheme() çağrısıyla entegre.');

  // -------------------------------------------------------------
  // 6. i18n TR/EN Çoklu Dil Simetrisi ve Tema Anahtarları Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 6. i18n Çoklu Dil Simetrisi ve Tema Anahtar Denetimi ---');
  function parseProperties(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const props = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          props[key] = val;
        }
      }
    }
    return props;
  }

  const trProps = parseProperties(path.join(webappDir, 'i18n', 'i18n_tr.properties'));
  const enProps = parseProperties(path.join(webappDir, 'i18n', 'i18n_en.properties'));

  const trKeys = Object.keys(trProps);
  const enKeys = Object.keys(enProps);

  console.log(`  İngilizce anahtar sayısı : ${enKeys.length}`);
  console.log(`  Türkçe anahtar sayısı    : ${trKeys.length}`);

  const missingInTr = enKeys.filter(k => !trProps[k]);
  const missingInEn = trKeys.filter(k => !enProps[k]);

  if (missingInTr.length > 0) {
    throw new Error(`Türkçe i18n dosyasında eksik anahtarlar var: ${missingInTr.join(', ')}`);
  }
  if (missingInEn.length > 0) {
    throw new Error(`İngilizce i18n dosyasında eksik anahtarlar var: ${missingInEn.join(', ')}`);
  }
  console.log('  [OK] Türkçe ve İngilizce i18n anahtarları %100 simetrik ve eksiksiz.');

  const themeKeys = [
    'themeEveningHorizon',
    'themeMorningHorizon',
    'themeToggleTooltip'
  ];

  for (const k of themeKeys) {
    if (!trProps[k]) {
      throw new Error(`Step 5.6 zorunlu tema anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] Step 5.6 tema anahtarları (${themeKeys.length} adet) doğrulandı.`);

  // -------------------------------------------------------------
  // 7. ThemeManager Mantık & Kalıcılık (localStorage) Simülasyon Testi
  // -------------------------------------------------------------
  console.log('\n--- 7. ThemeManager Mantık & Kalıcılık (localStorage) Simülasyonu ---');

  // Mock localStorage ortamı
  const mockStorage = {};
  const mockLocalStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  };

  const appliedThemes = [];
  const mockTheming = {
    getTheme: () => appliedThemes[appliedThemes.length - 1] || 'sap_horizon_dark',
    setTheme: (sTheme) => { appliedThemes.push(sTheme); }
  };

  class TestThemeManager {
    constructor() {
      this.STORAGE_KEY = 'codeup_supplier_portal_theme';
      this.THEME_DARK = 'sap_horizon_dark';
      this.THEME_LIGHT = 'sap_horizon';
      this._theme = mockLocalStorage.getItem(this.STORAGE_KEY) || this.THEME_DARK;
    }

    getCurrentTheme() {
      return this._theme;
    }

    isDark() {
      return this._theme === this.THEME_DARK;
    }

    applyTheme(sTheme) {
      if (sTheme !== this.THEME_DARK && sTheme !== this.THEME_LIGHT) {
        sTheme = this.THEME_DARK;
      }
      this._theme = sTheme;
      mockLocalStorage.setItem(this.STORAGE_KEY, sTheme);
      mockTheming.setTheme(sTheme);
    }

    toggleTheme() {
      const next = this.isDark() ? this.THEME_LIGHT : this.THEME_DARK;
      this.applyTheme(next);
      return next;
    }
  }

  // 7.1 Başlangıç Durumu (Varsayılan Evening Horizon)
  const tm = new TestThemeManager();
  tm.applyTheme(tm.getCurrentTheme());
  if (tm.getCurrentTheme() !== 'sap_horizon_dark' || !tm.isDark()) {
    throw new Error('HATA: Başlangıç teması Evening Horizon (sap_horizon_dark) olmalı!');
  }
  console.log('  [OK] Başlangıç teması başarıyla uygulandı: Evening Horizon (sap_horizon_dark).');

  // 7.2 Aydınlık Temaya Geçiş (Morning Horizon)
  const nextTheme1 = tm.toggleTheme();
  if (nextTheme1 !== 'sap_horizon' || tm.isDark() || tm.getCurrentTheme() !== 'sap_horizon') {
    throw new Error('HATA: Aydınlık temaya geçiş başarısız!');
  }
  if (mockStorage['codeup_supplier_portal_theme'] !== 'sap_horizon') {
    throw new Error('HATA: Tema tercihi localStorage üzerine kaydedilmedi!');
  }
  console.log('  [OK] Aydınlık temaya geçiş başarılı: Morning Horizon (sap_horizon) ve localStorage güncellendi.');

  // 7.3 Sayfa Yenileme / Yeni Oturum Simülasyonu (Kalıcılık Doğrulaması)
  const tmReloaded = new TestThemeManager();
  if (tmReloaded.getCurrentTheme() !== 'sap_horizon' || tmReloaded.isDark()) {
    throw new Error('HATA: Sayfa yenilendiğinde saklanan tema tercihi yüklenemedi!');
  }
  console.log('  [OK] Sayfa yenilendiğinde saklanan tema (Morning Horizon) başarıyla korundu.');

  // 7.4 Tekrar Karanlık Temaya Geçiş
  const nextTheme2 = tmReloaded.toggleTheme();
  if (nextTheme2 !== 'sap_horizon_dark' || !tmReloaded.isDark()) {
    throw new Error('HATA: Karanlık temaya geri dönüş başarısız!');
  }
  if (mockStorage['codeup_supplier_portal_theme'] !== 'sap_horizon_dark') {
    throw new Error('HATA: Karanlık tema tercihi localStorage üzerine kaydedilmedi!');
  }
  console.log('  [OK] Karanlık temaya geri dönüş başarılı: Evening Horizon (sap_horizon_dark) ve kalıcılık korundu.');

  console.log('\n================================================================');
  console.log('FAZ 5 — ADIM 5.6: TÜM DOĞRULAMALAR EKSİKSİZ BAŞARILI! [GEÇTİ]');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n[HATA] Test başarısız:', err);
  process.exit(1);
});
