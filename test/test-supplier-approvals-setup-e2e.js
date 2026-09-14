/**
 * ============================================================================
 * FAZ 6 — ADIM 6.1: Supplier Approvals UI5 Proje Kurulumu ve i18n Doğrulama Testi
 * ============================================================================
 * Bu test modülü:
 * 1. Dosya ve bileşen varlığını,
 * 2. Sıfır custom CSS ve inline style kuralını,
 * 3. i18n TR/EN %100 simetrisini ve fallback uyumunu,
 * 4. XML View'larda sıfır hardcoded metin kuralını,
 * 5. Manifest.json ve namespace tutarlılığını,
 * 6. Sahte yetkilendirme (admin=true / Approval=true) yokluğunu,
 * 7. Canlı CAP test sunucusunda statik kaynak erişimini (HTTP 200),
 * 8. Faz 5 Supplier Portal regresyon kontrolünü
 * doğrular.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const cds = require('@sap/cds');

function parseProperties(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const map = {};
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx !== -1) {
            const key = line.substring(0, eqIdx).trim();
            const val = line.substring(eqIdx + 1).trim();
            map[key] = val;
        }
    }
    return map;
}

function scanForCssAndStyle(dirPath) {
    const violations = [];
    function walk(curr) {
        const files = fs.readdirSync(curr, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(curr, file.name);
            if (file.isDirectory()) {
                walk(fullPath);
            } else {
                if (file.name.endsWith('.css')) {
                    violations.push({ file: fullPath, reason: 'Custom .css file detected' });
                }
                if (file.name.endsWith('.xml') || file.name.endsWith('.html')) {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    if (/\bstyle\s*=\s*["'][^"']+["']/i.test(content)) {
                        violations.push({ file: fullPath, reason: 'Inline style attribute detected' });
                    }
                }
            }
        }
    }
    walk(dirPath);
    return violations;
}

async function runTests() {
    console.log("================================================================");
    console.log("FAZ 6 — ADIM 6.1: Supplier Approvals UI5 Kurulum ve i18n Testi");
    console.log("================================================================\n");

    const rootDir = path.resolve(__dirname, '..');
    const approvalsDir = path.join(rootDir, 'app', 'supplier-approvals', 'webapp');

    // --- 1. Dosya ve Bileşen Varlık Doğrulaması ---
    console.log("--- 1. Dosya ve Bileşen Varlık Doğrulaması ---");
    const requiredFiles = [
        path.join(approvalsDir, 'index.html'),
        path.join(approvalsDir, 'manifest.json'),
        path.join(approvalsDir, 'Component.js'),
        path.join(approvalsDir, 'model', 'models.js'),
        path.join(approvalsDir, 'view', 'App.view.xml'),
        path.join(approvalsDir, 'controller', 'App.controller.js'),
        path.join(approvalsDir, 'view', 'Main.view.xml'),
        path.join(approvalsDir, 'controller', 'Main.controller.js'),
        path.join(approvalsDir, 'i18n', 'i18n_tr.properties'),
        path.join(approvalsDir, 'i18n', 'i18n_en.properties'),
        path.join(approvalsDir, 'i18n', 'i18n.properties')
    ];

    for (const f of requiredFiles) {
        if (!fs.existsSync(f)) {
            throw new Error(`Kritik dosya eksik: ${f}`);
        }
        console.log(`  [OK] Mevcut: ${path.relative(rootDir, f)}`);
    }

    // --- 2. Sıfır Custom CSS & Inline Style Denetimi ---
    console.log("\n--- 2. Sıfır Custom CSS & Inline Style Denetimi ---");
    const cssViolations = scanForCssAndStyle(path.join(rootDir, 'app', 'supplier-approvals'));
    if (cssViolations.length > 0) {
        throw new Error(`Sıfır CSS kuralı ihlali: ${JSON.stringify(cssViolations, null, 2)}`);
    }
    console.log("  [OK] app/supplier-approvals altında hiçbir .css dosyası veya inline style bulunmamaktadır.");

    // --- 3. Manifest.json ve Namespace Tutarlılığı Denetimi ---
    console.log("\n--- 3. Manifest.json ve Namespace Tutarlılığı Denetimi ---");
    const manifestPath = path.join(approvalsDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    if (manifest["sap.app"].id !== "codeup.supplier.approvals") {
        throw new Error(`Geçersiz sap.app.id: ${manifest["sap.app"].id}`);
    }
    console.log(`  [OK] sap.app.id: ${manifest["sap.app"].id}`);

    if (manifest["sap.ui5"].rootView.viewName !== "codeup.supplier.approvals.view.App") {
        throw new Error(`Geçersiz rootView: ${manifest["sap.ui5"].rootView.viewName}`);
    }
    console.log(`  [OK] RootView: ${manifest["sap.ui5"].rootView.viewName}`);

    const i18nModel = manifest["sap.ui5"].models.i18n;
    if (i18nModel.settings.bundleName !== "codeup.supplier.approvals.i18n.i18n") {
        throw new Error(`Geçersiz i18n bundleName: ${i18nModel.settings.bundleName}`);
    }
    if (!i18nModel.settings.supportedLocales.includes("tr") || !i18nModel.settings.supportedLocales.includes("en")) {
        throw new Error("i18n supportedLocales içinde tr ve en bulunmalıdır.");
    }
    if (i18nModel.settings.fallbackLocale !== "en") {
        throw new Error("i18n fallbackLocale 'en' olmalıdır.");
    }
    console.log("  [OK] i18n model ayarları (tr, en, fallback: en) doğrulandı.");

    // --- 4. i18n TR / EN %100 Simetri ve Anahtar Denetimi ---
    console.log("\n--- 4. i18n TR / EN %100 Simetri ve Anahtar Denetimi ---");
    const trMap = parseProperties(path.join(approvalsDir, 'i18n', 'i18n_tr.properties'));
    const enMap = parseProperties(path.join(approvalsDir, 'i18n', 'i18n_en.properties'));
    const defaultMap = parseProperties(path.join(approvalsDir, 'i18n', 'i18n.properties'));

    const trKeys = Object.keys(trMap);
    const enKeys = Object.keys(enMap);
    const defaultKeys = Object.keys(defaultMap);

    console.log(`  Türkçe anahtar sayısı : ${trKeys.length}`);
    console.log(`  İngilizce anahtar sayısı: ${enKeys.length}`);
    console.log(`  Fallback anahtar sayısı : ${defaultKeys.length}`);

    if (trKeys.length !== enKeys.length) {
        throw new Error(`i18n anahtar sayısı uyuşmuyor! TR: ${trKeys.length}, EN: ${enKeys.length}`);
    }

    for (const key of trKeys) {
        if (!enMap[key]) {
            throw new Error(`İngilizce kaynakta '${key}' anahtarı eksik!`);
        }
        if (!defaultMap[key]) {
            throw new Error(`Default fallback kaynakta '${key}' anahtarı eksik!`);
        }
    }
    console.log("  [OK] Türkçe, İngilizce ve Fallback anahtarları %100 simetrik ve eksiksiz.");

    // --- 5. XML Görünümünde Sıfır Hardcoded Metin Denetimi ---
    console.log("\n--- 5. XML Görünümünde Sıfır Hardcoded Metin Denetimi ---");
    const mainViewContent = fs.readFileSync(path.join(approvalsDir, 'view', 'Main.view.xml'), 'utf-8');

    // Title, text, subtitle, tooltip attribute'larında hardcoded metin arama (örn. text="Sistem")
    const hardcodedMatches = mainViewContent.match(/\b(title|text|subtitle|tooltip|placeholder|headerText)\s*=\s*"([^"{][^"]*)"/g);
    if (hardcodedMatches && hardcodedMatches.length > 0) {
        // İzin verilen kontrol adları veya formatlar dışındakileri kontrol et
        const realHardcoded = hardcodedMatches.filter(m => !m.includes('=""'));
        if (realHardcoded.length > 0) {
            throw new Error(`Main.view.xml içinde hardcoded metin tespit edildi: ${realHardcoded.join(', ')}`);
        }
    }
    console.log("  [OK] Main.view.xml içinde hiçbir kullanıcı metni hardcoded değildir (tümü {i18n>...}).");

    // --- 6. Sahte Yetkilendirme / Rol Kontrolü Yokluğu Denetimi ---
    console.log("\n--- 6. Sahte Yetkilendirme / Rol Kontrolü Yokluğu Denetimi ---");
    const jsFiles = [
        path.join(approvalsDir, 'Component.js'),
        path.join(approvalsDir, 'controller', 'App.controller.js'),
        path.join(approvalsDir, 'controller', 'Main.controller.js')
    ];
    for (const jsFile of jsFiles) {
        const content = fs.readFileSync(jsFile, 'utf-8');
        if (/admin\s*=\s*true/i.test(content) || /Approval\s*=\s*true/i.test(content) || /isAdmin/i.test(content)) {
            throw new Error(`Sahte yetki kontrolü tespit edildi: ${jsFile}`);
        }
    }
    console.log("  [OK] İstemci kodlarında sahte yetkilendirme bayrağı bulunmamaktadır.");

    // --- 7. Canlı CAP Test Sunucusu ve Statik Kaynak Sunumu ---
    console.log("\n--- 7. Canlı CAP Test Sunucusu ve Statik Kaynak Sunumu ---");
    const express = require('express');
    const app = express();
    app.use('/supplier-approvals/webapp', express.static(approvalsDir));
    app.use('/supplierportal/webapp', express.static(path.join(rootDir, 'app', 'supplierportal', 'webapp')));

    cds.model = await cds.load('*').then(cds.linked);
    await cds.connect.to('db');
    await cds.serve('all').in(app);

    const server = app.listen(0);
    const testPort = server.address().port;
    console.log(`  [OK] Canlı CAP test sunucusu ayağa kaldırıldı: http://localhost:${testPort}`);

    function get(urlPath) {
        return new Promise((resolve, reject) => {
            http.get(`http://localhost:${testPort}${urlPath}`, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body }));
            }).on('error', reject);
        });
    }

    try {
        const resIndex = await get('/supplier-approvals/webapp/index.html');
        if (resIndex.status !== 200 || !resIndex.body.includes('codeup.supplier.approvals')) {
            throw new Error(`/supplier-approvals/webapp/index.html erişilemedi! HTTP ${resIndex.status}`);
        }
        console.log("  [OK] /supplier-approvals/webapp/index.html (200 OK)");

        const resManifest = await get('/supplier-approvals/webapp/manifest.json');
        if (resManifest.status !== 200 || !resManifest.body.includes('codeup.supplier.approvals')) {
            throw new Error(`/supplier-approvals/webapp/manifest.json erişilemedi! HTTP ${resManifest.status}`);
        }
        console.log("  [OK] /supplier-approvals/webapp/manifest.json (200 OK)");

        const resComp = await get('/supplier-approvals/webapp/Component.js');
        if (resComp.status !== 200 || !resComp.body.includes('Component.extend')) {
            throw new Error(`/supplier-approvals/webapp/Component.js erişilemedi! HTTP ${resComp.status}`);
        }
        console.log("  [OK] /supplier-approvals/webapp/Component.js (200 OK)");

        const resTr = await get('/supplier-approvals/webapp/i18n/i18n_tr.properties');
        if (resTr.status !== 200 || !resTr.body.includes('cockpitHeader')) {
            throw new Error(`/supplier-approvals/webapp/i18n/i18n_tr.properties erişilemedi! HTTP ${resTr.status}`);
        }
        console.log("  [OK] /supplier-approvals/webapp/i18n/i18n_tr.properties (200 OK)");

        const resEn = await get('/supplier-approvals/webapp/i18n/i18n_en.properties');
        if (resEn.status !== 200 || !resEn.body.includes('cockpitHeader')) {
            throw new Error(`/supplier-approvals/webapp/i18n/i18n_en.properties erişilemedi! HTTP ${resEn.status}`);
        }
        console.log("  [OK] /supplier-approvals/webapp/i18n/i18n_en.properties (200 OK)");

        // --- 8. Faz 5 Supplier Portal Regresyon Kontrolü ---
        console.log("\n--- 8. Faz 5 Supplier Portal Regresyon Kontrolü ---");
        const resPortal = await get('/supplierportal/webapp/index.html');
        if (resPortal.status !== 200 || !resPortal.body.includes('codeup.supplier.portal')) {
            throw new Error(`Supplier Portal erişim hatası! HTTP ${resPortal.status}`);
        }
        console.log("  [OK] /supplierportal/webapp/index.html (200 OK) - Faz 5 tamamen korundu.");

    } finally {
        server.close();
    }

    console.log("\n================================================================");
    console.log("FAZ 6 — ADIM 6.1: TÜM DOĞRULAMALAR EKSİKSİZ BAŞARILI! [GEÇTİ]");
    console.log("================================================================");
    process.exit(0);
}

runTests().catch(err => {
    console.error("\n❌ TEST BAŞARISIZ:", err);
    process.exit(1);
});
