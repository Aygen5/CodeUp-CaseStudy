const cds = require('@sap/cds');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.SUPPLIER_JWT_SECRET || 'codeup-supplier-jwt-secret-key-btp-2026';
const MAX_CERTIFICATE_SIZE = 10 * 1024 * 1024; // 10 MB

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

function generateSupplierToken({ supplierId, email }) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
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
  return `${header}.${payload}.${signature}`;
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
  const expectedSig = crypto
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
  let payload;
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

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

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

function requireSupplier(req) {
  if (!req.supplier || !req.supplier.id) {
    const reason = req.supplierAuthError ? ` (${req.supplierAuthError})` : '';
    req.reject(401, `Yetkisiz erişim. Lütfen giriş yapınız.${reason}`);
  }
  return req.supplier;
}

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

    this.before('*', async (req) => {
      const token = extractSupplierToken(req);
      if (token) {
        try {
          const payload = verifySupplierToken(token);
          req.supplier = {
            id: payload.supplierId,
            email: payload.email
          };
        } catch (err) {
          req.supplierAuthError = err.message;
        }
      }
    });

    this.on('register', async (req) => {
      const { email, password } = req.data;
      if (!email || !validateEmail(email)) {
        return req.reject(400, 'Geçerli bir e-posta adresi giriniz.');
      }
      const pwdCheck = validatePassword(password);
      if (!pwdCheck.valid) {
        return req.reject(400, pwdCheck.message);
      }
      const cleanEmail = email.toLowerCase().trim();
      const existing = await SELECT.one.from(Suppliers).where({ email: cleanEmail });
      if (existing) {
        return req.reject(400, 'Bu e-posta adresi ile kayıtlı bir tedarikçi zaten mevcut.');
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const newSupplier = {
        ID: cds.utils.uuid(),
        email: cleanEmail,
        passwordHash: passwordHash,
        createdAt: new Date().toISOString()
      };

      await INSERT.into(Suppliers).entries(newSupplier);

      const token = generateSupplierToken({ supplierId: newSupplier.ID, email: newSupplier.email });
      return {
        success: true,
        message: 'Tedarikçi kaydı başarıyla tamamlandı.',
        token: token,
        supplierId: newSupplier.ID,
        email: newSupplier.email
      };
    });

    this.on('login', async (req) => {
      const { email, password } = req.data;
      if (!email || !password) {
        return req.reject(400, 'E-posta ve şifre zorunludur.');
      }
      const cleanEmail = email.toLowerCase().trim();
      const supplier = await SELECT.one.from(Suppliers).where({ email: cleanEmail });
      if (!supplier || !supplier.passwordHash) {
        return req.reject(401, 'Geçersiz e-posta veya şifre.');
      }
      const isMatch = await bcrypt.compare(password, supplier.passwordHash);
      if (!isMatch) {
        return req.reject(401, 'Geçersiz e-posta veya şifre.');
      }
      const token = generateSupplierToken({ supplierId: supplier.ID, email: supplier.email });
      return {
        success: true,
        message: 'Giriş başarılı.',
        token: token,
        supplierId: supplier.ID,
        email: supplier.email
      };
    });

    this.on('getMySubmission', async (req) => {
      const supplier = requireSupplier(req);
      const submission = await SELECT.one.from(Submissions).where({ supplier_ID: supplier.id });
      return submission || null;
    });

    this.on('READ', 'Submissions', async (req) => {
      const supplier = requireSupplier(req);
      const query = SELECT.from('codeup.supplier.management.Submissions').where({ supplier_ID: supplier.id });
      return cds.db.run(query);
    });

    this.on('createSubmission', async (req) => {
      const supplier = requireSupplier(req);

      const existing = await SELECT.one.from(Submissions).where({ supplier_ID: supplier.id });
      if (existing) {
        return req.reject(400, 'Zaten bir başvurunuz bulunmaktadır. Başvuru durumunuzu takip edebilirsiniz.');
      }

      const { companyName, contactPerson, certificate, certificateFileName } = req.data;

      if (!companyName || !companyName.trim()) {
        return req.reject(400, 'Şirket adı zorunludur.');
      }
      if (!contactPerson || !contactPerson.trim()) {
        return req.reject(400, 'İletişim kişisi zorunludur.');
      }
      if (!certificate) {
        return req.reject(400, 'Sertifika belgesi zorunludur.');
      }

      const certCheck = validateCertificate(certificate, certificateFileName);
      if (!certCheck.valid) {
        return req.reject(400, certCheck.message);
      }

      const validCategories = ['Hardware', 'Software', 'Services', 'Consulting'];
      if (req.data.category && !validCategories.includes(req.data.category)) {
        return req.reject(400, 'Geçersiz kategori. İzin verilen kategoriler: ' + validCategories.join(', '));
      }

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

    this.on('reApplySubmission', async (req) => {
      const supplier = requireSupplier(req);

      let submission;
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

      if (submission.status !== 'Rejected') {
        return req.reject(400, `Yalnızca reddedilmiş başvurular için tekrar başvuru yapılabilir. Mevcut durum: ${submission.status}`);
      }

      const allowedRaw = (submission.editableFields || '')
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

      for (const key of modifiableKeys) {
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
            const newValue = typeof req.data[key] === 'string' ? req.data[key].trim() : req.data[key];
            const oldValue = submission[key];
            if (newValue !== oldValue) {
              if (!allowedFields.has(key)) {
                return req.reject(400, `'${key}' alanını düzenleme izniniz bulunmamaktadır. İzin verilen alanlar: ${submission.editableFields}`);
              }
              updates[key] = newValue;
            }
          }
        }
      }

      if (Object.keys(updates).length === 0) {
        return req.reject(400, 'Lütfen izin verilen düzenlenebilir alanlarda en az bir güncelleme yapınız.');
      }

      updates.status = 'InReview';
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

PublicService.generateSupplierToken = generateSupplierToken;
PublicService.verifySupplierToken = verifySupplierToken;
PublicService.validatePassword = validatePassword;
PublicService.validateCertificate = validateCertificate;
PublicService.validateEmail = validateEmail;

module.exports = PublicService;
