import fs from 'fs';
import path from 'path';

export const uploadsDirectory = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');

fs.mkdirSync(uploadsDirectory, { recursive: true });
