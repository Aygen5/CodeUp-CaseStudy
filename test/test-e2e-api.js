const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:4004';

const approverHeaders = {
  authorization: 'Basic ' + Buffer.from('approver:').toString('base64'),
  'Content-Type': 'application/json'
};

const unauthorizedHeaders = {
  authorization: 'Basic ' + Buffer.from('unauthorized_user:').toString('base64'),
  'Content-Type': 'application/json'
};

async function httpGet(endpoint, headers = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function httpPost(endpoint, body = {}, headers = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('================================================================');
  console.log('FAZ 4 — ADIM 4.4: Backend Servislerinin Uçtan Uca API Testi');
  console.log(`Hedef Sunucu: ${BASE_URL}`);
  console.log('================================================================\n');

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };

  function record(name, pass, detail = '') {
    results.total++;
    if (pass) {
      results.passed++;
      console.log(`  ✅ [BAŞARILI] ${name}${detail ? ` -> ${detail}` : ''}`);
    } else {
      results.failed++;
      console.error(`  ❌ [BAŞARISIZ] ${name}${detail ? ` -> ${detail}` : ''}`);
    }
    results.details.push({ name, pass, detail });
  }

  // -------------------------------------------------------------
  // 1. CANLI BACKEND VE METADATA KONTROLLERİ
  // -------------------------------------------------------------
  console.log('>>> BÖLÜM 1: Canlı Backend ve OData V4 Metadata Doğrulaması');

  // 1.1 Root Index Sayfası
  const rootRes = await httpGet('/');
  record(
    'Root Sayfa Keşfedilebilirliği (http://localhost:4004)',
    rootRes.status === 200 && typeof rootRes.data === 'string' && rootRes.data.includes('codeup-supplier-management'),
    `Status: ${rootRes.status}`
  );

  // 1.2 PublicService Metadata
  const pubMeta = await httpGet('/odata/v4/public/$metadata');
  record(
    'PublicService OData V4 Metadata ($metadata)',
    pubMeta.status === 200 && typeof pubMeta.data === 'string' && pubMeta.data.includes('codeup.supplier.management.PublicService'),
    `Status: ${pubMeta.status}`
  );

  // 1.3 ApprovalService Metadata (Approver Yetkili)
  const appMeta = await httpGet('/odata/v4/approval/$metadata', approverHeaders);
  record(
    'ApprovalService OData V4 Metadata ($metadata)',
    appMeta.status === 200 && typeof appMeta.data === 'string' && appMeta.data.includes('codeup.supplier.management.ApprovalService'),
    `Status: ${appMeta.status}`
  );

  // -------------------------------------------------------------
  // 2. AUTHORIZATION TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> BÖLÜM 2: Authorization ve Güvenlik Denetimleri');

  // 2.1 ApprovalService Anonim Erişim Engeli (401)
  const anonRes = await httpGet('/odata/v4/approval/Submissions');
  record(
    'ApprovalService Anonim Erişim Koruması (401)',
    anonRes.status === 401,
    `Status: ${anonRes.status}`
  );

  // 2.2 ApprovalService Yetkisiz Kullanıcı Engeli (403)
  const unauthRes = await httpGet('/odata/v4/approval/Submissions', unauthorizedHeaders);
  record(
    'ApprovalService Yetkisiz Kullanıcı (No Approval Role) Koruması (403)',
    unauthRes.status === 403,
    `Status: ${unauthRes.status}`
  );

  // 2.3 ApprovalService Yetkili Kullanıcı Erişimi (200)
  const authRes = await httpGet('/odata/v4/approval/Submissions', approverHeaders);
  record(
    'ApprovalService Yetkili Kullanıcı (Approval Role) Başarılı Erişim (200)',
    authRes.status === 200 && Array.isArray(authRes.data?.value),
    `Status: ${authRes.status}, Kayıt Sayısı: ${authRes.data?.value?.length}`
  );

  // -------------------------------------------------------------
  // 3. 12 GERÇEK SEED VERİSİNİN DOĞRULANMASI
  // -------------------------------------------------------------
  console.log('\n>>> BÖLÜM 3: 12 Gerçekçi Kurumsal Tohum Verisinin Doğrulanması');

  const submissions = authRes.data?.value || [];
  const seedSubmissions = submissions.filter(s => s.ID && s.ID.startsWith('s2010001-'));

  record(
    'Faz 2 Tohum Verileri Varlığı (12 Kurumsal Başvuru)',
    seedSubmissions.length === 12,
    `Bulunan Tohum Kayıt: ${seedSubmissions.length} / 12`
  );

  const statuses = {};
  const categories = {};
  for (const s of seedSubmissions) {
    statuses[s.status] = (statuses[s.status] || 0) + 1;
    categories[s.category] = (categories[s.category] || 0) + 1;
  }

  const allStatusesPresent = ['Pending', 'InReview', 'Approved', 'Rejected'].every(st => statuses[st] > 0);
  record(
    'Tohum Verilerinde 4 Farklı Durumun Dağılımı (Pending, InReview, Approved, Rejected)',
    allStatusesPresent,
    JSON.stringify(statuses)
  );

  const allCategoriesPresent = ['Hardware', 'Software', 'Services', 'Consulting'].every(cat => categories[cat] > 0);
  record(
    'Tohum Verilerinde 4 Farklı Kategorinin Dağılımı (Hardware, Software, Services, Consulting)',
    allCategoriesPresent,
    JSON.stringify(categories)
  );

  const relationshipsValid = seedSubmissions.every(s => s.supplier_ID && s.supplier_ID.startsWith('c1010001-') && s.supplierEmail);
  record(
    'Tedarikçi-Başvuru İlişkisi ve E-posta Zenginleştirmesi (supplierEmail)',
    relationshipsValid,
    `Tüm 12 başvuruda geçerli supplier_ID ve supplierEmail mevcut`
  );

  // -------------------------------------------------------------
  // 4. PUBLIC SERVICE API TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> BÖLÜM 4: PublicService API Testleri (Kayıt, Giriş, Mülkiyet, Başvuru)');

  const timestamp = Date.now();
  const validEmail = `e2e.supplier.${timestamp}@corp-test.de`;
  const validPassword = 'SecurePassword123!';

  // 4.1 Register - Başarılı Kayıt
  const regSuccess = await httpPost('/odata/v4/public/register', {
    email: validEmail,
    password: validPassword
  });
  const supplierToken = regSuccess.data?.token || regSuccess.data?.value?.token;
  const supplierId = regSuccess.data?.supplierId || regSuccess.data?.value?.supplierId;

  record(
    'Register: Başarılı Yeni Tedarikçi Kaydı',
    regSuccess.status === 200 && !!supplierToken && !!supplierId,
    `Token teslim alındı, ID: ${supplierId}`
  );

  // 4.2 Register - Mükerrer E-posta Engeli (400)
  const regDup = await httpPost('/odata/v4/public/register', {
    email: validEmail,
    password: validPassword
  });
  record(
    'Register: Mükerrer E-Posta Engellemesi (400)',
    regDup.status === 400,
    regDup.data?.error?.message
  );

  // 4.3 Register - 5 Şifre Kuralı İhlalleri
  const weakPasswords = [
    { p: 'short1!', reason: '8 karakterden kısa' },
    { p: 'nouppercase123!', reason: 'Büyük harf yok' },
    { p: 'NOLOWERCASE123!', reason: 'Küçük harf yok' },
    { p: 'NoDigitsAtAll!', reason: 'Rakam yok' },
    { p: 'NoSpecialChars123', reason: 'Özel karakter yok' }
  ];

  let allWeakBlocked = true;
  for (const wp of weakPasswords) {
    const res = await httpPost('/odata/v4/public/register', {
      email: `weak.${Date.now()}.${Math.random()}@test.com`,
      password: wp.p
    });
    if (res.status !== 400) {
      allWeakBlocked = false;
      break;
    }
  }
  record(
    'Register: 5 Şifre Kuralının Eksiksiz Denetimi (Uzunluk, Büyük, Küçük, Rakam, Özel Karakter)',
    allWeakBlocked,
    '5 kuralın tüm negatif testleri 400 ile engellendi'
  );

  // 4.4 PasswordHash Düz Metin Olmaması (Bcrypt Güvenliği)
  const suppliersInApp = await httpGet('/odata/v4/approval/Suppliers', approverHeaders);
  const foundSupplier = suppliersInApp.data?.value?.find(s => s.email === validEmail);
  record(
    'Güvenlik: passwordHash Alanının Servis Dışına Asla Sızdırılmaması',
    foundSupplier && foundSupplier.passwordHash === undefined,
    `passwordHash değeri servis projeksiyonunda tamamen hariç tutulmuş`
  );

  // 4.5 Login - Başarılı Giriş
  const loginSuccess = await httpPost('/odata/v4/public/login', {
    email: validEmail,
    password: validPassword
  });
  const loginToken = loginSuccess.data?.token || loginSuccess.data?.value?.token;
  record(
    'Login: Doğru E-Posta ve Doğru Parola ile Başarılı Oturum',
    loginSuccess.status === 200 && !!loginToken,
    `Güvenli JWT oturum belirteci oluşturuldu`
  );

  // 4.6 Login - Yanlış Parola (401)
  const loginWrongPass = await httpPost('/odata/v4/public/login', {
    email: validEmail,
    password: 'WrongPassword123!'
  });
  record(
    'Login: Yanlış Parola Engellemesi (401)',
    loginWrongPass.status === 401,
    loginWrongPass.data?.error?.message
  );

  // 4.7 Login - Bulunmayan E-Posta (401)
  const loginNotFound = await httpPost('/odata/v4/public/login', {
    email: 'nonexistent.user@doesnotexist.com',
    password: validPassword
  });
  record(
    'Login: Bulunmayan E-Posta Engellemesi (401)',
    loginNotFound.status === 401,
    loginNotFound.data?.error?.message
  );

  // 4.8 Ownership - Henüz Başvurusu Olmayan Tedarikçi getMySubmission
  const supplierHeaders = {
    authorization: `Bearer ${supplierToken}`,
    'Content-Type': 'application/json'
  };

  const mySubBefore = await httpGet('/odata/v4/public/getMySubmission()', supplierHeaders);
  record(
    'Ownership: Başvurusu Olmayan Tedarikçi getMySubmission (204 No Content)',
    mySubBefore.status === 204 || (mySubBefore.status === 200 && (!mySubBefore.data || mySubBefore.data.value === null)),
    `Status: ${mySubBefore.status}`
  );

  // 4.9 CreateSubmission - Zorunlu Alan Eksikliği (400)
  const createMissing = await httpPost('/odata/v4/public/createSubmission', {
    contactPerson: 'Eksik Firma',
    phone: '+49 89 000000',
    country: 'DE',
    taxId: 'DE123456789',
    category: 'Hardware'
  }, supplierHeaders);
  record(
    'CreateSubmission: Zorunlu Alan Eksikliği Denetimi (400)',
    createMissing.status === 400,
    createMissing.data?.error?.message
  );

  // 4.10 CreateSubmission - PDF Olmayan Dosya Formatı (Magic Bytes Denetimi) (400)
  const txtContent = fs.readFileSync(path.join(__dirname, 'files', 'invalid-format.txt')).toString('base64');
  const createInvalidMime = await httpPost('/odata/v4/public/createSubmission', {
    companyName: 'Fake PDF Corp',
    contactPerson: 'Hacker Joe',
    phone: '+49 89 123456',
    country: 'DE',
    taxId: 'DE987654321',
    category: 'Hardware',
    certificate: txtContent,
    certificateMimeType: 'text/plain',
    certificateFileName: 'invalid-format.txt'
  }, supplierHeaders);
  record(
    'CreateSubmission: PDF Olmayan Dosya Formatı Reddi (400)',
    createInvalidMime.status === 400,
    createInvalidMime.data?.error?.message
  );

  // 4.11 CreateSubmission - 10 MB Sınırını Aşan Dosya (400)
  const largeContent = fs.readFileSync(path.join(__dirname, 'files', 'large-file-10mb.pdf')).toString('base64');
  const createTooLarge = await httpPost('/odata/v4/public/createSubmission', {
    companyName: 'Huge File Corp',
    contactPerson: 'Big Data',
    phone: '+49 89 123456',
    country: 'DE',
    taxId: 'DE987654321',
    category: 'Hardware',
    certificate: largeContent,
    certificateMimeType: 'application/pdf',
    certificateFileName: 'large-file-10mb.pdf'
  }, supplierHeaders);
  record(
    'CreateSubmission: 10 MB Üstü Dosya Sınırı Denetimi (400)',
    createTooLarge.status === 400,
    createTooLarge.data?.error?.message
  );

  // 4.12 CreateSubmission - Mülkiyet Manipülasyon Engeli (İstemcinin dışarıdan supplier_ID parametresi göndermesi engellenir)
  const validPdfContent = fs.readFileSync(path.join(__dirname, 'files', 'valid-cert.pdf')).toString('base64');
  const tamperAttempt = await httpPost('/odata/v4/public/createSubmission', {
    supplier_ID: 'hacker-stolen-id-000000000000',
    companyName: 'Tamper Corp',
    contactPerson: 'Attacker',
    phone: '+49 89 000000',
    country: 'DE',
    taxId: 'DE000000000',
    category: 'Hardware',
    certificate: validPdfContent,
    certificateMimeType: 'application/pdf',
    certificateFileName: 'valid-cert.pdf'
  }, supplierHeaders);
  record(
    'Ownership: İstemci Tarafından supplier_ID Manipülasyonunun Engellenmesi (400)',
    tamperAttempt.status === 400,
    tamperAttempt.data?.error?.message
  );

  // 4.13 CreateSubmission - Başarılı Başvuru ve Oturum Sahibi Tedarikçiye Otomatik Bağlanma
  const createSuccess = await httpPost('/odata/v4/public/createSubmission', {
    companyName: 'Alpha Global Solutions GmbH',
    contactPerson: 'Maximilian Krause',
    phone: '+49 89 55566677',
    country: 'DE',
    taxId: 'DE888999111',
    website: 'https://alpha-global.de',
    address: 'Maximilianstraße 35, 80539 München, Germany',
    notes: 'Kurumsal BT altyapı ve ağ donanımları tedarikçisi',
    category: 'Hardware',
    certificate: validPdfContent,
    certificateMimeType: 'application/pdf',
    certificateFileName: 'valid-cert.pdf'
  }, supplierHeaders);

  const createdSubmissionId = createSuccess.data?.ID || createSuccess.data?.value?.ID;
  const recordedSupplierId = createSuccess.data?.supplier_ID || createSuccess.data?.value?.supplier_ID;
  const recordedStatus = createSuccess.data?.status || createSuccess.data?.value?.status;

  record(
    'CreateSubmission: Başarılı Başvuru Oluşturma ve Durumun Pending Olması',
    createSuccess.status === 200 && recordedStatus === 'Pending' && !!createdSubmissionId,
    `ID: ${createdSubmissionId}, Durum: ${recordedStatus}`
  );
  record(
    'Ownership: Başvurunun Yalnızca Oturum Açan Tedarikçi ID sine Bağlanması',
    recordedSupplierId === supplierId,
    `Kaydedilen supplier_ID: ${recordedSupplierId}`
  );

  // 4.13 Ownership - getMySubmission ile Kendi Başvurusunu Okuma
  const mySubAfter = await httpGet('/odata/v4/public/getMySubmission()', supplierHeaders);
  const mySubData = mySubAfter.data?.ID ? mySubAfter.data : mySubAfter.data?.value;
  record(
    'Ownership: Tedarikçinin Kendi Başvurusunu Eksiksiz Okuyabilmesi',
    mySubAfter.status === 200 && mySubData?.ID === createdSubmissionId,
    `Firma: ${mySubData?.companyName}, Statü: ${mySubData?.status}`
  );

  // 4.14 Ownership - Başka Tedarikçinin İzolasyonu (Tedarikçi B)
  const bEmail = `e2e.supplier.b.${timestamp}@corp-test.de`;
  const regB = await httpPost('/odata/v4/public/register', { email: bEmail, password: validPassword });
  const bToken = regB.data?.token || regB.data?.value?.token;
  const bHeaders = { authorization: `Bearer ${bToken}`, 'Content-Type': 'application/json' };

  const bMySub = await httpGet('/odata/v4/public/getMySubmission()', bHeaders);
  record(
    'Ownership İzolasyonu: Tedarikçi B, Tedarikçi A nın Başvurusuna Erişemez',
    bMySub.status === 204 || (bMySub.status === 200 && (!bMySub.data || bMySub.data?.value === null)),
    'Tedarikçi B için getMySubmission boş döndü (Mülkiyet İzolasyonu Tam)'
  );

  // -------------------------------------------------------------
  // 5. APPROVAL SERVICE API TESTLERİ (Arama, Detay, Reject, Approve)
  // -------------------------------------------------------------
  console.log('\n>>> BÖLÜM 5: ApprovalService API Testleri (Arama, Detay, Reject, Approve)');

  // 5.1 OData V4 Filtreleme ve Arama
  const filterPending = await httpGet("/odata/v4/approval/Submissions?$filter=status eq 'Pending'", approverHeaders);
  record(
    "ApprovalService: OData V4 Durum Filtresi ($filter=status eq 'Pending')",
    filterPending.status === 200 && Array.isArray(filterPending.data?.value) && filterPending.data?.value.every(s => s.status === 'Pending'),
    `Listelenen Pending Kayıt Sayısı: ${filterPending.data?.value?.length}`
  );

  const searchUrl = encodeURI("/odata/v4/approval/Submissions?$filter=contains(companyName,'Alpha Global')");
  const searchAlpha = await httpGet(searchUrl, approverHeaders);
  record(
    "ApprovalService: Firma Adı Arama ($filter=contains)",
    searchAlpha.status === 200 && searchAlpha.data?.value?.[0]?.companyName === 'Alpha Global Solutions GmbH',
    `Bulunan: ${searchAlpha.data?.value?.[0]?.companyName}`
  );

  // 5.2 Tekil Detay Sorgulama
  const detailRes = await httpGet(`/odata/v4/approval/Submissions(${createdSubmissionId})`, approverHeaders);
  record(
    'ApprovalService: Tekil Başvuru Detay Sorgulama (/Submissions(ID))',
    detailRes.status === 200 && detailRes.data?.ID === createdSubmissionId && detailRes.data?.supplierEmail === validEmail,
    `Detay Firma: ${detailRes.data?.companyName}, E-posta: ${detailRes.data?.supplierEmail}`
  );

  // 5.3 Reject - Karar Notu Olmadan Reddetme Engeli (400)
  const rejectNoNote = await httpPost(`/odata/v4/approval/Submissions(${createdSubmissionId})/reject`, {
    rejectionReason: '',
    editableFields: 'phone,certificate'
  }, approverHeaders);
  record(
    'Reject: Karar Notu Olmadan Reddetme Engeli (400)',
    rejectNoNote.status === 400,
    rejectNoNote.data?.error?.message
  );

  // 5.4 Reject - editableFields Olmadan Reddetme Engeli (400)
  const rejectNoFields = await httpPost(`/odata/v4/approval/Submissions(${createdSubmissionId})/reject`, {
    rejectionReason: 'Belgeler yetersiz.',
    editableFields: ''
  }, approverHeaders);
  record(
    'Reject: Düzenlenebilir Alan (editableFields) Olmadan Reddetme Engeli (400)',
    rejectNoFields.status === 400,
    rejectNoFields.data?.error?.message
  );

  // 5.5 Reject - Başarılı Reddetme
  const rejectSuccess = await httpPost(`/odata/v4/approval/Submissions(${createdSubmissionId})/reject`, {
    rejectionReason: 'Telefon numarası teyit edilemedi ve güncel kurumsal sertifika yüklenmelidir.',
    editableFields: 'phone,certificate'
  }, approverHeaders);
  record(
    'Reject: Başarılı Red İşlemi (status = Rejected, Karar Notu ve Alan Kaydı)',
    rejectSuccess.status === 200 &&
    rejectSuccess.data?.status === 'Rejected' &&
    rejectSuccess.data?.rejectionReason === 'Telefon numarası teyit edilemedi ve güncel kurumsal sertifika yüklenmelidir.' &&
    rejectSuccess.data?.editableFields === 'phone,certificate',
    `Durum: ${rejectSuccess.data?.status}, Gerekçe: "${rejectSuccess.data?.rejectionReason}", Alanlar: "${rejectSuccess.data?.editableFields}"`
  );

  // -------------------------------------------------------------
  // 6. RE-APPLY SUBMISSION TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> BÖLÜM 6: ReApplySubmission Korumalı Yeniden Başvuru Testleri');

  // 6.1 editableFields Dışında Alan Güncelleme Engeli (400)
  const reApplyForbiddenField = await httpPost('/odata/v4/public/reApplySubmission', {
    companyName: 'Değiştirilmek İstenen Şirket Adı',
    phone: '+49 89 99988877'
  }, supplierHeaders);
  record(
    "ReApply: editableFields Dışındaki Alanın Güncellenmesinin Engellenmesi (400)",
    reApplyForbiddenField.status === 400,
    reApplyForbiddenField.data?.error?.message
  );

  // 6.2 Yetkisiz Tedarikçinin Başka Başvuruyu Reapply Etme Engeli (403)
  const reApplyUnauth = await httpPost('/odata/v4/public/reApplySubmission', {
    submissionId: createdSubmissionId,
    phone: '+49 89 11111111'
  }, bHeaders);
  record(
    "ReApply: Başka Tedarikçinin Başvurusunu Yeniden Başvuramama (403)",
    reApplyUnauth.status === 403,
    reApplyUnauth.data?.error?.message
  );

  // 6.3 Başarılı ReApply (İzinli Alan 'phone' ve Yeni Sertifika Yükleme)
  const reApplySuccess = await httpPost('/odata/v4/public/reApplySubmission', {
    phone: '+49 89 99988877',
    certificate: validPdfContent,
    certificateMimeType: 'application/pdf',
    certificateFileName: 'updated_cert_2028.pdf'
  }, supplierHeaders);

  const reApplyStatus = reApplySuccess.data?.status || reApplySuccess.data?.value?.status;
  const reApplyPhone = reApplySuccess.data?.phone || reApplySuccess.data?.value?.phone;
  const reApplyCertFile = reApplySuccess.data?.certificateFileName || reApplySuccess.data?.value?.certificateFileName;

  record(
    "ReApply: İzin Verilen Alanlar ve Yeni PDF ile Başarılı Yeniden Başvuru (Durum: InReview)",
    reApplySuccess.status === 200 && reApplyStatus === 'InReview' && reApplyPhone === '+49 89 99988877',
    `Yeni Durum: ${reApplyStatus}, Yeni Telefon: ${reApplyPhone}, Sertifika: ${reApplyCertFile}`
  );

  // 6.4 Rejected Olmayan Başvuruda ReApply Engeli (400)
  const reApplyNotRejected = await httpPost('/odata/v4/public/reApplySubmission', {
    phone: '+49 89 00000000'
  }, supplierHeaders);
  record(
    "ReApply: Yalnızca Rejected Durumundaki Başvurular İçin ReApply İzni (400)",
    reApplyNotRejected.status === 400,
    reApplyNotRejected.data?.error?.message
  );

  // -------------------------------------------------------------
  // 7. APPROVE TESTLERİ
  // -------------------------------------------------------------
  console.log('\n>>> BÖLÜM 7: Approve Aksiyonu ve Durum Geçişleri');

  const approveSuccess = await httpPost(`/odata/v4/approval/Submissions(${createdSubmissionId})/approve`, {}, approverHeaders);
  record(
    "Approve: Başarılı Onaylama İşlemi ve Durumun Approved Olması",
    approveSuccess.status === 200 && approveSuccess.data?.status === 'Approved' && approveSuccess.data?.editableFields === null,
    `Yeni Durum: ${approveSuccess.data?.status}, editableFields sıfırlandı`
  );

  const reApproveBlocked = await httpPost(`/odata/v4/approval/Submissions(${createdSubmissionId})/approve`, {}, approverHeaders);
  record(
    "Approve: Zaten Onaylanmış Başvuruyu Tekrar Onaylama Engeli (400)",
    reApproveBlocked.status === 400,
    reApproveBlocked.data?.error?.message
  );

  // -------------------------------------------------------------
  // 8. GEMINI AI VE BTP DESTINATION TESTİ
  // -------------------------------------------------------------
  console.log('\n>>> BÖLÜM 8: Gemini AI ve BTP Destination Entegrasyon Durumu');

  // Adım 4.3'te oluşturulan gerçek Destination üzerinden AI analizi çağrısı
  const aiRes = await httpPost(`/odata/v4/approval/Submissions(${createdSubmissionId})/analyzeCertificate`, {}, approverHeaders);
  
  // Yerel ortamda BTP Cockpit / Destination servisi canlı olmadığında beklenen güvenli davranış 502'dir
  const isDestMissing = aiRes.status === 502 && aiRes.data?.error?.message?.includes('gemini') && aiRes.data?.error?.message?.includes('Destination');
  const isAiSuccess = aiRes.status === 200 && aiRes.data?.validityStatus;

  if (isAiSuccess) {
    record(
      'Gemini AI: Gerçek BTP Destination Canlı Yanıtı',
      true,
      `Öneri: ${aiRes.data?.recommendation}, Geçerlilik: ${aiRes.data?.validityStatus}`
    );
  } else if (isDestMissing) {
    record(
      'Gemini AI: BTP Destination Bağımlılığı ve Güvenli Hata Yönetimi (502)',
      true,
      `BTP Bulut Ortamı Bağımlılığı Şeffafça Doğrulandı: "${aiRes.data?.error?.message}"`
    );
  } else {
    record(
      'Gemini AI: Beklenmeyen Hata',
      false,
      `Status: ${aiRes.status}, Body: ${JSON.stringify(aiRes.data)}`
    );
  }

  // -------------------------------------------------------------
  // SONUÇ VE ÖZET
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`FAZ 4 / ADIM 4.4 UÇTAN UCA TEST ÖZETİ:`);
  console.log(`Toplam Test Senaryosu : ${results.total}`);
  console.log(`Başarılı Senaryo      : ${results.passed}`);
  console.log(`Başarısız Senaryo     : ${results.failed}`);
  console.log(`Başarı Oranı          : %${Math.round((results.passed / results.total) * 100)}`);
  console.log('================================================================');

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n❌ UÇTAN UCA TEST ÇALIŞTIRILIRKEN KRİTİK HATA:', err);
  process.exit(1);
});
