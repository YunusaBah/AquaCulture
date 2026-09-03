declare module 'qrcode' {
  export function toDataURL(text: string): Promise<string>;
}

declare namespace Express {
  namespace Multer {
    interface File {
      path: string;
      originalname: string;
      mimetype: string;
    }
  }

  interface Request {
    file?: Multer.File;
  }
}

declare module 'multer' {
  import type { RequestHandler } from 'express';

  type MulterOptions = {
    dest?: string;
  };

  interface MulterInstance {
    single(fieldName: string): RequestHandler;
  }

  function multer(options?: MulterOptions): MulterInstance;
  export default multer;
}
