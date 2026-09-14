const cds = require('@sap/cds');

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

const VALID_EDITABLE_FIELDS = new Set([
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
]);

function checkApprovalRole(req) {
  if (!req.user || req.user._is_anonymous) {
    return req.reject(401, 'Yetkisiz erişim. Lütfen giriş yapınız.');
  }
  if (!req.user.is('Approval')) {
    return req.reject(403, 'Bu işlem için Approval yetkisi gerekmektedir.');
  }
}

async function handleApprove(submissionId, req) {
  checkApprovalRole(req);

  if (!submissionId) {
    return req.reject(400, 'Geçerli bir başvuru ID si belirtilmelidir.');
  }

  const Submissions = 'codeup.supplier.management.Submissions';
  const submission = await SELECT.one.from(Submissions).where({ ID: submissionId });
  if (!submission) {
    return req.reject(404, 'Başvuru bulunamadı.');
  }

  if (submission.status === 'Approved') {
    return req.reject(400, 'Başvuru zaten onaylanmış durumdadır.');
  }

  if (submission.status === 'Rejected') {
    return req.reject(400, 'Reddedilmiş bir başvuru doğrudan onaylanamaz. Tedarikçinin gerekli düzeltmeleri yaparak tekrar başvurması beklenmelidir.');
  }

  await UPDATE(Submissions)
    .set({
      status: 'Approved',
      editableFields: null
    })
    .where({ ID: submissionId });

  const ApprovalSubmissions = 'codeup.supplier.management.ApprovalService.Submissions';
  const updated = await SELECT.one.from(ApprovalSubmissions).where({ ID: submissionId });
  return updated || (await SELECT.one.from(Submissions).where({ ID: submissionId }));
}

async function handleReject(submissionId, rejectionReason, editableFields, req) {
  checkApprovalRole(req);

  if (!submissionId) {
    return req.reject(400, 'Geçerli bir başvuru ID si belirtilmelidir.');
  }

  const Submissions = 'codeup.supplier.management.Submissions';
  const submission = await SELECT.one.from(Submissions).where({ ID: submissionId });
  if (!submission) {
    return req.reject(404, 'Başvuru bulunamadı.');
  }

  if (submission.status === 'Approved') {
    return req.reject(400, 'Onaylanmış bir başvuru reddedilemez.');
  }

  if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
    return req.reject(400, 'Red gerekçesi (karar notu) zorunludur.');
  }

  if (!editableFields) {
    return req.reject(400, 'En az bir düzenlenebilir alan seçilmelidir.');
  }

  let fieldsArray = [];
  if (Array.isArray(editableFields)) {
    fieldsArray = editableFields;
  } else if (typeof editableFields === 'string') {
    fieldsArray = editableFields.split(',').map(f => f.trim()).filter(Boolean);
  } else {
    return req.reject(400, 'Geçersiz düzenlenebilir alan formatı.');
  }

  if (fieldsArray.length === 0) {
    return req.reject(400, 'En az bir düzenlenebilir alan seçilmelidir.');
  }

  const normalizedList = [];
  for (const rawField of fieldsArray) {
    const key = rawField.toLowerCase();
    const mapped = FIELD_MAP[key] || rawField;
    if (!VALID_EDITABLE_FIELDS.has(mapped)) {
      return req.reject(400, `'${rawField}' geçerli bir düzenlenebilir alan değildir. İzin verilen alanlar: ${Array.from(VALID_EDITABLE_FIELDS).join(', ')}`);
    }
    if (!normalizedList.includes(mapped)) {
      normalizedList.push(mapped);
    }
  }

  const normalizedStr = normalizedList.join(',');

  await UPDATE(Submissions)
    .set({
      status: 'Rejected',
      rejectionReason: rejectionReason.trim(),
      editableFields: normalizedStr
    })
    .where({ ID: submissionId });

  const ApprovalSubmissions = 'codeup.supplier.management.ApprovalService.Submissions';
  const updated = await SELECT.one.from(ApprovalSubmissions).where({ ID: submissionId });
  return updated || (await SELECT.one.from(Submissions).where({ ID: submissionId }));
}

