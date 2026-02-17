import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '@prisma/client';
export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET as string, {
    expiresIn: env.JWT_EXPIRES_IN as any
  });
}
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET as string) as JwtPayload;
}