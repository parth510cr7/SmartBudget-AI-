import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: any;
      user?: any;
    }
  }
}
