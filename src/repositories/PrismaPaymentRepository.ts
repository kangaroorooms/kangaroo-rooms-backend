import { Payment, PaymentStatus } from '@prisma/client';
import { getPrismaClient } from '../utils/prisma';
import { logger } from '../utils/logger';
interface CreatePaymentInput {
  tenantId: string;
  orderId: string;
  amount: number;
  plan: string;
  city: string;
  status: PaymentStatus;
}
interface UpdatePaymentInput {
  status?: PaymentStatus;
  razorpayPaymentId?: string;
  utr?: string;
  verifiedAt?: Date;
}

/**
 * PrismaPaymentRepository — FIXED
 *
 * Changes:
 * 1. Uses getPrismaClient() singleton instead of broken named import
 * 2. Removed non-existent `paymentId` field references → uses `razorpayPaymentId` and `utr`
 * 3. Uses PaymentStatus.VERIFIED instead of non-existent PaymentStatus.PAID
 * 4. Accepts prisma client via constructor for consistency
 */
export class PrismaPaymentRepository {
  private prisma;
  constructor(prismaClient?: any) {
    this.prisma = prismaClient || getPrismaClient();
  }
  async create(data: CreatePaymentInput): Promise<Payment> {
    try {
      return await this.prisma.payment.create({
        data: {
          tenantId: data.tenantId,
          orderId: data.orderId,
          amount: data.amount,
          plan: data.plan,
          city: data.city,
          status: data.status
        }
      });
    } catch (error: any) {
      logger.error('Error creating payment', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to create payment');
    }
  }
  async findById(id: string): Promise<Payment | null> {
    try {
      return await this.prisma.payment.findUnique({
        where: {
          id
        }
      });
    } catch (error: any) {
      logger.error('Error finding payment by id', {
        error: error.message
      });
      throw new Error('Failed to find payment');
    }
  }
  async findByOrderId(orderId: string): Promise<Payment | null> {
    try {
      return await this.prisma.payment.findUnique({
        where: {
          orderId
        }
      });
    } catch (error: any) {
      logger.error('Error finding payment by order id', {
        error: error.message
      });
      throw new Error('Failed to find payment');
    }
  }
  async findByTenantId(tenantId: string): Promise<Payment[]> {
    try {
      return await this.prisma.payment.findMany({
        where: {
          tenantId
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error: any) {
      logger.error('Error finding payments by tenant id', {
        error: error.message
      });
      throw new Error('Failed to find payments');
    }
  }
  async findAll(): Promise<Payment[]> {
    try {
      return await this.prisma.payment.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error: any) {
      logger.error('Error finding all payments', {
        error: error.message
      });
      throw new Error('Failed to find payments');
    }
  }
  async update(id: string, data: UpdatePaymentInput): Promise<Payment> {
    try {
      return await this.prisma.payment.update({
        where: {
          id
        },
        data
      });
    } catch (error: any) {
      logger.error('Error updating payment', {
        error: error.message
      });
      throw new Error('Failed to update payment');
    }
  }
  async getStats(): Promise<any> {
    try {
      // Use VERIFIED instead of non-existent PAID
      const [totalPayments, verifiedPayments, failedPayments, totalRevenue] = await Promise.all([this.prisma.payment.count(), this.prisma.payment.count({
        where: {
          status: PaymentStatus.VERIFIED
        }
      }), this.prisma.payment.count({
        where: {
          status: PaymentStatus.FAILED
        }
      }), this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.VERIFIED
        },
        _sum: {
          amount: true
        }
      })]);
      return {
        totalPayments,
        verifiedPayments,
        failedPayments,
        pendingPayments: totalPayments - verifiedPayments - failedPayments,
        totalRevenue: totalRevenue._sum.amount || 0
      };
    } catch (error: any) {
      logger.error('Error getting payment stats', {
        error: error.message
      });
      throw new Error('Failed to get payment stats');
    }
  }
}