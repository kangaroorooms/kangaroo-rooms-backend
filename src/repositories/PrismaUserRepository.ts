import { PrismaClient, User } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';
export class PrismaUserRepository {
  private prisma: PrismaClient;
  constructor() {
    this.prisma = getPrismaClient();
  }
  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    try {
      return await this.prisma.user.create({
        data
      });
    } catch (error: any) {
      logger.error('Error creating user', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to create user');
    }
  }
  async findById(id: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: {
          id
        }
      });
    } catch (error: any) {
      logger.error('Error finding user by id', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to find user');
    }
  }
  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: {
          email
        }
      });
    } catch (error: any) {
      logger.error('Error finding user by email', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to find user');
    }
  }
  async findAll(): Promise<User[]> {
    try {
      return await this.prisma.user.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error: any) {
      logger.error('Error finding all users', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to find users');
    }
  }
  async update(id: string, data: Partial<User>): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: {
          id
        },
        data
      });
    } catch (error: any) {
      logger.error('Error updating user', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to update user');
    }
  }
  async delete(id: string): Promise<User> {
    try {
      return await this.prisma.user.delete({
        where: {
          id
        }
      });
    } catch (error: any) {
      logger.error('Error deleting user', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to delete user');
    }
  }
}