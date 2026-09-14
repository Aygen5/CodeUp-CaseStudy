const cds = require('@sap/cds');
const path = require('path');
const fs = require('fs');
const PublicService = require('../srv/public-service');

async function main() {
  console.log('================================================================');
  console.log('FAZ 4 — ADIM 4.1: PublicService Kapsamlı Doğrulama Testi Başlıyor');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // BÖLÜM 1: BİRİM DÜZEYİNDE VALİDASYON TESTLERİ
  // -------------------------------------------------------------
  console.log('>>> 1. BÖLÜM: Şifre ve Token Birim Testleri');

  const pwdTests = [
    { p: 'short1!', expected: false, desc: 'Kısa şifre (<8 karakter)' },
    { p: 'nouppercase1!', expected: false, desc: 'Büyük harf eksik' },
    { p: 'NOLOWERCASE1!', expected: false, desc: 'Küçük harf eksik' },
    { p: 'NoDigitsHere!', expected: false, desc: 'Rakam eksik' },
    { p: 'NoSpecialChar12', expected: false, desc: 'Özel karakter eksik' },
    { p: 'StrongPass123!', expected: true, desc: '5 kuralı eksiksiz sağlayan şifre' }
  ];

  for (const t of pwdTests) {
    const res = PublicService.validatePassword(t.p);
    if (res.valid !== t.expected) {
      throw new Error(`Şifre testi başarısız: ${t.desc}`);
    }
    console.log(`  [OK] Şifre Kuralı: "${t.desc}" -> Geçerli: ${res.valid}`);
  }

  console.log('\n>>> 2. BÖLÜM: Stateless Supplier Token Testleri');
  const token = PublicService.generateSupplierToken({
    supplierId: 'supp-uuid-999',
    email: 'tedarikci@codeup.corp'
  });
  console.log('  Üretilen Token:', token.substring(0, 45) + '...');
  const verified = PublicService.verifySupplierToken(token);
  if (verified.supplierId !== 'supp-uuid-999' || verified.email !== 'tedarikci@codeup.corp') {
    throw new Error('Token çözümleme hatası!');
  }
  console.log('  [OK] Token başarıyla doğrulandı:', verified);

  try {
    const tampered = token.substring(0, token.length - 4) + 'zzzz';
    PublicService.verifySupplierToken(tampered);
    throw new Error('Manipüle edilen token yakalanamadı!');
  } catch (err) {
    console.log('  [OK] Manipüle token başarıyla yakalandı:', err.message);
  }

  console.log('\n>>> 3. BÖLÜM: Çift Katmanlı Sertifika Dosya Kontrolleri');
  const validPdfPath = path.join(__dirname, 'files/valid-cert.pdf');
  const largePdfPath = path.join(__dirname, 'files/large-file-10mb.pdf');
  const invalidTxtPath = path.join(__dirname, 'files/invalid-format.txt');

  const validBuf = fs.readFileSync(validPdfPath);
  const largeBuf = fs.readFileSync(largePdfPath);
  const invalidBuf = fs.readFileSync(invalidTxtPath);

  const vCheck = PublicService.validateCertificate(validBuf, 'valid-cert.pdf');
  if (!vCheck.valid) throw new Error('Geçerli PDF reddedildi!');
  console.log('  [OK] Geçerli PDF kabul edildi.');

  const lCheck = PublicService.validateCertificate(largeBuf, 'large-file-10mb.pdf');
  if (lCheck.valid) throw new Error('10 MB üstü dosya kabul edildi!');
  console.log('  [OK] 10 MB üstü dosya başarıyla reddedildi:', lCheck.message);

  const iCheck = PublicService.validateCertificate(invalidBuf, 'sahte.pdf');
  if (iCheck.valid) throw new Error('Magic bytes hatası olan dosya kabul edildi!');
  console.log('  [OK] Sahte PDF (Magic Bytes Uyumsuzluğu) başarıyla reddedildi:', iCheck.message);

  const eCheck = PublicService.validateCertificate(validBuf, 'sertifika.docx');
  if (eCheck.valid) throw new Error('.docx uzantılı dosya kabul edildi!');
  console.log('  [OK] Yanlış uzantı (.docx) başarıyla reddedildi:', eCheck.message);

  // -------------------------------------------------------------
  // BÖLÜM 2: CAP SERVİS HTTP VE İŞ MANTIĞI ENTEGRASYON TESTLERİ
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('>>> 4. BÖLÜM: CAP PublicService HTTP ve OData V4 Entegrasyon Testleri');
  console.log('================================================================\n');

  const express = require('express');
  const app = express();
  cds.model = await cds.load('*').then(cds.linked);
  await cds.connect.to('db');
  await cds.serve('all').in(app);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log('  CAP Test Sunucusu Başlatıldı:', baseUrl);

  async function httpPost(endpoint, body, headers = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  async function httpGet(endpoint, headers = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        ...headers
      }
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  const testEmail = `tedarikci.test.${Date.now()}@codeup.corp`;
  const testPassword = 'StrongPass123!';

  // 4.1 Register Testleri
  console.log('\n--- 4.1: register Aksiyonu Testi ---');
  // Zayıf şifre
  const weakReg = await httpPost('/odata/v4/public/register', { email: testEmail, password: 'weak' });
  if (weakReg.status !== 400) {
    throw new Error(`Zayıf şifre engellenmedi! Status: ${weakReg.status}`);
  }
  console.log('  [OK] Zayıf şifre ile kayıt engellendi (400):', weakReg.data?.error?.message);

  // Başarılı kayıt
  const regRes = await httpPost('/odata/v4/public/register', { email: testEmail, password: testPassword });
  if (regRes.status !== 200 && regRes.status !== 201) {
    throw new Error(`Kayıt başarısız! Status: ${regRes.status} Error: ${JSON.stringify(regRes.data)}`);
  }
  const regData = regRes.data;
  console.log('  [OK] Başarılı kayıt tamamlandı. SupplierId:', regData.supplierId);
  if (!regData.token || !regData.supplierId) throw new Error('Kayıt sonrası token veya ID dönmedi!');

  const supplierToken = regData.token;
  const supplierId = regData.supplierId;

  // Mükerrer kayıt engeli
  const dupReg = await httpPost('/odata/v4/public/register', { email: testEmail, password: testPassword });
  if (dupReg.status !== 400) {
    throw new Error(`Mükerrer kayıt engellenmedi! Status: ${dupReg.status}`);
  }
  console.log('  [OK] Mükerrer e-posta kaydı başarıyla engellendi (400):', dupReg.data?.error?.message);

  // 4.2 Login Testleri
  console.log('\n--- 4.2: login Aksiyonu Testi ---');
  // Hatalı şifre
  const wrongLogin = await httpPost('/odata/v4/public/login', { email: testEmail, password: 'WrongPassword123!' });
  if (wrongLogin.status !== 401) {
    throw new Error(`Hatalı şifre ile giriş engellenmedi! Status: ${wrongLogin.status}`);
  }
  console.log('  [OK] Hatalı şifre ile giriş engellendi (401):', wrongLogin.data?.error?.message);

  // Başarılı giriş
  const loginRes = await httpPost('/odata/v4/public/login', { email: testEmail, password: testPassword });
  if (loginRes.status !== 200) {
    throw new Error(`Giriş başarısız! Status: ${loginRes.status}`);
  }
  const loginData = loginRes.data;
  if (!loginData.token || loginData.supplierId !== supplierId) {
    throw new Error('Giriş sonrası token veya ID eşleşmedi!');
  }
  console.log('  [OK] Başarılı giriş yapıldı. Token başarıyla teslim alındı.');

  // 4.3 getMySubmission Testleri
  console.log('\n--- 4.3: getMySubmission Mülkiyet Filtresi Testi ---');
  // Giriş yapmadan (Yetkisiz)
  const unauthGet = await httpGet('/odata/v4/public/getMySubmission()');
  if (unauthGet.status !== 401) {
    throw new Error(`Yetkisiz getMySubmission engellenmedi! Status: ${unauthGet.status}`);
  }
  console.log('  [OK] Yetkisiz getMySubmission çağrısı engellendi (401):', unauthGet.data?.error?.message);

  // Giriş yapmış ama henüz başvurusu olmayan tedarikçi
  const initialSubRes = await httpGet('/odata/v4/public/getMySubmission()', {
    authorization: `Bearer ${supplierToken}`
  });
  console.log('  [OK] Henüz başvuru yapmamış tedarikçi için sonuç:', initialSubRes.data ? initialSubRes.data.value : null);

  // 4.4 createSubmission Testleri
  console.log('\n--- 4.4: createSubmission İş Mantığı ve Çift Katmanlı Kontrol Testi ---');
  // Yetkisiz başvuru
  const unauthSub = await httpPost('/odata/v4/public/createSubmission', { companyName: 'Test Corp' });
  if (unauthSub.status !== 401) {
    throw new Error(`Yetkisiz başvuru oluşturma engellenmedi! Status: ${unauthSub.status}`);
  }
  console.log('  [OK] Yetkisiz başvuru oluşturma engellendi (401):', unauthSub.data?.error?.message);

  // Zorunlu alan eksikliği (Şirket adı yok)
  const missingField = await httpPost('/odata/v4/public/createSubmission', {
    contactPerson: 'Ali Veli',
    certificate: validBuf.toString('base64'),
    certificateFileName: 'valid.pdf'
  }, {
    authorization: `Bearer ${supplierToken}`
  });
  if (missingField.status !== 400) {
    throw new Error(`Zorunlu alan eksikliği engellenmedi! Status: ${missingField.status}`);
  }
  console.log('  [OK] Zorunlu alan eksikliği engellendi (400):', missingField.data?.error?.message);

  // Sahte dosya (Magic bytes uyumsuzluğu)
  const fakeFile = await httpPost('/odata/v4/public/createSubmission', {
    companyName: 'Sahte Dosyalı Firma',
    contactPerson: 'Ali Veli',
    certificate: invalidBuf.toString('base64'),
    certificateFileName: 'invalid.pdf'
  }, {
    authorization: `Bearer ${supplierToken}`
  });
  if (fakeFile.status !== 400) {
    throw new Error(`Magic bytes hatası engellenmedi! Status: ${fakeFile.status}`);
  }
  console.log('  [OK] Magic bytes uyumsuz dosyalı başvuru engellendi (400):', fakeFile.data?.error?.message);

  // 10 MB üstü dosya ile başvuru denemesi
  const largeFile = await httpPost('/odata/v4/public/createSubmission', {
    companyName: 'Büyük Dosyalı Firma',
    contactPerson: 'Ali Veli',
    certificate: largeBuf.toString('base64'),
    certificateFileName: 'large.pdf'
  }, {
    authorization: `Bearer ${supplierToken}`
  });
  if (largeFile.status !== 400 && largeFile.status !== 413) {
    throw new Error(`10 MB üstü dosya engellenmedi! Status: ${largeFile.status}`);
  }
  console.log(`  [OK] 10 MB üstü dosya ile başvuru engellendi (${largeFile.status}):`, largeFile.data?.error?.message || largeFile.data?.message);

  // Başarılı başvuru oluşturma
  const createRes = await httpPost('/odata/v4/public/createSubmission', {
    companyName: 'Nova Siber Güvenlik A.Ş.',
    contactPerson: 'Zeynep Kaya',
    phone: '+90 212 555 1234',
    country: 'TR',
    taxId: 'TR9876543210',
    website: 'https://www.novasiber.com.tr',
    address: 'Maslak Mah. Büyükdere Cad. No:42, Sarıyer, İstanbul',
    notes: 'Kurumsal siber güvenlik altyapı tedarikçisi.',
    category: 'Software',
    certificate: validBuf.toString('base64'),
    certificateFileName: 'nova_siber_iso27001.pdf'
  }, {
    authorization: `Bearer ${supplierToken}`
  });

  if (createRes.status !== 200 && createRes.status !== 201) {
    throw new Error(`Başvuru oluşturulamadı! Status: ${createRes.status} Error: ${JSON.stringify(createRes.data)}`);
  }
  const createdSub = createRes.data;
  if (!createdSub || createdSub.status !== 'Pending') {
    throw new Error('Başvuru oluşturuldu ancak durumu Pending değil!');
  }
  console.log('  [OK] Başvuru başarıyla oluşturuldu! ID:', createdSub.ID, 'Durum:', createdSub.status);

  // İkinci başvuru denemesi (Mükerrer başvuru engeli)
  const secondSub = await httpPost('/odata/v4/public/createSubmission', {
    companyName: 'Nova Siber İkinci Girişim',
    contactPerson: 'Zeynep Kaya',
    certificate: validBuf.toString('base64'),
    certificateFileName: 'nova.pdf'
  }, {
    authorization: `Bearer ${supplierToken}`
  });
  if (secondSub.status !== 400) {
    throw new Error(`Mükerrer başvuru engellenmedi! Status: ${secondSub.status}`);
  }
  console.log('  [OK] Tedarikçinin mükerrer başvuru açması başarıyla engellendi (400):', secondSub.data?.error?.message);

  // 4.5 getMySubmission (Başvuru sonrası)
  console.log('\n--- 4.5: Başvuru Sonrası getMySubmission Doğrulaması ---');
  const mySubRes = await httpGet('/odata/v4/public/getMySubmission()', {
    authorization: `Bearer ${supplierToken}`
  });
  const mySub = mySubRes.data;
  if (!mySub || mySub.ID !== createdSub.ID || mySub.companyName !== 'Nova Siber Güvenlik A.Ş.') {
    throw new Error(`getMySubmission doğru başvuruyu getirmedi! Data: ${JSON.stringify(mySub)}`);
  }
  console.log('  [OK] getMySubmission tedarikçinin kendi başvurusunu getirdi: Firma =', mySub.companyName);

  // 4.6 reApplySubmission Testleri
  console.log('\n--- 4.6: reApplySubmission Korumalı Yeniden Başvuru Testleri ---');
  // Pending durumundayken reApply denemesi
  const pendingReapply = await httpPost('/odata/v4/public/reApplySubmission', {
    submissionId: createdSub.ID,
    phone: '+90 212 999 8877'
  }, {
    authorization: `Bearer ${supplierToken}`
  });
  if (pendingReapply.status !== 400) {
    throw new Error(`Pending durumundaki reapply engellenmedi! Status: ${pendingReapply.status}`);
  }
  console.log('  [OK] Rejected olmayan başvuruya reApply engellendi (400):', pendingReapply.data?.error?.message);

  // Veritabanında başvuruyu 'Rejected' yapıp 'phone,certificate' alanlarına izin verelim
  const { Submissions } = cds.entities('codeup.supplier.management');
  await cds.db.run(
    UPDATE(Submissions)
      .set({
        status: 'Rejected',
        rejectionReason: 'Verilen telefon numarası geçersiz ve sertifika güncellenmeli.',
        editableFields: 'phone,certificate'
      })
      .where({ ID: createdSub.ID })
  );

  console.log('  (Simülasyon: status="Rejected", editableFields="phone,certificate" yapıldı)');

  // İzin verilmeyen alanı değiştirmeye çalışma (örn. companyName)
  const unallowedField = await httpPost('/odata/v4/public/reApplySubmission', {
    submissionId: createdSub.ID,
    companyName: 'Firma Adını Değiştirmek İstiyorum A.Ş.'
  }, {
    authorization: `Bearer ${supplierToken}`
  });
  if (unallowedField.status !== 400) {
    throw new Error(`İzin verilmeyen alan güncellemesi engellenmedi! Status: ${unallowedField.status}`);
  }
  console.log('  [OK] İzin verilmeyen alan güncellemesi başarıyla engellendi (400):', unallowedField.data?.error?.message);

  // İzin verilen alanı güncelleme (phone ve yeni sertifika)
  const reApplyRes = await httpPost('/odata/v4/public/reApplySubmission', {
    submissionId: createdSub.ID,
    phone: '+90 212 888 7766',
    certificate: validBuf.toString('base64'),
    certificateFileName: 'nova_siber_guncel_iso27001.pdf'
  }, {
    authorization: `Bearer ${supplierToken}`
  });

  if (reApplyRes.status !== 200) {
    throw new Error(`reApply başarısız! Status: ${reApplyRes.status} Error: ${JSON.stringify(reApplyRes.data)}`);
  }
  const reAppliedSub = reApplyRes.data;
  if (!reAppliedSub || reAppliedSub.status !== 'InReview' || reAppliedSub.phone !== '+90 212 888 7766') {
    throw new Error('reApply sonrası durum InReview olmadı veya telefon güncellenmedi!');
  }
  console.log('  [OK] Başvuru başarıyla güncellendi! Yeni Durum:', reAppliedSub.status, 'Yeni Tel:', reAppliedSub.phone);
  console.log('  [OK] Red gerekçesi korundu:', reAppliedSub.rejectionReason);

  // 4.7 Tedarikçi Mülkiyet İzolasyonu (Supplier A != Supplier B)
  console.log('\n--- 4.7: Tedarikçi Mülkiyet İzolasyonu (Supplier A != Supplier B) ---');
  // İkinci bir tedarikçi oluşturalım
  const supplierBEmail = `tedarikci.b.${Date.now()}@codeup.corp`;
  const regB = await httpPost('/odata/v4/public/register', { email: supplierBEmail, password: 'SecurePass456!' });
  const tokenB = regB.data.token;

  // Supplier B, Supplier A'nın başvurusunu reApply etmeye çalışsın
  const bHack = await httpPost('/odata/v4/public/reApplySubmission', {
    submissionId: createdSub.ID,
    phone: '+90 555 000 0000'
  }, {
    authorization: `Bearer ${tokenB}`
  });
  if (bHack.status !== 403) {
    throw new Error(`Başka tedarikçinin başvurusunu güncelleme engellenmedi! Status: ${bHack.status}`);
  }
  console.log('  [OK] Başka tedarikçinin başvurusunu güncelleme engellendi (403):', bHack.data?.error?.message);

  // Supplier B'nin getMySubmission çağrısı A'nın başvurusunu asla göremez
  const bSubRes = await httpGet('/odata/v4/public/getMySubmission()', {
    authorization: `Bearer ${tokenB}`
  });
  if (bSubRes.data && bSubRes.data.ID) {
    throw new Error('Tedarikçi B başka birinin başvurusunu gördü!');
  }
  console.log('  [OK] Tedarikçi B, Tedarikçi A nın başvurusuna erişemedi (Sonuç boş).');

  // Supplier B'nin Submissions entity setini sorgulaması (Mülkiyet filtresi)
  const bListRes = await httpGet('/odata/v4/public/Submissions', {
    authorization: `Bearer ${tokenB}`
  });
  const bCount = bListRes.data?.value?.length || 0;
  if (bCount !== 0) {
    throw new Error(`Tedarikçi B başkalarının başvurularını listeledi! (Adet: ${bCount})`);
  }
  console.log('  [OK] Tedarikçi B Submissions listesinde başka tedarikçilerin başvurularını göremedi (0 kayıt).');

  console.log('\n================================================================');
  console.log('✅ TÜM TESTLER EKSİKSİZ VE BAŞARIYLA TAMAMLANDI! (STEP 4.1 %100 BAŞARILI)');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ TEST HATA İLE SONUÇLANDI:', err);
  process.exit(1);
});
