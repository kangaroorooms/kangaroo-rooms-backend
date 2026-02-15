import { Router } from 'express';
import { propertyNoteController } from '../controllers/PropertyNoteController';
import { authMiddleware } from '../middleware/auth.middleware';

/**
 * Property Notes Routes
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ENDPOINT STRUCTURE:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Property-scoped endpoints (for create/read):
 *   POST   /api/properties/:propertyId/notes  → Create note
 *   GET    /api/properties/:propertyId/notes  → List notes for property
 *
 * Note-scoped endpoints (for update/delete):
 *   PATCH  /api/notes/:noteId                 → Update note
 *   DELETE /api/notes/:noteId                 → Soft delete note
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTHORIZATION MATRIX:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ┌─────────┬───────┬─────────────────┬─────────────────┬──────────────────┐
 * │ Action  │ ADMIN │ AGENT (assigned)│ OWNER (property)│ TENANT (assigned)│
 * ├─────────┼───────┼─────────────────┼─────────────────┼──────────────────┤
 * │ CREATE  │  ✅   │       ✅        │       ❌        │        ❌        │
 * │ READ    │  ✅   │       ❌        │       ✅        │        ✅        │
 * │ UPDATE  │  ✅   │  ✅ (own only)  │       ❌        │        ❌        │
 * │ DELETE  │  ✅   │  ✅ (own only)  │       ❌        │        ❌        │
 * └─────────┴───────┴─────────────────┴─────────────────┴──────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY GUARANTEES:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ✅ All routes require JWT authentication
 * ✅ Authorization enforced at service layer (role + ownership checks)
 * ✅ Soft delete only (isDeleted = true, never hard delete)
 * ✅ Full audit trail (authorId, deletedBy, timestamps)
 * ✅ Deleted notes hidden from non-admin users
 *
 * ❌ NO access to bookings
 * ❌ NO access to payments
 * ❌ NO access to subscriptions
 * ❌ NO cross-role data leakage
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY NOTES DO NOT AFFECT BOOKINGS/PAYMENTS:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. DATA ISOLATION:
 *    - PropertyNote model has NO relations to Booking or Payment tables
 *    - Notes are linked only to Room (property) and User (author/deleter)
 *    - Service layer queries ONLY PropertyNote, Room, User, and Assignment tables
 *
 * 2. NO MUTATION SIDE EFFECTS:
 *    - Creating/updating/deleting notes does NOT trigger any booking logic
 *    - No cascading updates to payment or subscription records
 *    - Notes are purely informational metadata
 *
 * 3. QUERY ISOLATION:
 *    - Read queries filter by propertyId and authorization only
 *    - No JOINs or includes on Booking/Payment tables
 *    - Tenant access verified via separate assignment check (not booking mutation)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const router = Router();

// ============================================================================
// PROPERTY-SCOPED ROUTES
// These are mounted at /api/properties/:propertyId/notes
// ============================================================================

/**
 * Property Notes Sub-Router
 *
 * Handles:
 * - POST /api/properties/:propertyId/notes
 * - GET  /api/properties/:propertyId/notes
 */
export const propertyNotesRouter = Router({
  mergeParams: true
});

// All routes require authentication
propertyNotesRouter.use(authMiddleware);

// POST /api/properties/:propertyId/notes - Create a note
propertyNotesRouter.post('/', propertyNoteController.createNote);

// GET /api/properties/:propertyId/notes - Get all notes for a property
propertyNotesRouter.get('/', propertyNoteController.getNotes);

// ============================================================================
// NOTE-SCOPED ROUTES
// These are mounted at /api/notes
// ============================================================================

/**
 * Notes Router
 *
 * Handles:
 * - PATCH  /api/notes/:noteId
 * - DELETE /api/notes/:noteId
 */
export const notesRouter = Router();

// All routes require authentication
notesRouter.use(authMiddleware);

// PATCH /api/notes/:noteId - Update a note
notesRouter.patch('/:noteId', propertyNoteController.updateNote);

// DELETE /api/notes/:noteId - Soft delete a note
notesRouter.delete('/:noteId', propertyNoteController.deleteNote);

// Default export for backward compatibility
export default router;