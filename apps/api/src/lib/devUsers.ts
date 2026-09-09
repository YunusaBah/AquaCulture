export const FALLBACK_DEVELOPMENT_USERS = [
  {
    id: 'owner-dev',
    email: 'owner@aquaculture.localapp',
    password: 'Owner7614091',
    name: 'Farm Owner',
    role: 'OWNER' as const,
  },
  {
    id: 'worker-dev',
    email: 'worker@aquaculture.localapp',
    password: 'Worker5221',
    name: 'Field Worker',
    role: 'WORKER' as const,
  },
];

export function getFallbackUserByCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return FALLBACK_DEVELOPMENT_USERS.find(
    (user) => user.email.toLowerCase() === normalizedEmail && user.password === password,
  );
}

export function getFallbackUserById(userId: string) {
  return FALLBACK_DEVELOPMENT_USERS.find((user) => user.id === userId);
}
