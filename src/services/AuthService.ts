import bcrypt from 'bcryptjs';
import { PrismaUserRepository } from '../repositories/PrismaUserRepository';
import { generateToken } from '../utils/jwt';
import { Role } from '@prisma/client';
export class AuthService {
  constructor(private userRepository: PrismaUserRepository) {}
  async register(email: string, password: string, name: string, role: Role) {
    // Validate role - only TENANT and OWNER can sign up
    if (role !== Role.TENANT && role !== Role.OWNER) {
      throw new Error('Only TENANT and OWNER roles can sign up. AGENT and ADMIN accounts must be created manually.');
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('User already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in database
    const user = await this.userRepository.create({
      email,
      password: hashedPassword,
      name,
      role,
      phone: null,
      city: null,
      isActive: true
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Return user without password
    const {
      password: _,
      ...userWithoutPassword
    } = user;
    return {
      user: userWithoutPassword,
      token
    };
  }
  async login(email: string, password: string) {
    // Fetch user from database
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Validate password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Return user without password
    const {
      password: _,
      ...userWithoutPassword
    } = user;
    return {
      user: userWithoutPassword,
      token
    };
  }
  async getUserById(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) return null;
    const {
      password: _,
      ...userWithoutPassword
    } = user;
    return userWithoutPassword;
  }
}