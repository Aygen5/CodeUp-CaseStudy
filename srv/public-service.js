// Gerekli kütüphaneler ve çevre değişkenlerinin (sabitlerin) tanımlanması
const cds = require('@sap/cds');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.SUPPLIER_JWT_SECRET || 'codeup-supplier-jwt-secret-key-btp-2026';
const MAX_CERTIFICATE_SIZE = 10 * 1024 * 1024; // 10 MB


// Base64 formatına çevirme ve geri çözme fonksiyonları (Token işlemleri için gereklidir)
function base64UrlEncode(str) {  
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

// Supplier (Tedarikçi) için JWT oluşturur. Login ve Register başarılı olduğunda çağrılır.
function generateSupplierToken({ supplierId, email }) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));  //şifreleme algoritmasını (HS256) belirler ve bunu Base64 formatına çevirir.
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    supplierId,
    email,
    iat: now,
    exp: now + (8 * 3600) // 8 hours TTL
  }));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;  // uzun JWT string ifadesini oluşturulur.
}

function verifySupplierToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Belirteç sağlanmadı.');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Geçersiz belirteç formatı.');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  let header;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch {
    throw new Error('Geçersiz belirteç başlığı.');
  }
  if (header.alg !== 'HS256') {
    throw new Error('Desteklenmeyen imza algoritması.');
  }
  const expectedSig = crypto   // İmzayı kontrol et
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuf = Buffer.from(signatureB64);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Geçersiz belirteç imzası.');
  }
  let payload;   // Yük (Payload) ve süre (Expiration) kontrolü
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    throw new Error('Geçersiz belirteç yükü.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Belirtecin geçerlilik süresi dolmuş.');
  }
  return payload;
}

// Şifrenin güvenliğini (uzunluk, büyük/küçük harf, rakam, özel karakter) test eder
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Şifre zorunludur.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Şifre en az 8 karakter uzunluğunda olmalıdır.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Şifre en az bir büyük harf içermelidir.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Şifre en az bir küçük harf içermelidir.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Şifre en az bir rakam içermelidir.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: 'Şifre en az bir özel karakter içermelidir (örn. !@#$%^&*).' };
  }
  return { valid: true };
}

// E-posta formatının doğruluğunu Regex ile kontrol eder
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Yüklenen sertifika dosyasını Buffer formatına çevirir
function parseCertificateBuffer(certificate) {
  if (!certificate) return null;
  if (Buffer.isBuffer(certificate)) {
    return certificate;
  }
  if (typeof certificate === 'string') {
    const base64Data = certificate.replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }
  if (certificate instanceof Uint8Array || certificate instanceof ArrayBuffer) {
    return Buffer.from(certificate);
  }
  return null;
}

// Sertifikanın boyutunu ve PDF formatında olup olmadığını (Magic Bytes ile) doğrular
function validateCertificate(certificate, fileName) {
  const buf = parseCertificateBuffer(certificate);
  if (!buf || buf.length === 0) {
    return { valid: false, message: 'Geçerli bir sertifika dosyası yüklenmelidir.' };
  }
  if (buf.length > MAX_CERTIFICATE_SIZE) {
    return {
      valid: false,
      message: `Dosya boyutu 10 MB sınırını aşamaz. (Mevcut boyut: ${(buf.length / (1024 * 1024)).toFixed(2)} MB)`
    };
  }
  if (fileName && typeof fileName === 'string') {
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return { valid: false, message: 'Yalnızca PDF formatında dosya yüklenebilir. Dosya uzantısı .pdf olmalıdır.' };
    }
  }
  // PDF Magic Bytes: %PDF (0x25 0x50 0x44 0x46)
  if (buf.length < 4 || buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
    return { valid: false, message: 'Geçersiz dosya formatı. Yüklenen dosya geçerli bir PDF belgesi değildir (Magic bytes uyumsuzluğu).' };
  }
  return { valid: true, buffer: buf };
}


// HTTP isteklerinin içinden (Header veya Cookie) Token'ı bulup çıkarır
function extractSupplierToken(req) {
  const headers = req.headers || req._?.req?.headers || {};
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const customHeader = headers['x-supplier-token'] || headers['X-Supplier-Token'];
  if (customHeader && typeof customHeader === 'string') {
    return customHeader.trim();
  }
  const cookieHeader = headers['cookie'] || headers['Cookie'];
  if (cookieHeader && typeof cookieHeader === 'string') {
    const match = cookieHeader.match(/supplier_token=([^;]+)/);
    if (match) return match[1].trim();
  }
  if (req.data && req.data.token && typeof req.data.token === 'string') {
    return req.data.token.trim();
  }
  return null;
}

