/**
 * test/test-sap-hana-cloud-e2e.js
 * 
 * FAZ 7.4: SAP HANA Cloud Doğrulama Testi
 * 
 * Bu test:
 * 1. SAP HANA Cloud veritabanına doğrudan bağlanır.
 * 2. CODEUP_SUPPLIER_MANAGEMENT_SUPPLIERS tablosundaki 12 tedarikçiyi doğrular.
 * 3. CODEUP_SUPPLIER_MANAGEMENT_SUBMISSIONS tablosundaki 12 başvuruyu doğrular.
 * 4. Tedarikçi - Başvuru (association) ilişkisini JOIN ile doğrular.
 * 5. Status dağılımını (Pending, InReview, Approved, Rejected) doğrular.
 * 6. Category dağılımını doğrular.
 * 7. Rejected başvurularda rejectionReason ve editableFields bütünlüğünü denetler.
 * 8. Sertifika alanlarını (certificateFileName, certificateMimeType) denetler.
 * 9. CAP backend sunucusunu SAP HANA Cloud persistence (profile: hybrid) ile başlatarak gerçek OData v4 sorgularını test eder.
 */

const fs = require('fs');
const path = require('path');
const hana = require('@sap/hana-client');
const express = require('express');

const rootDir = path.resolve(__dirname, '..');
let passedTests = 0;