function buildGeminiPrompt(currentDate = new Date().toISOString().split('T')[0]) {
  return `Bugünün tarihi: ${currentDate}. Sen kurumsal bir tedarikçi sertifikası denetleme uzmanısın. Ekli PDF sertifika belgesini dikkatle incele.

Kurallar:
1. Sertifikanın geçerlilik bitiş tarihini (Expiration / Valid Until Date) tespit et.
2. Belgenin bir ISO, CE, Vergi Levhası, Faaliyet Belgesi veya geçerli bir kurumsal yeterlilik/uygunluk sertifikası olup olmadığını kontrol et.
3. Eğer sertifika süresi geçmişse (Expiration date bugünden önceyse) veya belge sahte/geçersiz/okunaksız ise:
   - validityStatus: "Expired" veya "Invalid"
   - recommendation: "Öneri: Reddet"
   - reason: Sertifikanın neden geçersiz veya süresinin dolmuş olduğunu açıklayan net bir Türkçe karar gerekçesi. (Örn: "Sertifikanın geçerlilik süresi 15.01.2024 tarihinde dolmuştur.")
   - suggestedFields: "certificate"
4. Eğer sertifika geçerli ve süresi dolmamışsa:
   - validityStatus: "Valid"
   - recommendation: "Öneri: Onayla"
   - reason: Sertifikanın geçerli olduğunu, türünü ve bitiş tarihini açıklayan net bir Türkçe karar gerekçesi. (Örn: "ISO 9001 sertifikası geçerlidir. Bitiş tarihi: 12.10.2028.")
   - suggestedFields: "" (boş dize)

Kesinlikle aşağıdaki JSON formatında yanıt ver, başka hiçbir metin veya markdown ekleme:
{
  "validityStatus": "Valid",
  "recommendation": "Öneri: Onayla",
  "reason": "...",
  "suggestedFields": ""
}`;
}

function parseGeminiResponse(rawText, fileName) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('AI servisinden boş yanıt alındı.');
  }

  let clean = rawText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    throw new Error('AI servisinden dönen yanıt geçerli JSON formatında değil.');
  }

  let recommendation = parsed.recommendation || '';
  if (!recommendation.startsWith('Öneri:')) {
    if (parsed.validityStatus === 'Valid') {
      recommendation = 'Öneri: Onayla';
    } else {
      recommendation = 'Öneri: Reddet';
    }
  }

  return {
    validityStatus: parsed.validityStatus || 'Invalid',
    recommendation: recommendation,
    reason: parsed.reason || 'Sertifika analiz edildi.',
    suggestedFields: parsed.suggestedFields || (parsed.validityStatus !== 'Valid' ? 'certificate' : ''),
    analyzedAt: new Date().toISOString(),
    fileName: fileName || 'certificate.pdf'
  };
}

async function handleAnalyzeCertificate(submissionId, req) {
  checkApprovalRole(req);

  if (!submissionId) {
    return req.reject(400, 'Geçerli bir başvuru ID si belirtilmelidir.');
  }

  const Submissions = 'codeup.supplier.management.Submissions';
  const submission = await SELECT.one
    .from(Submissions)
    .columns('*', 'certificate')
    .where({ ID: submissionId });

  if (!submission) {
    return req.reject(404, 'Başvuru bulunamadı.');
  }

  if (!submission.certificate) {
    return req.reject(400, 'Bu başvuruya ait bir sertifika dosyası bulunmamaktadır.');
  }

  if (submission.certificateMimeType && submission.certificateMimeType !== 'application/pdf') {
    return req.reject(400, 'Yalnızca PDF formatındaki sertifikalar analiz edilebilir.');
  }

  let certBuffer;
  if (Buffer.isBuffer(submission.certificate)) {
    certBuffer = submission.certificate;
  } else if (typeof submission.certificate[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of submission.certificate) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    certBuffer = Buffer.concat(chunks);
  } else if (typeof submission.certificate.on === 'function') {
    certBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      submission.certificate.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      submission.certificate.on('end', () => resolve(Buffer.concat(chunks)));
      submission.certificate.on('error', reject);
    });
  } else if (typeof submission.certificate === 'string') {
    certBuffer = Buffer.from(submission.certificate, 'base64');
    if (certBuffer.length === 0) {
      certBuffer = Buffer.from(submission.certificate);
    }
  } else {
    certBuffer = Buffer.from(submission.certificate);
  }

  if (!certBuffer || certBuffer.length === 0) {
    return req.reject(400, 'Sertifika dosyası boş veya okunamadı.');
  }

  const base64Data = certBuffer.toString('base64');
  const prompt = buildGeminiPrompt();

  const geminiPayload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  let geminiService;
  try {
    geminiService = await cds.connect.to('gemini');
  } catch (connectErr) {
    return req.reject(
      502,
      'BTP "gemini" Destination servisine bağlanılamadı. Lütfen BTP Cockpit üzerinde "gemini" Destination tanımını ve servis bağlantısını kontrol ediniz.'
    );
  }

  try {
    const result = typeof geminiService.post === 'function'
      ? await geminiService.post('/models/gemini-1.5-flash:generateContent', geminiPayload)
      : await geminiService.send({
          method: 'POST',
          path: '/models/gemini-1.5-flash:generateContent',
          data: geminiPayload,
          headers: {
            'Content-Type': 'application/json'
          }
        });

    const rawText =
      result?.candidates?.[0]?.content?.parts?.[0]?.text ||
      (typeof result === 'string' ? result : JSON.stringify(result));

    const report = parseGeminiResponse(rawText, submission.certificateFileName);

    // HUMAN-IN-THE-LOOP PRINCIPLE:
    // The submission status in the database is NEVER modified by AI analysis.
    // The report is purely returned as decision support to the authorized approver.
    return report;
  } catch (apiErr) {
    if (apiErr.status === 400 || apiErr.statusCode === 400) {
      return req.reject(400, 'Gemini AI servisi gönderilen belgeyi işleyemedi: Geçersiz istek veya dosya formatı.');
    }
    return req.reject(
      502,
      'BTP "gemini" Destination üzerinden AI servisine erişim sırasında bir hata oluştu. Lütfen BTP Destination yapılandırmasını kontrol ediniz.'
    );
  }
}

