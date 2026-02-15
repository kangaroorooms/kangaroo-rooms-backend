import { z } from 'zod';

// Payment Status enum matching Prisma
export const PaymentStatus = z.enum(['CREATED', 'INITIATED', 'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

// Payment model
export interface Payment {
  id: string;
  tenantId: string;
  plan: string;
  city: string;
  amount: number;
  orderId: string;
  utr?: string;
  status: PaymentStatus;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  subscriptionId?: string;
}

// Create payment input schema
export const CreatePaymentSchema = z.object({
  plan: z.enum(['GOLD', 'PLATINUM']),
  city: z.string().min(1, 'City is required'),
  amount: z.number().min(1, 'Amount must be positive')
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

// Verify payment input schema
export const VerifyPaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  utr: z.string().min(1, 'UTR (transaction reference) is required')
});
export type VerifyPaymentInput = z.infer<typeof VerifyPaymentSchema>;

// Payment webhook schema
export const PaymentWebhookSchema = z.object({
  orderId: z.string(),
  status: z.string(),
  utr: z.string().optional(),
  amount: z.number().optional(),
  signature: z.string().optional(),
  metadata: z.record(z.any()).optional()
});
export type PaymentWebhookInput = z.infer<typeof PaymentWebhookSchema>;

// Payment response types
export interface PaymentInitiationResponse {
  orderId: string;
  amount: number;
  upiId: string;
  qrCode?: string;
  deepLink?: string;
  status: PaymentStatus;
}
export interface PaymentVerificationResponse {
  orderId: string;
  status: PaymentStatus;
  verified: boolean;
  subscriptionActivated: boolean;
  message?: string;
}