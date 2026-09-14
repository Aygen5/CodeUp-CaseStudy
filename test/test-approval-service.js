const cds = require('@sap/cds');
const express = require('express');

async function main() {
  console.log('================================================================');
  console.log('FAZ 4 — ADIM 4.2: ApprovalService Kapsamlı Doğrulama Testi Başlıyor');
  console.log('================================================================\n');

  // Configure mock authentication with roles
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
  console.log('  CAP Test Sunucusu Başlatıldı:', baseUrl);

  const approverHeaders = {
    authorization: 'Basic ' + Buffer.from('approver_user:').toString('base64'),
    'Content-Type': 'application/json'
  };

  const unauthorizedHeaders = {
    authorization: 'Basic ' + Buffer.from('unauthorized_user:').toString('base64'),
    'Content-Type': 'application/json'
  };

  async function httpGet(endpoint, headers = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, { method: 'GET', headers });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  async function httpPost(endpoint, body = {}, headers = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  // Insert two test submissions with valid RFC4122 hex UUIDs to test OData V4 URL key syntax
  const Submissions = 'codeup.supplier.management.Submissions';
  const Suppliers = 'codeup.supplier.management.Suppliers';

  const testSupplierId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  await cds.db.run(
    INSERT.into(Suppliers).entries({
      ID: testSupplierId,
      email: 'approver.test@supplier.corp',
      passwordHash: '$2b$10$xyz',
      createdAt: new Date().toISOString()
    })
  ).catch(() => null);

  const validHexId1 = '11111111-2222-4333-8444-555555555555';
  const validHexId2 = '66666666-7777-4888-8999-000000000000';

  await cds.db.run(
    DELETE.from(Submissions).where({ ID: { in: [validHexId1, validHexId2] } })
  ).catch(() => null);

  await cds.db.run(
    UPDATE(Submissions).set({ status: 'InReview', rejectionReason: null, editableFields: null }).where({ ID: 's2010001-0000-4000-8000-000000000007' })
  ).catch(() => null);

  await cds.db.run(
    UPDATE(Submissions).set({ status: 'Pending', rejectionReason: null, editableFields: null }).where({ ID: 's2010001-0000-4000-8000-000000000006' })
  ).catch(() => null);

  await cds.db.run(
    INSERT.into(Submissions).entries([
      {
        ID: validHexId1,
        supplier_ID: testSupplierId,
        companyName: 'Hex Test Tech GmbH',
        contactPerson: 'Klaus Mann',
        phone: '+49 89 112233',
        country: 'DE',
        taxId: 'DE999888777',
        category: 'Hardware',
        status: 'Pending',
        submissionDate: new Date().toISOString(),
        certificateFileName: 'hex_cert1.pdf',
        certificateMimeType: 'application/pdf'
      },
      {
        ID: validHexId2,
        supplier_ID: testSupplierId,
        companyName: 'Hex Rejection Test AG',
        contactPerson: 'Anna Schmidt',
        phone: '+41 44 998877',
        country: 'CH',
        taxId: 'CHE999888777MWST',
        category: 'Services',
        status: 'Pending',
        submissionDate: new Date().toISOString(),
        certificateFileName: 'hex_cert2.pdf',
        certificateMimeType: 'application/pdf'
      }
    ])
  ).catch(() => null);

  // -------------------------------------------------------------
  // 1. SERVİS GÜVENLİĞİ VE YETKİLENDİRME TESTLERİ (@requires: 'Approval')
  // -------------------------------------------------------------
  console.log('\n>>> 1. TEST KATEGORİSİ: Servis Güvenliği ve Rol Denetimleri');

  // 1.1 Unauthenticated (401)
  const unauthRes = await httpGet('/odata/v4/approval/Submissions');
  if (unauthRes.status !== 401) {
    throw new Error(`Yetkisiz erişim engellenmedi! Status: ${unauthRes.status}`);
  }
  console.log('  [OK] Yetkisiz (anonim) erişim kapıda engellendi (401).');

  // 1.2 Authenticated without Approval role (403)
  const noRoleRes = await httpGet('/odata/v4/approval/Submissions', unauthorizedHeaders);
  if (noRoleRes.status !== 403) {
    throw new Error(`Approval rolü olmayan kullanıcı engellenmedi! Status: ${noRoleRes.status}`);
  }
  console.log('  [OK] Approval rolü olmayan kullanıcı erişimi engellendi (403).');

  // 1.3 Authenticated with Approval role (200)
  const authRes = await httpGet('/odata/v4/approval/Submissions', approverHeaders);
  if (authRes.status !== 200) {
    throw new Error(`Approval yetkili kullanıcı erişemedi! Status: ${authRes.status}`);
  }
  console.log('  [OK] Approval rolüne sahip kullanıcı başarıyla erişti (200).');

  // -------------------------------------------------------------
  // 2. BAŞVURU LİSTELEME VE İLİŞKİSEL VERİ DOĞRULAMASI
  // -------------------------------------------------------------
  console.log('\n>>> 2. TEST KATEGORİSİ: Başvuru Listeleme ve Tedarikçi Bilgileri');

  const submissions = authRes.data?.value || [];
  console.log(`  Toplam Başvuru Sayısı: ${submissions.length}`);
  if (submissions.length < 12) {
    throw new Error(`Eksik başvuru verisi! Beklenen en az 12, gelen: ${submissions.length}`);
  }

  // supplierEmail kontrolü
  const firstSub = submissions[0];
  if (!firstSub.supplierEmail || !firstSub.supplierEmail.includes('@')) {
    throw new Error(`supplierEmail alanı eksik veya geçersiz! Gelen: ${firstSub.supplierEmail}`);
  }
  console.log(`  [OK] İlk başvuru: "${firstSub.companyName}" -> Tedarikçi E-posta: ${firstSub.supplierEmail}`);

  // passwordHash gizlilik kontrolü
  const hasHash = submissions.some(s => s.passwordHash !== undefined);
  if (hasHash) {
    throw new Error('GÜVENLİK İHLALİ: passwordHash onaycı servisinde ifşa edildi!');
  }
  console.log('  [OK] passwordHash alanı tamamen gizlendi (Servis projeksiyonunda yer almıyor).');

  // -------------------------------------------------------------
  // 3. ARAMA VE FİLTRELEME TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 3. TEST KATEGORİSİ: OData V4 Arama ve Filtreleme');

  // 3.1 Durum Filtresi ($filter=status eq 'Pending')
  const pendingFilter = await httpGet("/odata/v4/approval/Submissions?$filter=status eq 'Pending'", approverHeaders);
  const pendingList = pendingFilter.data?.value || [];
  const allPending = pendingList.every(s => s.status === 'Pending');
  if (!allPending || pendingList.length === 0) {
    throw new Error('Pending durum filtresi hatalı sonuç döndürdü!');
  }
  console.log(`  [OK] Durum Filtresi (status eq 'Pending'): ${pendingList.length} adet bekleyen başvuru listelendi.`);

  // 3.2 Şirket Adı Araması ($filter contains companyName)
  const nameFilter = await httpGet("/odata/v4/approval/Submissions?$filter=contains(companyName,'Nexus')", approverHeaders);
  const nameList = nameFilter.data?.value || [];
  if (nameList.length === 0 || !nameList[0].companyName.includes('Nexus')) {
    throw new Error('Şirket adı arama filtresi başarısız!');
  }
  console.log(`  [OK] Firma Adı Araması (contains 'Nexus'): Bulunan firma: "${nameList[0].companyName}"`);

  // 3.3 İlgili Kişi Araması ($filter contains contactPerson)
  const personFilter = await httpGet("/odata/v4/approval/Submissions?$filter=contains(contactPerson,'Lukas')", approverHeaders);
  const personList = personFilter.data?.value || [];
  if (personList.length === 0 || !personList[0].contactPerson.includes('Lukas')) {
    throw new Error('İlgili kişi arama filtresi başarısız!');
  }
  console.log(`  [OK] İlgili Kişi Araması (contains 'Lukas'): Bulunan kişi: "${personList[0].contactPerson}"`);

  // 3.4 E-Posta Araması ($filter contains supplierEmail)
  const emailFilter = await httpGet("/odata/v4/approval/Submissions?$filter=contains(supplierEmail,'nexustech')", approverHeaders);
  const emailList = emailFilter.data?.value || [];
  if (emailList.length === 0 || !emailList[0].supplierEmail.includes('nexustech')) {
    throw new Error('E-posta arama filtresi başarısız!');
  }
  console.log(`  [OK] E-Posta Araması (contains 'nexustech'): Bulunan e-posta: "${emailList[0].supplierEmail}"`);

  // -------------------------------------------------------------
  // 4. DETAY SORGULAMA TESTİ
  // -------------------------------------------------------------
  console.log('\n>>> 4. TEST KATEGORİSİ: Tekil Başvuru Detay Sorgulama');

  const detailRes = await httpGet(`/odata/v4/approval/Submissions(${validHexId1})`, approverHeaders);
  if (detailRes.status !== 200) {
    throw new Error(`Detay sorgulama başarısız! Status: ${detailRes.status}`);
  }
  const detail = detailRes.data;
  console.log('  Detay Alanları:', {
    ID: detail.ID,
    companyName: detail.companyName,
    contactPerson: detail.contactPerson,
    phone: detail.phone,
    country: detail.country,
    taxId: detail.taxId,
    category: detail.category,
    status: detail.status,
    certificateFileName: detail.certificateFileName,
    supplierEmail: detail.supplierEmail
  });
  if (!detail.companyName || !detail.contactPerson || !detail.supplierEmail) {
    throw new Error('Detay nesnesinde zorunlu başvuru alanları eksik!');
  }
  console.log('  [OK] Başvuru detayı eksiksiz şekilde alındı.');

  // -------------------------------------------------------------
  // 5. APPROVE AKSİYONU VE DURUM GEÇİŞ TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 5. TEST KATEGORİSİ: approve Aksiyonu ve Durum Geçişleri');

  // 5.1 Yetkisiz approve denemesi (403)
  const unauthApprove = await httpPost(`/odata/v4/approval/Submissions(${validHexId1})/approve`, {}, unauthorizedHeaders);
  if (unauthApprove.status !== 403) {
    throw new Error(`Yetkisiz approve engellenmedi! Status: ${unauthApprove.status}`);
  }
  console.log('  [OK] Yetkisiz approve çağrısı engellendi (403).');

  // 5.2 Var olmayan başvuru approve (404)
  const fakeApprove = await httpPost('/odata/v4/approval/approveSubmission', { ID: '00000000-0000-0000-0000-000000000000' }, approverHeaders);
  if (fakeApprove.status !== 404) {
    throw new Error(`Var olmayan başvuru approve engellenmedi! Status: ${fakeApprove.status}`);
  }
  console.log('  [OK] Var olmayan ID ile approve engellendi (404).');

  // 5.3 Reddedilmiş başvuruyu doğrudan onaylama denemesi (400)
  const rejectedId = 's2010001-0000-4000-8000-000000000004'; // Berlin Consulting (Rejected)
  const invalidApprove = await httpPost('/odata/v4/approval/approveSubmission', { ID: rejectedId }, approverHeaders);
  if (invalidApprove.status !== 400) {
    throw new Error(`Reddedilmiş başvuru onaylanabildi! Status: ${invalidApprove.status}`);
  }
  console.log('  [OK] Reddedilmiş başvurunun doğrudan onaylanması engellendi (400):', invalidApprove.data?.error?.message);

  // 5.4 Geçerli Onaylama İşlemi (Pending -> Approved) - Bound Action Testi
  const approveRes = await httpPost(`/odata/v4/approval/Submissions(${validHexId1})/approve`, {}, approverHeaders);
  if (approveRes.status !== 200) {
    throw new Error(`Approve işlemi başarısız! Status: ${approveRes.status} Error: ${JSON.stringify(approveRes.data)}`);
  }
  const approvedData = approveRes.data;
  if (approvedData.status !== 'Approved') {
    throw new Error(`Approve sonrası durum Approved olmadı! Durum: ${approvedData.status}`);
  }
  console.log(`  [OK] Başvuru başarıyla onaylandı (Bound Action). Yeni Durum: ${approvedData.status}`);

  // 5.5 Zaten Approved olan başvuruyu tekrar onaylama engeli (400)
  const reApprove = await httpPost(`/odata/v4/approval/Submissions(${validHexId1})/approve`, {}, approverHeaders);
  if (reApprove.status !== 400) {
    throw new Error(`Zaten onaylı başvuru tekrar onaylanabildi! Status: ${reApprove.status}`);
  }
  console.log('  [OK] Zaten onaylanmış başvuruya tekrar approve engellendi (400):', reApprove.data?.error?.message);

  // 5.6 Unbound Action ile Onaylama Testi (approveSubmission)
  const seedPendingId = 's2010001-0000-4000-8000-000000000006'; // DataVanguard (Pending)
  const unboundApprove = await httpPost('/odata/v4/approval/approveSubmission', { ID: seedPendingId }, approverHeaders);
  if (unboundApprove.status !== 200 || unboundApprove.data?.status !== 'Approved') {
    throw new Error(`Unbound approveSubmission başarısız! Status: ${unboundApprove.status}`);
  }
  console.log('  [OK] Başvuru üst düzey aksiyonla da başarıyla onaylandı (approveSubmission).');

  // -------------------------------------------------------------
  // 6. REJECT AKSİYONU VE VALİDASYON TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> 6. TEST KATEGORİSİ: reject Aksiyonu ve Karar Notu Validasyonları');

  // 6.1 Yetkisiz reject denemesi (403)
  const unauthReject = await httpPost(`/odata/v4/approval/Submissions(${validHexId2})/reject`, {
    rejectionReason: 'Not yetkili',
    editableFields: 'phone'
  }, unauthorizedHeaders);
  if (unauthReject.status !== 403) {
    throw new Error(`Yetkisiz reject engellenmedi! Status: ${unauthReject.status}`);
  }
  console.log('  [OK] Yetkisiz reject çağrısı engellendi (403).');

  // 6.2 Karar notu (rejectionReason) boş bırakıldığında engelleme (400)
  const emptyReason = await httpPost(`/odata/v4/approval/Submissions(${validHexId2})/reject`, {
    rejectionReason: '   ',
    editableFields: 'phone'
  }, approverHeaders);
  if (emptyReason.status !== 400) {
    throw new Error(`Boş karar notu engellenmedi! Status: ${emptyReason.status}`);
  }
  console.log('  [OK] Boş karar notu ile red engellendi (400):', emptyReason.data?.error?.message);

  // 6.3 Düzenlenebilir alanlar (editableFields) seçilmediğinde engelleme (400)
  const emptyFields = await httpPost(`/odata/v4/approval/Submissions(${validHexId2})/reject`, {
    rejectionReason: 'Geçersiz belge yüklendi.',
    editableFields: ''
  }, approverHeaders);
  if (emptyFields.status !== 400) {
    throw new Error(`Boş editableFields engellenmedi! Status: ${emptyFields.status}`);
  }
  console.log('  [OK] Boş düzenlenebilir alan seçimi ile red engellendi (400):', emptyFields.data?.error?.message);

  // 6.4 Geçersiz model alanı girildiğinde engelleme (400)
  const invalidField = await httpPost(`/odata/v4/approval/Submissions(${validHexId2})/reject`, {
    rejectionReason: 'Geçersiz veri.',
    editableFields: 'creditCardNumber,phone'
  }, approverHeaders);
  if (invalidField.status !== 400) {
    throw new Error(`Geçersiz alan adı engellenmedi! Status: ${invalidField.status}`);
  }
  console.log('  [OK] Geçersiz alan adı seçimi engellendi (400):', invalidField.data?.error?.message);

  // 6.5 Onaylanmış bir başvuruyu reddetme engeli (400)
  const rejectApproved = await httpPost(`/odata/v4/approval/Submissions(${validHexId1})/reject`, {
    rejectionReason: 'Artık onaylamıyorum.',
    editableFields: 'phone'
  }, approverHeaders);
  if (rejectApproved.status !== 400) {
    throw new Error(`Onaylanmış başvuru reddedilebildi! Status: ${rejectApproved.status}`);
  }
  console.log('  [OK] Onaylanmış (Approved) bir başvurunun reddedilmesi engellendi (400):', rejectApproved.data?.error?.message);

  // 6.6 Başarılı Red İşlemi (Bound Action: Submissions(ID)/reject)
  const validReject = await httpPost(`/odata/v4/approval/Submissions(${validHexId2})/reject`, {
    rejectionReason: 'Vergi kimlik numarası doğrulanamadı ve güncel sertifika gerekmektedir.',
    editableFields: 'taxId,certificate'
  }, approverHeaders);

  if (validReject.status !== 200) {
    throw new Error(`Reject işlemi başarısız! Status: ${validReject.status} Error: ${JSON.stringify(validReject.data)}`);
  }
  const rejectedData = validReject.data;
  if (rejectedData.status !== 'Rejected') {
    throw new Error(`Reject sonrası durum Rejected olmadı! Durum: ${rejectedData.status}`);
  }
  if (rejectedData.editableFields !== 'taxId,certificate') {
    throw new Error(`editableFields doğru kaydedilmedi! Gelen: ${rejectedData.editableFields}`);
  }
  console.log(`  [OK] Başvuru başarıyla reddedildi (Bound Action). Durum: ${rejectedData.status}`);
  console.log(`  [OK] Kaydedilen Red Gerekçesi: "${rejectedData.rejectionReason}"`);
  console.log(`  [OK] Kaydedilen Düzenlenebilir Alanlar: "${rejectedData.editableFields}"`);

  // 6.7 Unbound Action ile Red ve Türkçe Alan Normalizasyonu (rejectSubmission)
  const seedInReviewId = 's2010001-0000-4000-8000-000000000007'; // Rhineland (InReview)
  const unboundReject = await httpPost('/odata/v4/approval/rejectSubmission', {
    ID: seedInReviewId,
    rejectionReason: 'Yetkili iletişim telefonu güncellenmeli ve adres teyit edilmelidir.',
    editableFields: 'Telefon, Adres'
  }, approverHeaders);

  if (unboundReject.status !== 200 || unboundReject.data?.status !== 'Rejected') {
    throw new Error(`Unbound rejectSubmission başarısız! Status: ${unboundReject.status}`);
  }
  if (unboundReject.data?.editableFields !== 'phone,address') {
    throw new Error(`Türkçe alan adları normalleştirilemedi! Gelen: ${unboundReject.data?.editableFields}`);
  }
  console.log('  [OK] Başvuru üst düzey aksiyonla da reddedildi (rejectSubmission).');
  console.log(`  [OK] Türkçe alanlar başarıyla normalleştirildi: "Telefon, Adres" -> "${unboundReject.data?.editableFields}"`);

  server.close();
  console.log('\n================================================================');
  console.log('✅ TÜM TESTLER EKSİKSİZ VE BAŞARIYLA TAMAMLANDI! (STEP 4.2 %100 BAŞARILI)');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ TEST HATA İLE SONUÇLANDI:', err);
  process.exit(1);
});