// Eğer istek yapan kişi giriş yapmamışsa (token yoksa/geçersizse) işlemi reddeder (401 fırlatır)
function requireSupplier(req) {
  if (!req.supplier || !req.supplier.id) {
    const reason = req.supplierAuthError ? ` (${req.supplierAuthError})` : '';
    req.reject(401, `Yetkisiz erişim. Lütfen giriş yapınız.${reason}`);
  }
  return req.supplier;
}

// Türkçe / İngilizce farklı yazılan tablo kolonlarını veritabanı alan adlarına eşitler
const FIELD_MAP = {
  'şirket adı': 'companyName',
  'sirket adi': 'companyName',
  'companyname': 'companyName',
  'iletişim kişisi': 'contactPerson',
  'iletisim kisisi': 'contactPerson',
  'contactperson': 'contactPerson',
  'telefon': 'phone',
  'phone': 'phone',
  'ülke': 'country',
  'ulke': 'country',
  'country': 'country',
  'vergi no': 'taxId',
  'vergi numarası': 'taxId',
  'vergi numarasi': 'taxId',
  'taxid': 'taxId',
  'web sitesi': 'website',
  'website': 'website',
  'adres': 'address',
  'address': 'address',
  'notlar': 'notes',
  'notes': 'notes',
  'kategori': 'category',
  'category': 'category',
  'sertifika': 'certificate',
  'certificate': 'certificate'
};