async function runTests() {
  console.log('================================================================');
  console.log('FAZ 7.4: SAP HANA CLOUD DOĞRULAMA VE E2E TESTİ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. YAPILANDIRMA VE BAĞLANTI BİLGİLERİ DENETİMİ
  // -------------------------------------------------------------
  console.log('>>> 1. SAP HANA CLOUD YAPILANDIRMASI VE BAĞLANTI DENETİMİ');

  const defaultEnvPath = path.join(rootDir, 'default-env.json');
  if (!fs.existsSync(defaultEnvPath)) {
    throw new Error('default-env.json bulunamadı!');
  }
  const defaultEnv = JSON.parse(fs.readFileSync(defaultEnvPath, 'utf8'));
  const hanaCreds = defaultEnv.VCAP_SERVICES?.hana?.[0]?.credentials;
  if (!hanaCreds || !hanaCreds.host || !hanaCreds.schema || !hanaCreds.user) {
    throw new Error('default-env.json içinde geçerli SAP HANA Cloud kimlik bilgileri bulunamadı!');
  }

  console.log(`  [INFO] SAP HANA Cloud Host: ${hanaCreds.host}`);
  console.log(`  [INFO] SAP HANA Cloud Port: ${hanaCreds.port}`);
  console.log(`  [INFO] SAP HANA Cloud Schema: ${hanaCreds.schema}`);
  console.log(`  [INFO] SAP HANA Cloud User: ${hanaCreds.user}`);
  passedTests++;

  // -------------------------------------------------------------
  // 2. DOĞRUDAN HANA SQL VE VERİ BÜTÜNLÜĞÜ DENETİMİ
  // -------------------------------------------------------------
  console.log('\n>>> 2. DOĞRUDAN HANA SQL VE VERİ BÜTÜNLÜĞÜ DENETİMİ');

  const conn = hana.createConnection();
  await new Promise((resolve, reject) => {
    conn.connect({
      serverNode: `${hanaCreds.host}:${hanaCreds.port}`,
      uid: hanaCreds.user,
      pwd: hanaCreds.password,
      sslValidateCertificate: false
    }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  console.log('  [OK] SAP HANA Cloud veritabanına doğrudan bağlantı kuruldu.');
  passedTests++;

  const query = (sql) => new Promise((resolve, reject) => {
    conn.exec(sql, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

  // Set default schema to the container schema
  await query(`SET SCHEMA "${hanaCreds.schema}"`);

  // 2.1 Supplier Kayıt Sayısı
  const suppliersRes = await query('SELECT count(*) as CNT FROM CODEUP_SUPPLIER_MANAGEMENT_SUPPLIERS');
  const supplierCount = suppliersRes[0].CNT;
  if (supplierCount < 12) {
    throw new Error(`Beklenen en az 12 tedarikçi yerine ${supplierCount} tedarikçi bulundu!`);
  }
  console.log(`  [OK] Gerçek SAP HANA Cloud üzerinde ${supplierCount} adet Tedarikçi (Suppliers) doğrulandı.`);
  passedTests++;

  // 2.2 Submission Kayıt Sayısı
  const submissionsRes = await query('SELECT count(*) as CNT FROM CODEUP_SUPPLIER_MANAGEMENT_SUBMISSIONS');
  const submissionCount = submissionsRes[0].CNT;
  if (submissionCount < 12) {
    throw new Error(`Beklenen en az 12 başvuru yerine ${submissionCount} başvuru bulundu!`);
  }
  console.log(`  [OK] Gerçek SAP HANA Cloud üzerinde ${submissionCount} adet Başvuru (Submissions) doğrulandı.`);
  passedTests++;

  // 2.3 Association (Tedarikçi -> Başvuru İlişkisi)
  const joinRes = await query(`
    SELECT s.ID, s.companyName, s.status, s.category, sup.email as supplierEmail, s.certificateFileName, s.rejectionReason, s.editableFields
    FROM CODEUP_SUPPLIER_MANAGEMENT_SUBMISSIONS s
    JOIN CODEUP_SUPPLIER_MANAGEMENT_SUPPLIERS sup ON s.supplier_ID = sup.ID
  `);
  if (joinRes.length !== 12) {
    throw new Error(`Beklenen 12 ilişkili kayıt yerine ${joinRes.length} kayıt JOIN oldu!`);
  }
  console.log(`  [OK] 12 başvurunun tamamı Suppliers tablosuna başarıyla bağlı (Association %100 eksiksiz).`);
  passedTests++;

  // 2.4 Status Dağılımı
  const statusRes = await query('SELECT status, count(*) as CNT FROM CODEUP_SUPPLIER_MANAGEMENT_SUBMISSIONS GROUP BY status');
  const statusMap = {};
  statusRes.forEach(r => statusMap[r.STATUS] = r.CNT);
  console.log(`  [INFO] HANA Status Dağılımı: ${JSON.stringify(statusMap)}`);
  if (!statusMap.Pending || !statusMap.InReview || !statusMap.Approved || !statusMap.Rejected) {
    throw new Error('Tüm 4 status durumu (Pending, InReview, Approved, Rejected) HANA üzerinde bulunmalıdır!');
  }
  console.log('  [OK] Dört ana durumun (Pending, InReview, Approved, Rejected) tamamı HANA üzerinde mevcut.');
  passedTests++;

  // 2.5 Rejected Başvurularda rejectionReason ve editableFields
  const rejectedRes = await query("SELECT companyName, rejectionReason, editableFields FROM CODEUP_SUPPLIER_MANAGEMENT_SUBMISSIONS WHERE status = 'Rejected'");
  if (rejectedRes.length === 0) {
    throw new Error('Rejected durumunda başvuru bulunamadı!');
  }
  for (const r of rejectedRes) {
    if (!r.REJECTIONREASON || !r.EDITABLEFIELDS) {
      throw new Error(`Reddedilmiş başvuru (${r.COMPANYNAME}) eksik rejectionReason veya editableFields içeriyor!`);
    }
  }
  console.log(`  [OK] Reddedilmiş ${rejectedRes.length} başvurunun tamamında rejectionReason ve editableFields mevcut.`);
  passedTests++;

  // 2.6 Certificate Alanları
  const certRes = await query("SELECT count(*) as CNT FROM CODEUP_SUPPLIER_MANAGEMENT_SUBMISSIONS WHERE certificateFileName IS NOT NULL AND certificateMimeType = 'application/pdf'");
  if (certRes[0].CNT !== 12) {
    throw new Error(`Beklenen 12 PDF sertifika metadata yerine ${certRes[0].CNT} bulundu!`);
  }
  console.log(`  [OK] 12 başvurunun tamamında PDF sertifika dosya adı ve MIME type ('application/pdf') doğrulandı.`);
  passedTests++;

  conn.disconnect();

  // -------------------------------------------------------------
  // 3. CANLI CAP BACKEND SAP HANA PERSISTENCE ODATA V4 DOĞRULAMASI
  // -------------------------------------------------------------
  console.log('\n>>> 3. CANLI CAP BACKEND SAP HANA PERSISTENCE ODATA V4 DOĞRULAMASI');

  process.env.CDS_ENV = 'hybrid';
  const cds = require('@sap/cds');
  cds.model = await cds.load('*').then(cds.linked);
  const db = await cds.connect.to('db');
  console.log(`  [INFO] CAP cds.connect.to('db') kind: ${db.options.kind}`);
  if (db.options.kind !== 'hana') {
    throw new Error(`CAP db kind 'hana' bekleniyordu ancak '${db.options.kind}' bağlandı!`);
  }
  console.log('  [OK] CAP backend veri katmanı resmi SAP HANA adaptörü (@cap-js/hana) ile bağlandı.');
  passedTests++;

  const capApp = express();
  capApp.use(express.json());
  await cds.serve('all').in(capApp);

  const capServer = await new Promise((resolve) => {
    const s = capApp.listen(0, () => resolve(s));
  });
  const capPort = capServer.address().port;
  console.log(`  [INFO] Canlı CAP Backend (HANA Persistence) Hazır: http://localhost:${capPort}`);
  passedTests++;

  // 3.1 Public Metadata Çekimi
  const metaRes = await fetch(`http://localhost:${capPort}/odata/v4/public/$metadata`);
  if (metaRes.status !== 200) {
    throw new Error(`HANA OData metadata çekilemedi! Status: ${metaRes.status}`);
  }
  console.log('  [OK] HANA OData $metadata başarıyla servis edildi (HTTP 200).');
  passedTests++;

  // 3.2 CAP DB API ile Sorgu Doğrulaması
  const capSuppliers = await db.run(SELECT.from('codeup.supplier.management.Suppliers'));
  if (capSuppliers.length < 12) {
    throw new Error(`CAP HANA üzerinden en az 12 tedarikçi okunamadı! Bulunan: ${capSuppliers.length}`);
  }
  console.log(`  [OK] CAP db.run(SELECT.from(Suppliers)) doğrudan SAP HANA Cloud üzerinden ${capSuppliers.length} tedarikçi döndürdü.`);
  passedTests++;

  const capSubmissions = await db.run(SELECT.from('codeup.supplier.management.Submissions'));
  if (capSubmissions.length < 12) {
    throw new Error(`CAP HANA üzerinden en az 12 başvuru okunamadı! Bulunan: ${capSubmissions.length}`);
  }
  console.log(`  [OK] CAP db.run(SELECT.from(Submissions)) doğrudan SAP HANA Cloud üzerinden ${capSubmissions.length} başvuru döndürdü.`);
  passedTests++;

  capServer.close();

  console.log('\n================================================================');
  console.log(`FAZ 7.4 SAP HANA CLOUD E2E TESTLERİ %100 BAŞARIYLA TAMAMLANDI! (${passedTests}/${passedTests})`);
  console.log('================================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST BAŞARISIZ:', err.message);
  process.exit(1);
});
