const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()\d\s-]{7,30}$/;

const normalizeString = (value) => (value === null || value === undefined ? '' : String(value).trim());

const isValidDate = (value) => {
  const text = normalizeString(value);
  if (!DATE_PATTERN.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

const validateDateRange = (start, end, { requiredStart = false, requiredEnd = false } = {}) => {
  const errors = [];
  if (requiredStart && !normalizeString(start)) errors.push('Start date is required.');
  if (requiredEnd && !normalizeString(end)) errors.push('End date is required.');
  if (start && !isValidDate(start)) errors.push('Start date must use YYYY-MM-DD format.');
  if (end && !isValidDate(end)) errors.push('End date must use YYYY-MM-DD format.');
  if (isValidDate(start) && isValidDate(end) && end < start) errors.push('End date cannot be earlier than start date.');
  return errors;
};

const positiveId = (value) => /^\d+$/.test(String(value || '')) && Number(value) > 0;

const validateMou = (body) => {
  const errors = [];
  if (!positiveId(body.college_id) && !normalizeString(body.college_name)) errors.push('Partner is required.');
  if (!isValidDate(body.mou_date)) errors.push('Signing date must use YYYY-MM-DD format.');
  if (!isValidDate(body.valid_upto)) errors.push('Expiry date must use YYYY-MM-DD format.');
  if (isValidDate(body.mou_date) && isValidDate(body.valid_upto) && body.valid_upto < body.mou_date) errors.push('Expiry date cannot be earlier than signing date.');
  if (body.students_benefited !== undefined && (!Number.isInteger(Number(body.students_benefited)) || Number(body.students_benefited) < 0)) errors.push('Students benefited must be a non-negative whole number.');
  if (body.contact_email && !EMAIL_PATTERN.test(normalizeString(body.contact_email))) errors.push('Contact email is invalid.');
  if (body.contact_phone && !PHONE_PATTERN.test(normalizeString(body.contact_phone))) errors.push('Contact phone is invalid.');
  return errors;
};

const validateProject = (body) => {
  const errors = [];
  if (!positiveId(body.mou_id)) errors.push('A valid MOU is required.');
  if (!normalizeString(body.title)) errors.push('Project title is required.');
  if (body.status && !['Planned', 'Active', 'Completed', 'Cancelled'].includes(body.status)) errors.push('Project status is invalid.');
  errors.push(...validateDateRange(body.start_date, body.end_date));
  return errors;
};

const validateIntern = (body) => {
  const errors = [];
  if (!positiveId(body.mou_id)) errors.push('A valid MOU is required.');
  if (!positiveId(body.student_id) && !normalizeString(body.intern_name)) errors.push('Intern name is required.');
  if (body.status && !['Planned', 'Active', 'Completed', 'Cancelled'].includes(body.status)) errors.push('Intern status is invalid.');
  errors.push(...validateDateRange(body.start_date, body.end_date));
  return errors;
};

const validateStudent = (body) => {
  const errors = [];
  if (!normalizeString(body.name)) errors.push('Student name is required.');
  if (body.email && !EMAIL_PATTERN.test(normalizeString(body.email))) errors.push('Student email is invalid.');
  if (body.phone && !PHONE_PATTERN.test(normalizeString(body.phone))) errors.push('Student phone is invalid.');
  if (!positiveId(body.college_id)) errors.push('A valid college_id is required.');
  return errors;
};

module.exports = { EMAIL_PATTERN, PHONE_PATTERN, normalizeString, isValidDate, validateDateRange, positiveId, validateMou, validateProject, validateIntern, validateStudent };
