export const isNonEmptyString = (v) =>
  typeof v === "string" && v.trim().length > 0;

export const validateEmail = (email) => {
  if (!isNonEmptyString(email)) throw new Error("Email is required.");
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  if (!re.test(email.trim())) throw new Error("Email is invalid.");
  return email.trim();
};

export const validateUsername = (u) => {
  if (!isNonEmptyString(u)) throw new Error("Username is required.");
  const s = u.trim();
  if (s.length < 3 || s.length > 20) throw new Error("Username must be 3-20 chars.");
  if (!/^[a-z0-9_]+$/i.test(s)) throw new Error("Username must be alphanumeric/underscore.");
  return s;
};

export const validatePassword = (p) => {
  if (!isNonEmptyString(p)) throw new Error("Password is required.");
  const s = p;
  if (s.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s))
    throw new Error("Password must contain letters and numbers.");
  return s;
};
