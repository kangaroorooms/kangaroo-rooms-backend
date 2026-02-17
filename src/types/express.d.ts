import { Role } from '@prisma/client';
declare global {
  namespace Express {
    interface UserPayload {
      userId: string;
      role: Role;
    }
    interface Request {
      user?: UserPayload;
    }
  }
}
export {};