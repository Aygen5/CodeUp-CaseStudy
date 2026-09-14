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

    await super.init();
  }
}

ApprovalService.handleApprove = handleApprove;
ApprovalService.handleReject = handleReject;
ApprovalService.FIELD_MAP = FIELD_MAP;

module.exports = ApprovalService;
