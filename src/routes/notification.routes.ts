import { Router } from 'express';
import { notificationController } from '../controllers/NotificationController';
import { authMiddleware } from '../middleware/auth.middleware';

/**
 * Notification Routes
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ENDPOINT STRUCTURE:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GET    /api/notifications           → Get user's notifications
 * GET    /api/notifications/unread    → Get unread count (lightweight)
 * PATCH  /api/notifications/:id/read  → Mark single notification as read
 * PATCH  /api/notifications/read-all  → Mark all notifications as read
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORIZATION:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - All endpoints require JWT authentication
 * - Users can only access their own notifications
 * - No role-based restrictions (all roles can have notifications)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY GUARANTEES:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ✅ All routes require authentication
 * ✅ Users can only access their own notifications
 * ✅ Read-only operations (no mutations to core business data)
 * ✅ Failures return graceful defaults (empty arrays, zero counts)
 *
 * ❌ NO access to other users' notifications
 * ❌ NO access to bookings, payments, subscriptions
 * ❌ NO mutations to core business data
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY NOTIFICATIONS CANNOT BREAK EXISTING FLOWS:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. COMPLETE ISOLATION:
 *    - Notification model is separate from all business models
 *    - No foreign keys to Booking, Payment, or Subscription
 *    - Service layer has no write access to business tables
 *
 * 2. FIRE-AND-FORGET PATTERN:
 *    - Notifications are triggered AFTER core operations succeed
 *    - Notification failures are caught and logged, never thrown
 *    - Core operation success is independent of notification success
 *
 * 3. NO TRANSACTIONAL COUPLING:
 *    - Notifications are NOT in the same transaction as business operations
 *    - A failed notification cannot rollback a successful assignment/note
 *
 * 4. GRACEFUL DEGRADATION:
 *    - If notification service fails, users still see their data
 *    - API returns empty arrays/zero counts rather than errors
 *    - System continues to function without notifications
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/notifications - Get all notifications for user
// Query: ?unreadOnly=true to filter
router.get('/', notificationController.getNotifications);

// GET /api/notifications/unread - Get unread count (lightweight for polling)
router.get('/unread', notificationController.getUnreadCount);

// PATCH /api/notifications/read-all - Mark all as read
// NOTE: This must come BEFORE /:id/read to avoid route conflict
router.patch('/read-all', notificationController.markAllAsRead);

// PATCH /api/notifications/:id/read - Mark single notification as read
router.patch('/:id/read', notificationController.markAsRead);
export default router;