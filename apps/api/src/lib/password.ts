export function hasStrongPassword(password: unknown): password is string {
  return typeof password === 'string' && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password.trim());
}
