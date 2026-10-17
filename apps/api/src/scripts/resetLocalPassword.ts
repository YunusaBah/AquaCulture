import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { hasStrongPassword } from '../lib/password';

function isLocalDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) return false;
  if (databaseUrl.startsWith('file:')) return true;

  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

async function readHiddenPassword(prompt: string) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive local terminal so the password can be entered privately.');
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let password = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003' || character === '\u0004') {
          finish(new Error('Password reset cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          password = password.slice(0, -1);
        } else if (character >= ' ') {
          password += character;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production' || !isLocalDatabase(process.env.DATABASE_URL)) {
    throw new Error('Password reset is restricted to a local development database; no account was changed.');
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  const email = (await prompt.question('Account email: ')).trim();
  prompt.close();
  if (!email) throw new Error('An account email is required.');

  const matches = await prisma.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
    take: 2,
  });
  if (matches.length === 0) throw new Error('No account with that email exists in the local database.');
  if (matches.length > 1) throw new Error('Multiple accounts match that email; resolve the duplicate emails before resetting a password.');

  const password = await readHiddenPassword('New password (minimum 8 characters, uppercase, lowercase, and a number): ');
  if (!hasStrongPassword(password)) {
    throw new Error('Password must be at least 8 characters with uppercase, lowercase, and numbers.');
  }
  const confirmation = await readHiddenPassword('Confirm new password: ');
  if (password !== confirmation) throw new Error('Passwords do not match; no account was changed.');

  await prisma.user.update({
    where: { id: matches[0].id },
    data: { password: await bcrypt.hash(password, 10) },
  });
  console.log('Password updated. Use the account email and new password to log in.');
}

main()
  .catch((error: unknown) => {
    console.error('Local password reset failed:', error instanceof Error ? error.message : 'Unexpected error.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
