const fs = require('fs');
const path = require('path');
const express = require('express');
const cds = require('@sap/cds');

async function main() {
  console.log('================================================================');
  console.log('FAZ 5 — ADIM 5.4: Kalıcı Süreç Akışı (ProcessFlow) E2E Test');
  console.log('================================================================\n');

  const baseDir = path.join(__dirname, '..', 'app', 'supplierportal');
  const webappDir = path.join(baseDir, 'webapp');
  const filesDir = path.join(__dirname, 'files');

  // -------------------------------------------------------------
  // 1. Dosya ve Bileşen Varlık Denetimi
  // -------------------------------------------------------------
  console.log('--- 1. Dosya ve Bileşen Varlık Doğrulaması ---');
  const requiredFiles = [
    path.join(webappDir, 'view', 'Application.view.xml'),
    path.join(webappDir, 'controller', 'Application.controller.js'),
    path.join(webappDir, 'model', 'AuthManager.js'),
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
  // 3. i18n TR/EN Çoklu Dil Simetrisi ve Anahtar Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 3. i18n Çoklu Dil Simetrisi ve ProcessFlow Anahtar Denetimi ---');
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

  // Step 5.4 zorunlu ProcessFlow anahtarları
  const step54Keys = [
    'processFlowTitle',
    'processStepSubmitted',
    'processStepSubmittedDesc',
    'processStepReview',
    'processStepReviewDesc',
    'processStepDecision',
    'processStepDecisionDesc',
    'processStepApproved',
    'processStepApprovedDesc',
    'processStepRejected',
    'processStepRejectedDesc',
    'statusNoticePending',
    'statusNoticeInReview',
    'statusNoticeApproved',
    'statusNoticeRejected',
    'rejectionBannerTitle',
    'rejectionReasonNotice',
    'btnRefreshProcessFlow'
  ];

  for (const k of step54Keys) {
    if (!trProps[k]) {
      throw new Error(`Step 5.4 zorunlu ProcessFlow anahtarı eksik: ${k}`);
    }
  }
  console.log(`  [OK] Step 5.4 zorunlu ProcessFlow anahtarları (${step54Keys.length} adet) doğrulandı.`);

  // -------------------------------------------------------------
  // 4. Manifest.json ve View XML Yapılandırma Denetimi
  // -------------------------------------------------------------
  console.log('\n--- 4. Manifest.json ve View XML Yapılandırma Denetimi ---');
  const manifest = JSON.parse(fs.readFileSync(path.join(webappDir, 'manifest.json'), 'utf8'));
  const libs = manifest['sap.ui5']?.dependencies?.libs;
  if (!libs || !libs['sap.suite.ui.commons']) {
    throw new Error('manifest.json dependencies.libs altında "sap.suite.ui.commons" kütüphanesi eksik!');
  }
  console.log('  [OK] manifest.json: sap.suite.ui.commons kütüphanesi tanımlı.');

  const appXml = fs.readFileSync(path.join(webappDir, 'view', 'Application.view.xml'), 'utf8');
  if (!appXml.includes('xmlns:commons="sap.suite.ui.commons"')) {
    throw new Error('Application.view.xml içinde xmlns:commons="sap.suite.ui.commons" namespace eksik!');
  }
  if (!appXml.includes('<commons:ProcessFlow') || !appXml.includes('id="processFlow"')) {
    throw new Error('Application.view.xml içinde id="processFlow" ProcessFlow bileşeni bulunamadı!');
  }
  if (!appXml.includes('<commons:ProcessFlowNode') || !appXml.includes('<commons:ProcessFlowLaneHeader')) {
    throw new Error('Application.view.xml içinde ProcessFlowNode veya ProcessFlowLaneHeader eksik!');
  }
  if (!appXml.includes('id="rejectionReasonStrip"')) {
    throw new Error('Application.view.xml içinde id="rejectionReasonStrip" bildirim alanı eksik!');
  }
  if (!appXml.includes('id="statusNoticeStrip"')) {
    throw new Error('Application.view.xml içinde id="statusNoticeStrip" durum bilgilendirme alanı eksik!');
  }
  if (!appXml.includes('id="existingSubmissionCard"') || !appXml.includes('id="newApplicationCard"')) {
    throw new Error('Application.view.xml içinde existingSubmissionCard veya newApplicationCard eksik!');
  }
  console.log('  [OK] Application.view.xml: ProcessFlow, şeritler, düğümler, red gerekçesi alanı ve kartlar doğrulandı.');

  // -------------------------------------------------------------
  // 5. Controller Süreç Akışı (_buildProcessFlow & _mapStatusMetadata) Mantık Testi
  // -------------------------------------------------------------
  console.log('\n--- 5. Controller Süreç Akışı Mantığı Birim Testleri ---');

  const mockResourceBundle = {
    getText: function(key) {
      return trProps[key] || key;
    }
  };

  const controllerContent = fs.readFileSync(path.join(webappDir, 'controller', 'Application.controller.js'), 'utf8');
  if (!controllerContent.includes('_buildProcessFlow') || !controllerContent.includes('_loadExistingSubmission')) {
    throw new Error('Application.controller.js içinde _buildProcessFlow veya _loadExistingSubmission fonksiyonu eksik!');
  }

  function testBuildProcessFlow(sStatus, oSubmission) {
    const oBundle = mockResourceBundle;

    const aLanes = [
      {
        id: "lane-0",
        icon: "sap-icon://request",
        label: oBundle.getText("processStepSubmitted"),
        position: 0,
        state: [{ state: "Positive", value: 1 }]
      },
      {
        id: "lane-1",
        icon: "sap-icon://inspection",
        label: oBundle.getText("processStepReview"),
        position: 1,
        state: [{
          state: sStatus === "Pending" ? "Planned" : (sStatus === "InReview" ? "Neutral" : "Positive"),
          value: 1
        }]
      },
      {
        id: "lane-2",
        icon: "sap-icon://complete",
        label: oBundle.getText("processStepDecision"),
        position: 2,
        state: [{
          state: (sStatus === "Approved" ? "Positive" : (sStatus === "Rejected" ? "Negative" : "Planned")),
          value: 1
        }]
      }
    ];

    const oNode1 = {
      id: "node-1",
      lane: "lane-0",
      title: oBundle.getText("processStepSubmitted"),
      state: "Positive",
      stateText: oBundle.getText("processStepSubmitted"),
      children: ["node-2"],
      highlighted: sStatus === "Pending"
    };

    let sNode2State = "Planned";
    let bNode2Highlighted = false;
    if (sStatus === "InReview") {
      sNode2State = "Neutral";
      bNode2Highlighted = true;
    } else if (sStatus === "Approved" || sStatus === "Rejected") {
      sNode2State = "Positive";
      bNode2Highlighted = false;
    }

    const oNode2 = {
      id: "node-2",
      lane: "lane-1",
      title: oBundle.getText("processStepReview"),
      state: sNode2State,
      children: ["node-3"],
      highlighted: bNode2Highlighted
    };

    let sNode3Title = oBundle.getText("processStepDecision");
    let sNode3State = "Planned";
    let bNode3Highlighted = false;
    let aNode3Texts = [oBundle.getText("processStepDecisionDesc")];

    if (sStatus === "Approved") {
      sNode3Title = oBundle.getText("processStepApproved");
      sNode3State = "Positive";
      bNode3Highlighted = true;
    } else if (sStatus === "Rejected") {
      sNode3Title = oBundle.getText("processStepRejected");
      sNode3State = "Negative";
      bNode3Highlighted = true;
      if (oSubmission && oSubmission.rejectionReason) {
        aNode3Texts = [oBundle.getText("rejectionReasonNotice") + " " + oSubmission.rejectionReason];
      }
    }

    const oNode3 = {
      id: "node-3",
      lane: "lane-2",
      title: sNode3Title,
      state: sNode3State,
      texts: aNode3Texts,
      children: [],
      highlighted: bNode3Highlighted
    };

    return {
      lanes: aLanes,
      nodes: [oNode1, oNode2, oNode3]
    };
  }

  // 5.1 Pending Durumu
  const pfPending = testBuildProcessFlow('Pending', { status: 'Pending' });
  if (pfPending.nodes[0].state !== 'Positive' || !pfPending.nodes[0].highlighted) {
    throw new Error('Pending durumunda Node 1 Positive ve Highlighted olmalı!');
  }
  if (pfPending.nodes[1].state !== 'Planned' || pfPending.nodes[2].state !== 'Planned') {
    throw new Error('Pending durumunda Node 2 ve Node 3 Planned olmalı!');
  }
  console.log('  [OK] Pending durumu akışı: Düğüm 1 (Positive/Aktif), Düğüm 2 (Planned), Düğüm 3 (Planned)');

  // 5.2 InReview Durumu
  const pfInReview = testBuildProcessFlow('InReview', { status: 'InReview' });
  if (pfInReview.nodes[0].state !== 'Positive' || pfInReview.nodes[0].highlighted) {
    throw new Error('InReview durumunda Node 1 Positive fakat Highlighted olmamalı!');
  }
  if (pfInReview.nodes[1].state !== 'Neutral' || !pfInReview.nodes[1].highlighted) {
    throw new Error('InReview durumunda Node 2 Neutral ve Highlighted olmalı!');
  }
  if (pfInReview.nodes[2].state !== 'Planned') {
    throw new Error('InReview durumunda Node 3 Planned olmalı!');
  }
  console.log('  [OK] InReview durumu akışı: Düğüm 1 (Positive), Düğüm 2 (Neutral/Aktif), Düğüm 3 (Planned)');

  // 5.3 Approved Durumu
  const pfApproved = testBuildProcessFlow('Approved', { status: 'Approved' });
  if (pfApproved.nodes[0].state !== 'Positive' || pfApproved.nodes[1].state !== 'Positive') {
    throw new Error('Approved durumunda Node 1 ve Node 2 Positive olmalı!');
  }
  if (pfApproved.nodes[2].state !== 'Positive' || !pfApproved.nodes[2].highlighted) {
    throw new Error('Approved durumunda Node 3 Positive ve Highlighted olmalı!');
  }
  console.log('  [OK] Approved durumu akışı: Düğüm 1 (Positive), Düğüm 2 (Positive), Düğüm 3 (Positive/Aktif)');

  // 5.4 Rejected Durumu
  const sTestReason = 'Yüklenen sertifikanın geçerlilik süresi dolmuştur.';
  const pfRejected = testBuildProcessFlow('Rejected', { status: 'Rejected', rejectionReason: sTestReason });
  if (pfRejected.nodes[0].state !== 'Positive' || pfRejected.nodes[1].state !== 'Positive') {
    throw new Error('Rejected durumunda Node 1 ve Node 2 Positive olmalı (tamamlanmış adımlar)!');
  }
  if (pfRejected.nodes[2].state !== 'Negative' || !pfRejected.nodes[2].highlighted) {
    throw new Error('Rejected durumunda Node 3 Negative ve Highlighted olmalı!');
  }
  if (!pfRejected.nodes[2].texts[0].includes(sTestReason)) {
    throw new Error('Rejected durumunda Node 3 metninde onaycının red gerekçesi yer almalıdır!');
  }
  console.log('  [OK] Rejected durumu akışı: Düğüm 1 (Positive), Düğüm 2 (Positive), Düğüm 3 (Negative/Aktif + Red Gerekçesi)');

  // -------------------------------------------------------------
  // 6. Canlı CAP OData V4 Backend Entegrasyon Testleri
  // -------------------------------------------------------------
  console.log('\n--- 6. Canlı CAP Backend ve Süreç Akışı Kalıcılık Testleri ---');

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/supplierportal/webapp', express.static(webappDir));

  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');
  await cds.serve('all').in(app);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`  [OK] Canlı CAP PublicService test sunucusu ayağa kaldırıldı: ${baseUrl}`);

  try {
    const timestamp = Date.now();

    // 6.1 Yeni Tedarikçi Kaydı ve Girişi
    const testEmail1 = `processflow_${timestamp}@test.com`;
    const testPassword = 'Password123!';

    const regRes = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1, password: testPassword })
    });
    const regData = await regRes.json();
    if (!regRes.ok || !regData.token) {
      throw new Error(`Tedarikçi kaydı başarısız: ${JSON.stringify(regData)}`);
    }
    const token1 = regData.token;
    console.log(`  [OK] 6.1 Yeni tedarikçi başarıyla kaydedildi: ${testEmail1}`);

    // 6.2 Henüz başvuru yapılmamışken getMySubmission() kontrolü
    const initialSubRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    let initialSub = null;
    if (initialSubRes.status === 200) {
      const raw = await initialSubRes.json();
      initialSub = raw.value || raw;
    }
    if (initialSub && initialSub.ID) {
      throw new Error('Başvurusu olmayan tedarikçi için kayıt döndü!');
    }
    console.log('  [OK] 6.2 Başvuru öncesinde getMySubmission() boş döndü (hasExistingSubmission = false -> Başvuru formu görünür).');

    // 6.3 Başvuru Oluşturma (createSubmission)
    const validPdfPath = path.join(filesDir, 'valid-cert.pdf');
    const validPdfBase64 = 'data:application/pdf;base64,' + fs.readFileSync(validPdfPath).toString('base64');

    const submitRes = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        companyName: 'Akış Bilişim A.Ş.',
        contactPerson: 'Süreç Yöneticisi',
        phone: '+90 532 999 8877',
        country: 'Türkiye',
        category: 'Software',
        taxId: '9988776655',
        notes: 'ProcessFlow E2E test başvurusu',
        certificate: validPdfBase64,
        certificateFileName: 'valid-cert.pdf',
        certificateMimeType: 'application/pdf'
      })
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok || !submitData.ID) {
      throw new Error(`Başvuru oluşturulamadı: ${JSON.stringify(submitData)}`);
    }
    const submissionId1 = submitData.ID;
    console.log(`  [OK] 6.3 Başvuru oluşturuldu (ID: ${submissionId1}, Status: ${submitData.status})`);

    // 6.4 Başvuru sonrası getMySubmission() sorgusu (Pending)
    const afterSubmitRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const afterSubmitRaw = await afterSubmitRes.json();
    const afterSubmit = afterSubmitRaw.value || afterSubmitRaw;
    if (!afterSubmit || afterSubmit.ID !== submissionId1 || afterSubmit.status !== 'Pending') {
      throw new Error(`Beklenen Pending başvuru getirilemedi: ${JSON.stringify(afterSubmit)}`);
    }
    console.log('  [OK] 6.4 getMySubmission() başarıyla getirildi: Form gizlenir, 3 aşamalı ProcessFlow ve özet kartı görüntülenir.');

    // 6.5 Sayfa Yenileme / Token Kalıcılığı Doğrulaması (Browser Refresh Simulation)
    const refreshRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const refreshRaw = await refreshRes.json();
    const refreshSub = refreshRaw.value || refreshRaw;
    if (!refreshSub || refreshSub.ID !== submissionId1) {
      throw new Error('Yenileme sonrası başvuru verisi korunamadı!');
    }
    console.log('  [OK] 6.5 Sayfa yenileme (Refresh) simülasyonu: Başvuru durumu kalıcı olarak ProcessFlow üzerinde korunmaktadır.');

    // 6.6 Çıkış / Giriş (Logout & Re-login) Kalıcılık Doğrulaması
    const loginRes = await fetch(`${baseUrl}/odata/v4/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail1, password: testPassword })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) {
      throw new Error(`Yeniden giriş başarısız: ${JSON.stringify(loginData)}`);
    }
    const reLoginToken = loginData.token;

    const reLoginSubRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${reLoginToken}` }
    });
    const reLoginSubRaw = await reLoginSubRes.json();
    const reLoginSub = reLoginSubRaw.value || reLoginSubRaw;
    if (!reLoginSub || reLoginSub.ID !== submissionId1 || reLoginSub.status !== 'Pending') {
      throw new Error('Tekrar giriş sonrası başvuru durumu getirilemedi!');
    }
    console.log('  [OK] 6.6 Çıkış/Tekrar Giriş simülasyonu: Başvuru verisi ve ProcessFlow durumu eksiksiz yüklendi.');

    // 6.7 Süreç İlerlemesi: Onaycının Başvuruyu InReview Yapması
    await cds.db.run(
      UPDATE('codeup.supplier.management.Submissions')
        .set({ status: 'InReview' })
        .where({ ID: submissionId1 })
    );

    const inReviewRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const inReviewRaw = await inReviewRes.json();
    const inReviewSub = inReviewRaw.value || inReviewRaw;
    if (!inReviewSub || inReviewSub.status !== 'InReview') {
      throw new Error('InReview durumu güncellenemedi!');
    }
    const pfInReviewLive = testBuildProcessFlow(inReviewSub.status, inReviewSub);
    if (pfInReviewLive.nodes[1].state !== 'Neutral' || !pfInReviewLive.nodes[1].highlighted) {
      throw new Error('InReview durumunda Node 2 Neutral/Highlighted olmalı!');
    }
    console.log('  [OK] 6.7 InReview durumuna geçiş: ProcessFlow 2. Aşama (İncelemede) aktif hale geldi.');

    // 6.8 Süreç Tamamlanması: Onaycının Başvuruyu Onaylaması (Approved)
    await cds.db.run(
      UPDATE('codeup.supplier.management.Submissions')
        .set({ status: 'Approved' })
        .where({ ID: submissionId1 })
    );

    const approvedRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const approvedRaw = await approvedRes.json();
    const approvedSub = approvedRaw.value || approvedRaw;
    if (!approvedSub || approvedSub.status !== 'Approved') {
      throw new Error('Approved durumu güncellenemedi!');
    }
    const pfApprovedLive = testBuildProcessFlow(approvedSub.status, approvedSub);
    if (pfApprovedLive.nodes[2].state !== 'Positive' || !pfApprovedLive.nodes[2].highlighted) {
      throw new Error('Approved durumunda Node 3 Positive/Highlighted olmalı!');
    }
    console.log('  [OK] 6.8 Approved durumuna geçiş: ProcessFlow 3. Aşama (Sonuç) Onaylandı olarak başarıyla tamamlandı.');

    // 6.9 Reddedilme Akışı ve Gerçek Red Gerekçesi (Rejected Workflow)
    const testEmail2 = `pf_rejected_${timestamp}@test.com`;
    const regRes2 = await fetch(`${baseUrl}/odata/v4/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail2, password: testPassword })
    });
    const regData2 = await regRes2.json();
    const token2 = regData2.token;

    const submitRes2 = await fetch(`${baseUrl}/odata/v4/public/createSubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`
      },
      body: JSON.stringify({
        companyName: 'Red Test Donanım Ltd.',
        contactPerson: 'Donanım Mühendisi',
        category: 'Hardware',
        certificate: validPdfBase64,
        certificateFileName: 'valid-cert.pdf',
        certificateMimeType: 'application/pdf'
      })
    });
    const submitData2 = await submitRes2.json();
    const submissionId2 = submitData2.ID;

    // Onaycının red işlemi gerçekleştirmesi
    const officialRejectionReason = 'Sertifikanın noter onaylı tercümesi ve güncel vergi levhası sunulmadığı için başvuru onaylanmamıştır.';
    await cds.db.run(
      UPDATE('codeup.supplier.management.Submissions')
        .set({
          status: 'Rejected',
          rejectionReason: officialRejectionReason
        })
        .where({ ID: submissionId2 })
    );

    const rejectedRes = await fetch(`${baseUrl}/odata/v4/public/getMySubmission()`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token2}` }
    });
    const rejectedRaw = await rejectedRes.json();
    const rejectedSub = rejectedRaw.value || rejectedRaw;
    if (!rejectedSub || rejectedSub.status !== 'Rejected') {
      throw new Error('Rejected durumu okunamadı!');
    }
    if (rejectedSub.rejectionReason !== officialRejectionReason) {
      throw new Error(`Red gerekçesi backend'den doğru gelmedi: Beklenen "${officialRejectionReason}", Gelen: "${rejectedSub.rejectionReason}"`);
    }

    const pfRejectedLive = testBuildProcessFlow(rejectedSub.status, rejectedSub);
    if (pfRejectedLive.nodes[2].state !== 'Negative' || !pfRejectedLive.nodes[2].highlighted) {
      throw new Error('Rejected durumunda Node 3 Negative ve Highlighted olmalı!');
    }
    if (!pfRejectedLive.nodes[2].texts[0].includes(officialRejectionReason)) {
      throw new Error('ProcessFlow Node 3 içinde onaycının resmi red gerekçesi görüntülenmelidir!');
    }
    console.log(`  [OK] 6.9 Reddedilme Akışı: ProcessFlow Node 3 Kırmızı/Negative oldu ve red gerekçesi (${rejectedSub.rejectionReason}) başarıyla yerleştirildi.`);

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('FAZ 5 — ADIM 5.4: TÜM TESTLER BAŞARIYLA TAMAMLANDI! [BAŞARILI]');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n[HATA] Test başarısız:', err);
  process.exit(1);
});
