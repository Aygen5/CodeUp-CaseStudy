namespace codeup.supplier.management;

using { codeup.supplier.management as db } from '../db/schema';

@path: '/odata/v4/public'
service PublicService {

  type AuthResponse {
    success    : Boolean;
    message    : String;
    token      : String;
    supplierId : UUID;
    email      : String;
  }

  @readonly
  entity Submissions as projection on db.Submissions {
    ID,
    supplier.ID as supplier_ID,
    companyName,
    contactPerson,
    phone,
    country,
    taxId,
    website,
    address,
    notes,
    category,
    status,
    submissionDate,
    rejectionReason,
    editableFields,
    certificate,
    certificateMimeType,
    certificateFileName
  };

  action register(
    email    : String,
    password : String
  ) returns AuthResponse;

  action login(
    email    : String,
    password : String
  ) returns AuthResponse;

  function getMySubmission() returns Submissions;

  action createSubmission(
    companyName         : String,
    contactPerson       : String,
    phone               : String,
    country             : String,
    taxId               : String,
    website             : String,
    address             : String,
    notes               : String,
    category            : db.Category,
    certificate         : LargeBinary,
    certificateFileName : String,
    certificateMimeType : String
  ) returns Submissions;

  action reApplySubmission(
    submissionId        : UUID,
    companyName         : String,
    contactPerson       : String,
    phone               : String,
    country             : String,
    taxId               : String,
    website             : String,
    address             : String,
    notes               : String,
    category            : db.Category,
    certificate         : LargeBinary,
    certificateFileName : String,
    certificateMimeType : String
  ) returns Submissions;

}
