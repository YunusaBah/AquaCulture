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

export const runtimeUsers = new Map<string, any>();

export function addRuntimeUser(user: any) {
  runtimeUsers.set(user.id, user);
  runtimeUsers.set(user.email.toLowerCase(), user);
  return user;
}

export function getFallbackUserByCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const runtimeMatch = runtimeUsers.get(normalizedEmail);
  if (runtimeMatch && runtimeMatch.password === password) return runtimeMatch;
  return FALLBACK_DEVELOPMENT_USERS.find(
    (user) => user.email.toLowerCase() === normalizedEmail && user.password === password,
  );
}

export function getFallbackUserById(userId: string) {
  if (runtimeUsers.has(userId)) return runtimeUsers.get(userId);
  return FALLBACK_DEVELOPMENT_USERS.find((user) => user.id === userId);
}

export function listRuntimeUsers() {
  return Array.from(runtimeUsers.values()).filter((user) => typeof user?.email === 'string');
}
