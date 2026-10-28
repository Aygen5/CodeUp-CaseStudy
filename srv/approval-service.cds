namespace codeup.supplier.management;

// Veritabanı şemasını içe aktarır
using { codeup.supplier.management as db } from '../db/schema';

// Onay portalının bağlandığı, sadece 'Approval' rolü olanların erişebildiği OData V4 servisi
@path: '/odata/v4/approval'
@(requires: 'Approval')
service ApprovalService {

  // Gemini AI'dan dönecek analiz raporunun şablonudur
  type AIReport {
    validityStatus  : String;
    recommendation  : String;
    reason          : String;
    suggestedFields : String;
    analyzedAt      : Timestamp;
    fileName        : String;
  }

  // Tedarikçiler listesi (güvenlik için şifre hash'i gizlenir)
  @readonly
  entity Suppliers as projection on db.Suppliers excluding { passwordHash };

  // Onay bekleyen/işlenen başvuruların listesi ve satıra bağlı aksiyonlar
  @readonly
  @cds.search: { companyName, contactPerson, supplierEmail, notes, taxId }
  entity Submissions as projection on db.Submissions {
    *,
    supplier.email as supplierEmail
  } actions {
    action approve() returns Submissions;
    action reject(
      rejectionReason : String,
      editableFields  : String
    ) returns Submissions;
    action analyzeCertificate() returns AIReport;
  };

  // Alternatif bağımsız (unbound) onaylama aksiyonu
  action approveSubmission(
    ID : UUID
  ) returns Submissions;

  // Alternatif bağımsız (unbound) reddetme aksiyonu
  action rejectSubmission(
    ID              : UUID,
    rejectionReason : String,
    editableFields  : String
  ) returns Submissions;

  // Alternatif bağımsız (unbound) AI analiz aksiyonu
  action analyzeSubmissionCertificate(
    ID : UUID
  ) returns AIReport;

}
