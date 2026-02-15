import { z } from 'zod';
export const RoomType = z.enum(['Single', 'Shared', 'PG', '1BHK', '2BHK']);
export const IdealFor = z.enum(['Students', 'Working Professionals', 'Family']);
export type RoomType = z.infer<typeof RoomType>;
export type IdealFor = z.infer<typeof IdealFor>;
export interface Room {
  id: string;
  title: string;
  description: string;
  city: string;
  location: string;
  landmark: string;
  pricePerMonth: number;
  roomType: RoomType;
  idealFor: IdealFor[];
  amenities: string[];
  images: string[];
  rating: number;
  reviewsCount: number;
  isPopular: boolean;
  isVerified: boolean;
  isActive: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}
export const CreateRoomSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  city: z.string().min(1, 'City is required'),
  location: z.string().min(3, 'Location is required'),
  landmark: z.string().optional().default(''),
  pricePerMonth: z.number().positive('Price must be positive'),
  roomType: RoomType,
  idealFor: z.array(IdealFor).min(1, 'Please select at least one tenant type'),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string()).min(1, 'At least one image is required')
});
export const UpdateRoomSchema = CreateRoomSchema.partial();
export const RoomFiltersSchema = z.object({
  city: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  roomType: RoomType.optional(),
  idealFor: IdealFor.optional(),
  amenities: z.string().transform((v) => v.split(',')).optional(),
  // 🔥 homepage filters
  isPopular: z.coerce.boolean().optional(),
  isVerified: z.coerce.boolean().optional(),
  onlyActive: z.coerce.boolean().default(true),
  // pagination
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;
export type RoomFilters = z.infer<typeof RoomFiltersSchema>;