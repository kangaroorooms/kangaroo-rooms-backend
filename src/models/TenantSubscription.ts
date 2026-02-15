import { z } from 'zod';
export const PlanName = z.enum(['FREE', 'GOLD', 'PLATINUM']);
export type PlanName = z.infer<typeof PlanName>;
export const SubscriptionStatus = z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;
export interface TenantSubscription {
  id: string;
  tenantId: string;
  plan: PlanName;
  city: string;
  startedAt: string;
  expiresAt?: string;
  isActive: boolean;
}
export interface CityPricing {
  id: string;
  city: string;
  plan: PlanName;
  price: number;
  createdAt: string;
}
export const CreateSubscriptionSchema = z.object({
  plan: PlanName,
  city: z.string().min(1, 'City is required')
});
export const CityPricingSchema = z.object({
  city: z.string().min(1, 'City is required'),
  plan: PlanName,
  price: z.number().min(0, 'Price must be positive')
});
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>;
export type CityPricingInput = z.infer<typeof CityPricingSchema>;
export interface VisibilityResponse {
  canViewContact: boolean;
  canViewMap: boolean;
  plan: PlanName;
  message?: string;
  viewCount?: number;
  viewLimit?: number;
}
export interface CurrentSubscriptionResponse {
  plan: PlanName;
  city: string | null;
  canViewContact: boolean;
  canViewMap: boolean;
  price: number;
  expiresAt?: string;
  viewCount?: number;
  viewLimit?: number;
}
export const UpgradeSubscriptionSchema = z.object({
  plan: z.enum(['GOLD', 'PLATINUM']),
  city: z.string().min(1, 'City is required')
});
export type UpgradeSubscriptionInput = z.infer<typeof UpgradeSubscriptionSchema>;