class PublicService extends cds.ApplicationService {
  async init() {
    const Suppliers = 'codeup.supplier.management.Suppliers';
    const Submissions = 'codeup.supplier.management.Submissions';

    // Bütün API isteklerinden (endpoint) ÖNCE çalışır. Token varsa çözer ve req.supplier nesnesini doldurur.
    this.before('*', async (req) => {
      const token = extractSupplierToken(req);  //token string ifadesini cımbızla çeker.
      if (token) {
        try {
          const payload = verifySupplierToken(token);  //Fonksiyon gizli anahtarla (JWT_SECRET) imzayı kontrol eder. Süresi geçmiş mi (exp < now) diye bakar. Her şey doğruysa token çözülür ve kullanıcının kimliği req.supplier nesnesine eşitlenir.
          req.supplier = {
            id: payload.supplierId,
            email: payload.email
          };
        } catch (err) {
          req.supplierAuthError = err.message;
        }
      }
    });

    // --- TEDARİKÇİ KAYIT OLMA (REGISTER) İŞLEMİ ---
    this.on('register', async (req) => {
      const { email, password } = req.data;
      // E-posta ve şifre formatlarını kontrol et
      if (!email || !validateEmail(email)) {
        return req.reject(400, 'Geçerli bir e-posta adresi giriniz.');
      }
      const pwdCheck = validatePassword(password);
      if (!pwdCheck.valid) {
        return req.reject(400, pwdCheck.message);
      }
      const cleanEmail = email.toLowerCase().trim();
      const existing = await SELECT.one.from(Suppliers).where({ email: cleanEmail }); // Sistemde aynı e-posta var mı?
      if (existing) {
        return req.reject(400, 'Bu e-posta adresi ile kayıtlı bir tedarikçi zaten mevcut.');
      }
      // Şifreyi bcrypt ile şifrele (hash) ve veritabanına yeni kayıt at
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const newSupplier = {
        ID: cds.utils.uuid(),
        email: cleanEmail,
        passwordHash: passwordHash,
        createdAt: new Date().toISOString()
      };

      await INSERT.into(Suppliers).entries(newSupplier);
      // Kayıt başarılıysa anında oturum açması için token üretip döndür
      const token = generateSupplierToken({ supplierId: newSupplier.ID, email: newSupplier.email });
      return {
        success: true,
        message: 'Tedarikçi kaydı başarıyla tamamlandı.',
        token: token,
        supplierId: newSupplier.ID,
        email: newSupplier.email
      };
    });

    // --- TEDARİKÇİ GİRİŞ YAPMA (LOGIN) İŞLEMİ ---
    this.on('login', async (req) => {
      const { email, password } = req.data;
      if (!email || !password) {
        return req.reject(400, 'E-posta ve şifre zorunludur.');
      }
      const cleanEmail = email.toLowerCase().trim();
      const supplier = await SELECT.one.from(Suppliers).where({ email: cleanEmail });  // Kullanıcı var mı ve şifre doğru mu kontrol et
      if (!supplier || !supplier.passwordHash) {
        return req.reject(401, 'Geçersiz e-posta veya şifre.');
      }
      const isMatch = await bcrypt.compare(password, supplier.passwordHash);
      if (!isMatch) {
        return req.reject(401, 'Geçersiz e-posta veya şifre.');
      }
      // Şifre doğruysa Token üret ve döndür
      const token = generateSupplierToken({ supplierId: supplier.ID, email: supplier.email });
      return {
        success: true,
        message: 'Giriş başarılı.',
        token: token,
        supplierId: supplier.ID,
        email: supplier.email
      };
    });
    
    // --- TEDARİKÇİNİN KENDİ BAŞVURUSUNU GETİRMESİ ---
    this.on('getMySubmission', async (req) => {
      const supplier = requireSupplier(req);
      const submission = await SELECT.one.from(Submissions).where({ supplier_ID: supplier.id });
      return submission || null;
    });

    // --- STANDART OKUMA İŞLEMİ (Sadece kendi verilerini görebilsin diye filtreleme) ---
    this.on('READ', 'Submissions', async (req) => {
      const supplier = requireSupplier(req); // Yetki kontrolü
      const query = SELECT.from('codeup.supplier.management.Submissions').where({ supplier_ID: supplier.id });
      return cds.db.run(query);
    });

    // --- YENİ BAŞVURU OLUŞTURMA İŞLEMİ ---
    this.on('createSubmission', async (req) => {
      const supplier = requireSupplier(req);

      const existing = await SELECT.one.from(Submissions).where({ supplier_ID: supplier.id });  // Zaten bir başvurusu varsa yenisini engelle
      if (existing) {
        return req.reject(400, 'Zaten bir başvurunuz bulunmaktadır. Başvuru durumunuzu takip edebilirsiniz.');
      }

      const { companyName, contactPerson, certificate, certificateFileName } = req.data;
      
      if (!companyName || !companyName.trim()) {   // Zorunlu alan kontrolleri
        return req.reject(400, 'Şirket adı zorunludur.');
      }
      if (!contactPerson || !contactPerson.trim()) {
        return req.reject(400, 'İletişim kişisi zorunludur.');
      }
      if (!certificate) {
        return req.reject(400, 'Sertifika belgesi zorunludur.');
      }

      const certCheck = validateCertificate(certificate, certificateFileName);  // Sertifikayı ve Kategori bilgisini kontrol et
      if (!certCheck.valid) {
        return req.reject(400, certCheck.message);
      }

      const validCategories = ['Hardware', 'Software', 'Services', 'Consulting'];
      if (req.data.category && !validCategories.includes(req.data.category)) {
        return req.reject(400, 'Geçersiz kategori. İzin verilen kategoriler: ' + validCategories.join(', '));
      }
      
      // Yeni başvuruyu veritabanına ekle
      const newSubmission = {
        ID: cds.utils.uuid(),
        supplier_ID: supplier.id,
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim(),
        phone: req.data.phone ? req.data.phone.trim() : null,
        country: req.data.country ? req.data.country.trim() : null,
        taxId: req.data.taxId ? req.data.taxId.trim() : null,
        website: req.data.website ? req.data.website.trim() : null,
        address: req.data.address ? req.data.address.trim() : null,
        notes: req.data.notes ? req.data.notes.trim() : null,
        category: req.data.category || null,
        status: 'Pending',
        submissionDate: new Date().toISOString(),
        rejectionReason: null,
        editableFields: null,
        certificate: certCheck.buffer,
        certificateFileName: certificateFileName || 'certificate.pdf',
        certificateMimeType: 'application/pdf'
      };

      await INSERT.into(Submissions).entries(newSubmission);
      return newSubmission;
    });


    // --- REDDEDİLEN BAŞVURUYU GÜNCELLEYİP TEKRAR GÖNDERME ---
    this.on('reApplySubmission', async (req) => {
      const supplier = requireSupplier(req);

      let submission;  // Güncellenmek istenen başvuruyu bul ve aidiyetini kontrol et
      if (req.data.submissionId) {
        submission = await SELECT.one.from(Submissions).where({ ID: req.data.submissionId });
        if (!submission) {
          return req.reject(404, 'Başvuru bulunamadı.');
        }
        if (submission.supplier_ID !== supplier.id) {
          return req.reject(403, 'Bu başvuru üzerinde değişiklik yapma yetkiniz bulunmamaktadır.');
        }
      } else {
        submission = await SELECT.one.from(Submissions).where({ supplier_ID: supplier.id });
        if (!submission) {
          return req.reject(404, 'Aktif başvurunuz bulunamadı.');
        }
      }

      if (submission.status !== 'Rejected') {   // Sadece Rejected (Reddedilmiş) başvurular tekrar gönderilebilir
        return req.reject(400, `Yalnızca reddedilmiş başvurular için tekrar başvuru yapılabilir. Mevcut durum: ${submission.status}`);
      }
     
      const allowedRaw = (submission.editableFields || '')   // Sadece approvals tarafından belirlenen 'editableFields' (düzenlenebilir alanlar) güncellenebilir
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const allowedFields = new Set(
        allowedRaw.map(f => FIELD_MAP[f.toLowerCase()] || f)
      );

      if (allowedFields.size === 0) {
        return req.reject(400, 'Bu başvuru için düzenlenebilir alan tanımlanmamıştır. Tekrar başvuru yapılamaz.');
      }

      const modifiableKeys = [
        'companyName',
        'contactPerson',
        'phone',
        'country',
        'taxId',
        'website',
        'address',
        'notes',
        'category',
        'certificate'
      ];

      const updates = {};

      for (const key of modifiableKeys) {   // Gönderilen yeni verilerin değiştirilmesine izin verilmiş mi kontrol et
        if (key === 'certificate') {
          if (req.data.certificate !== undefined && req.data.certificate !== null) {
            if (!allowedFields.has('certificate')) {
              return req.reject(400, `'certificate' (Sertifika) alanını düzenleme izniniz bulunmamaktadır. İzin verilen alanlar: ${submission.editableFields}`);
            }
            const certCheck = validateCertificate(req.data.certificate, req.data.certificateFileName);
            if (!certCheck.valid) {
              return req.reject(400, certCheck.message);
            }
            updates.certificate = certCheck.buffer;
            updates.certificateFileName = req.data.certificateFileName || submission.certificateFileName || 'certificate.pdf';
            updates.certificateMimeType = 'application/pdf';
          }
        } else {
          if (req.data[key] !== undefined && req.data[key] !== null) {
            const rawNew = typeof req.data[key] === 'string' ? req.data[key].trim() : req.data[key];
            const rawOld = typeof submission[key] === 'string' ? submission[key].trim() : submission[key];
            const normNew = (rawNew === '' || rawNew === null || rawNew === undefined) ? null : rawNew;
            const normOld = (rawOld === '' || rawOld === null || rawOld === undefined) ? null : rawOld;

            if (normNew !== normOld) {   // Veri değişmişse ve değiştirmeye izni varsa güncelle
              if (!allowedFields.has(key)) {
                return req.reject(400, `'${key}' alanını düzenleme izniniz bulunmamaktadır. İzin verilen alanlar: ${submission.editableFields}`);
              }
              updates[key] = normNew;
            }
          }
        }
      }

      if (Object.keys(updates).length === 0) {
        return req.reject(400, 'Lütfen izin verilen düzenlenebilir alanlarda en az bir güncelleme yapınız.');
      }

      updates.status = 'InReview';   // Güncelleme yapıldıktan sonra durumu tekrar "InReview" (İncelemede) yap
      updates.submissionDate = new Date().toISOString();
      updates.rejectionReason = submission.rejectionReason;
      updates.editableFields = submission.editableFields;

      await UPDATE(Submissions).set(updates).where({ ID: submission.ID });

      const updated = await SELECT.one.from(Submissions).where({ ID: submission.ID });
      return updated;
    });

    await super.init();
  }
}

// Servisi ve test/başka modüller kullanabilsin diye yardımcı fonksiyonları dışa aktar
PublicService.generateSupplierToken = generateSupplierToken;
PublicService.verifySupplierToken = verifySupplierToken;
PublicService.validatePassword = validatePassword;
PublicService.validateCertificate = validateCertificate;
PublicService.validateEmail = validateEmail;

module.exports = PublicService;