class ApprovalService extends cds.ApplicationService {
  async init() {
    // In local development with SQLite, ensure view exists so native OData V4 filtering/search works
    if (cds.db?.kind === 'sqlite') {
      try {
        await cds.db.run(`
          CREATE VIEW IF NOT EXISTS codeup_supplier_management_ApprovalService_Submissions AS
          SELECT
            s.ID,
            s.supplier_ID,
            s.companyName,
            s.contactPerson,
            s.phone,
            s.country,
            s.taxId,
            s.website,
            s.address,
            s.notes,
            s.category,
            s.status,
            s.submissionDate,
            s.rejectionReason,
            s.editableFields,
            s.certificate,
            s.certificateMimeType,
            s.certificateFileName,
            sup.email AS supplierEmail
          FROM codeup_supplier_management_Submissions s
          LEFT JOIN codeup_supplier_management_Suppliers sup ON s.supplier_ID = sup.ID
        `);
      } catch (e) {
        // View might already exist
      }
    }

    this.before('*', async (req) => {
      checkApprovalRole(req);
    });

    this.on('approve', 'Submissions', async (req) => {
      const submissionId = req.params?.[0]?.ID || req.params?.[0] || req.data?.ID;
      return handleApprove(submissionId, req);
    });

    this.on('approveSubmission', async (req) => {
      const submissionId = req.data?.ID;
      return handleApprove(submissionId, req);
    });

    this.on('reject', 'Submissions', async (req) => {
      const submissionId = req.params?.[0]?.ID || req.params?.[0] || req.data?.ID;
      const { rejectionReason, editableFields } = req.data;
      return handleReject(submissionId, rejectionReason, editableFields, req);
    });

    this.on('rejectSubmission', async (req) => {
      const { ID, rejectionReason, editableFields } = req.data;
      return handleReject(ID, rejectionReason, editableFields, req);
    });

    this.on('analyzeCertificate', 'Submissions', async (req) => {
      const submissionId = req.params?.[0]?.ID || req.params?.[0] || req.data?.ID;
      return handleAnalyzeCertificate(submissionId, req);
    });

    this.on('analyzeSubmissionCertificate', async (req) => {
      const submissionId = req.data?.ID;
      return handleAnalyzeCertificate(submissionId, req);
    });

    await super.init();
  }
}

ApprovalService.handleApprove = handleApprove;
ApprovalService.handleReject = handleReject;
ApprovalService.handleAnalyzeCertificate = handleAnalyzeCertificate;
ApprovalService.buildGeminiPrompt = buildGeminiPrompt;
ApprovalService.parseGeminiResponse = parseGeminiResponse;
ApprovalService.FIELD_MAP = FIELD_MAP;

module.exports = ApprovalService;
