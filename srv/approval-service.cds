namespace codeup.supplier.management;

using { codeup.supplier.management as db } from '../db/schema';

@path: '/odata/v4/approval'
@(requires: 'Approval')
service ApprovalService {

  type AIReport {
    validityStatus  : String;
    recommendation  : String;
    reason          : String;
    suggestedFields : String;
    analyzedAt      : Timestamp;
    fileName        : String;
  }

  @readonly
  entity Suppliers as projection on db.Suppliers excluding { passwordHash };

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

  action approveSubmission(
    ID : UUID
  ) returns Submissions;

  action rejectSubmission(
    ID              : UUID,
    rejectionReason : String,
    editableFields  : String
  ) returns Submissions;

  action analyzeSubmissionCertificate(
    ID : UUID
  ) returns AIReport;

}
