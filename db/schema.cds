namespace codeup.supplier.management;

using { cuid } from '@sap/cds/common';

type Category : String enum {
  Hardware;
  Software;
  Services;
  Consulting;
}

type SubmissionStatus : String enum {
  Pending;
  InReview;
  Approved;
  Rejected;
}

@assert.unique: { email: [email] }
entity Suppliers : cuid {
  @mandatory email : String(255);
  passwordHash     : String(255);
  createdAt        : Timestamp @cds.on.insert: $now;
  submissions      : Association to many Submissions on submissions.supplier = $self;
}

entity Submissions : cuid {
  supplier            : Association to Suppliers;
  companyName         : String(255);
  contactPerson       : String(255);
  phone               : String(50);
  country             : String(100);
  taxId               : String(50);
  website             : String(255);
  address             : String(1000);
  notes               : String(2000);
  category            : Category;
  status              : SubmissionStatus default 'Pending';
  submissionDate      : Timestamp;
  rejectionReason     : String(2000);
  editableFields      : String(1000);

  @Core.MediaType: certificateMimeType
  @Core.Filename: certificateFileName
  @Core.AcceptableMediaTypes: ['application/pdf']
  certificate         : LargeBinary;

  @Core.IsMediaType: true
  certificateMimeType : String(100);
  certificateFileName : String(255);
}
