import { Payment } from '../models/Payment';
import { payments } from '../data';
export class PaymentRepository {
  async findAll(): Promise<Payment[]> {
    return payments.map((p) => this.mapToPayment(p));
  }
  async findById(id: string): Promise<Payment | null> {
    const payment = payments.find((p) => p.id === id);
    return payment ? this.mapToPayment(payment) : null;
  }
  async findByUserId(userId: string): Promise<Payment[]> {
    return payments.filter((p) => p.userId === userId).map((p) => this.mapToPayment(p));
  }
  async findBySubscriptionId(subscriptionId: string): Promise<Payment[]> {
    return payments.filter((p) => p.subscriptionId === subscriptionId).map((p) => this.mapToPayment(p));
  }
  async create(paymentData: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Payment> {
    const newPayment = {
      id: String(payments.length + 1),
      ...paymentData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    payments.push(newPayment);
    return this.mapToPayment(newPayment);
  }
  async update(id: string, paymentData: Partial<Payment>): Promise<Payment | null> {
    const index = payments.findIndex((p) => p.id === id);
    if (index === -1) return null;
    payments[index] = {
      ...payments[index],
      ...paymentData,
      updatedAt: new Date()
    };
    return this.mapToPayment(payments[index]);
  }
  private mapToPayment(data: any): Payment {
    return {
      id: data.id,
      userId: data.userId,
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      paymentMethod: data.paymentMethod,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      razorpaySignature: data.razorpaySignature,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
}