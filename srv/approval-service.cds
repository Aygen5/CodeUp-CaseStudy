namespace codeup.supplier.management;

using { codeup.supplier.management as db } from '../db/schema';

@path: '/odata/v4/approval'
@(requires: 'Approval')
service ApprovalService {

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
  };

  action approveSubmission(
    ID : UUID
  ) returns Submissions;

  action rejectSubmission(
    ID              : UUID,
    rejectionReason : String,
    editableFields  : String
  ) returns Submissions;

}
