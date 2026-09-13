import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const candidateEnvFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(process.cwd(), '..', '..', '.env'),
];

for (const envPath of candidateEnvFiles) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
export const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
