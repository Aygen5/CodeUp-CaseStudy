namespace codeup.supplier.management;

// Veritabanı şemasını içe aktarır
using { codeup.supplier.management as db } from '../db/schema';

// Tedarikçi portalının bağlandığı genel (public) OData V4 servisi
@path: '/odata/v4/public'
service PublicService {

  // Giriş ve kayıt sonrası dönen yanıt yapısı
  type AuthResponse {
    success    : Boolean;
    message    : String;
    token      : String;
    supplierId : UUID;
    email      : String;
  }

  // Tedarikçinin kendi başvurusunu okuduğu salt-okunur görünüm
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

  // Yeni tedarikçi hesabı oluşturma
  action register(
    email    : String,
    password : String
  ) returns AuthResponse;

  // Tedarikçi giriş işlemi (token üretir)
  action login(
    email    : String,
    password : String
  ) returns AuthResponse;

  // Giriş yapan tedarikçinin mevcut başvurusunu getirir
  function getMySubmission() returns Submissions;

  // Yeni başvuru ve PDF sertifika yükleme işlemi
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

  // Reddedilen başvuruyu izinli alanlarla tekrar gönderme
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
