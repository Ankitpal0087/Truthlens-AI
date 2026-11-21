const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  const hasLeadingPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
}

function validateEmail(email) {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

function validatePhone(phone) {
  const digits = phone.replace(/^\+/, '');
  return digits.length >= 7 && digits.length <= 15;
}

function validatePassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

function validateRegistrationInput(body) {
  const fullName = String(body.fullName || '').trim();
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const password = body.password;
  const errors = {};

  if (fullName.length < 2 || fullName.length > 100) {
    errors.fullName = 'Full name must be between 2 and 100 characters.';
  }
  if (!validateEmail(email)) errors.email = 'Enter a valid email address.';
  if (!validatePhone(phone)) errors.phone = 'Enter a valid phone number.';
  if (!validatePassword(password)) {
    errors.password = 'Password must be 8-128 characters and include uppercase, lowercase, and a number.';
  }

  return { valid: Object.keys(errors).length === 0, errors, fullName, email, phone, password };
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  validatePassword,
  validateRegistrationInput,
};
