import { User, Role } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
export class UserRepository {
  private prisma = getPrismaClient();
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        email
      }
    });
  }
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        id
      }
    });
  }
  async create(data: {
    email: string;
    password: string;
    name: string;
    role: Role;
    phone?: string;
    city?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data
    });
  }
  async update(id: string, data: Partial<User>): Promise<User> {
    return this.prisma.user.update({
      where: {
        id
      },
      data
    });
  }
  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}