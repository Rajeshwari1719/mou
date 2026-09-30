const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])\S{8,}$/;
// Public registration always creates viewers. Roles supplied by clients are ignored.
const ALLOWED_SIGNUP_ROLES = ['admin', 'viewer'];

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const cleanText = (value) => String(value || '').trim();
const publicSignupRole = () => 'viewer';

const validateSignup = (body) => {
  const errors = [];
  const name = cleanText(body.name);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');

  if (!name) errors.push('Name is required.');
  if (name.length > 255) errors.push('Name must be 255 characters or fewer.');
  if (!email) errors.push('Email is required.');
  else if (!EMAIL_PATTERN.test(email)) errors.push('Enter a valid email address.');
  if (!password) errors.push('Password is required.');
  else if (!PASSWORD_PATTERN.test(password)) errors.push('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
  if (password !== confirmPassword) errors.push('Passwords do not match.');
  return errors;
};

module.exports = { EMAIL_PATTERN, PASSWORD_PATTERN, ALLOWED_SIGNUP_ROLES, normalizeEmail, validateSignup, publicSignupRole };
