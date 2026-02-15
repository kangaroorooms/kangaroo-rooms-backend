import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { propertyNoteService, NoteValidationError, NoteNotFoundError, NoteAuthorizationError } from '../services/PropertyNoteService';
import { logger } from '../utils/logger';

/**
 * PropertyNoteController - Property Notes API Endpoints
 *
 * CRITICAL SAFETY RULES:
 * ═══════════════════════════════════════════════════════════════════════════
 * ✅ All routes require authentication (enforced at route level)
 * ✅ Role-based authorization enforced in service layer
 * ✅ Soft delete only (no hard deletes)
 * ✅ Full audit trail maintained
 * ❌ NO booking access
 * ❌ NO payment access
 * ❌ NO subscription access
 * ❌ NO cross-role data leakage
 *
 * ENDPOINTS:
 * ─────────────────────────────────────────────────────────────────────────────
 * POST   /api/properties/:propertyId/notes  → Create note (ADMIN, AGENT assigned)
 * GET    /api/properties/:propertyId/notes  → List notes (ADMIN, OWNER, TENANT assigned)
 * PATCH  /api/notes/:noteId                 → Update note (ADMIN, AGENT author)
 * DELETE /api/notes/:noteId                 → Soft delete (ADMIN, AGENT author)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class PropertyNoteController {
  constructor() {
    // Bind methods to preserve 'this' context
    this.createNote = this.createNote.bind(this);
    this.getNotes = this.getNotes.bind(this);
    this.updateNote = this.updateNote.bind(this);
    this.deleteNote = this.deleteNote.bind(this);
  }

  // ==========================================================================
  // CREATE NOTE
  // ==========================================================================

  /**
   * POST /api/properties/:propertyId/notes
   *
   * Create a new note for a property.
   *
   * Path Params:
   * - propertyId: Room ID
   *
   * Body:
   * - content: Note content (required)
   *
   * Authorization:
   * - ADMIN: Always allowed
   * - AGENT: Only if assigned to property
   * - OWNER/TENANT: Not allowed
   *
   * Response:
   * - 201: Note created successfully
   * - 400: Validation error (empty content)
   * - 401: Authentication required
   * - 403: Authorization denied
   * - 404: Property not found
   * - 500: Server error
   */
  async createNote(req: AuthRequest, res: Response) {
    try {
      const {
        propertyId
      } = req.params;
      const {
        content
      } = req.body || {};
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      // Validate authentication
      if (!userId || !userRole) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      logger.info(`[PropertyNoteController] POST /properties/${propertyId}/notes by ${userId} (${userRole})`);

      // Validate request body
      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required'
        });
      }
      const note = await propertyNoteService.createPropertyNote({
        propertyId,
        content,
        authorId: userId,
        authorRole: userRole
      });
      return res.status(201).json({
        success: true,
        data: note,
        message: 'Note created successfully'
      });
    } catch (error: any) {
      return this.handleError(res, error, 'create note');
    }
  }

  // ==========================================================================
  // GET NOTES
  // ==========================================================================

  /**
   * GET /api/properties/:propertyId/notes
   *
   * Get all notes for a property.
   *
   * Path Params:
   * - propertyId: Room ID
   *
   * Authorization:
   * - ADMIN: Sees all notes including deleted
   * - OWNER: Sees non-deleted notes for their properties
   * - TENANT: Sees non-deleted notes for assigned properties
   * - AGENT: Not allowed (they create notes, not read them)
   *
   * Response:
   * - 200: Notes retrieved successfully
   * - 401: Authentication required
   * - 403: Authorization denied
   * - 404: Property not found
   * - 500: Server error
   */
  async getNotes(req: AuthRequest, res: Response) {
    try {
      const {
        propertyId
      } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      // Validate authentication
      if (!userId || !userRole) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      logger.info(`[PropertyNoteController] GET /properties/${propertyId}/notes by ${userId} (${userRole})`);
      const notes = await propertyNoteService.getPropertyNotes({
        propertyId,
        userId,
        userRole
      });
      return res.status(200).json({
        success: true,
        data: notes,
        meta: {
          total: notes.length,
          propertyId
        }
      });
    } catch (error: any) {
      return this.handleError(res, error, 'get notes');
    }
  }

  // ==========================================================================
  // UPDATE NOTE
  // ==========================================================================

  /**
   * PATCH /api/notes/:noteId
   *
   * Update an existing note.
   *
   * Path Params:
   * - noteId: PropertyNote ID
   *
   * Body:
   * - content: New note content (required)
   *
   * Authorization:
   * - ADMIN: Can update any note
   * - AGENT: Can only update their own notes
   * - OWNER/TENANT: Not allowed
   *
   * Response:
   * - 200: Note updated successfully
   * - 400: Validation error (empty content)
   * - 401: Authentication required
   * - 403: Authorization denied
   * - 404: Note not found
   * - 500: Server error
   */
  async updateNote(req: AuthRequest, res: Response) {
    try {
      const {
        noteId
      } = req.params;
      const {
        content
      } = req.body || {};
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      // Validate authentication
      if (!userId || !userRole) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      logger.info(`[PropertyNoteController] PATCH /notes/${noteId} by ${userId} (${userRole})`);

      // Validate request body
      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required'
        });
      }
      const note = await propertyNoteService.updatePropertyNote({
        noteId,
        content,
        userId,
        userRole
      });
      return res.status(200).json({
        success: true,
        data: note,
        message: 'Note updated successfully'
      });
    } catch (error: any) {
      return this.handleError(res, error, 'update note');
    }
  }

  // ==========================================================================
  // DELETE NOTE
  // ==========================================================================

  /**
   * DELETE /api/notes/:noteId
   *
   * Soft-delete a note.
   *
   * Path Params:
   * - noteId: PropertyNote ID
   *
   * Authorization:
   * - ADMIN: Can delete any note
   * - AGENT: Can only delete their own notes
   * - OWNER/TENANT: Not allowed
   *
   * Response:
   * - 200: Note deleted successfully
   * - 401: Authentication required
   * - 403: Authorization denied
   * - 404: Note not found
   * - 500: Server error
   *
   * SAFETY:
   * - This is a SOFT DELETE (isDeleted = true)
   * - NO hard delete - data is preserved for audit
   * - Idempotent - returns success if already deleted
   */
  async deleteNote(req: AuthRequest, res: Response) {
    try {
      const {
        noteId
      } = req.params;
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      // Validate authentication
      if (!userId || !userRole) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      logger.info(`[PropertyNoteController] DELETE /notes/${noteId} by ${userId} (${userRole})`);
      const result = await propertyNoteService.deletePropertyNote({
        noteId,
        userId,
        userRole
      });
      return res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      return this.handleError(res, error, 'delete note');
    }
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  /**
   * Centralized error handler for consistent API responses.
   *
   * Maps service-layer errors to appropriate HTTP status codes:
   * - NoteValidationError → 400 Bad Request
   * - NoteAuthorizationError → 403 Forbidden
   * - NoteNotFoundError → 404 Not Found
   * - Unknown errors → 500 Internal Server Error
   */
  private handleError(res: Response, error: any, operation: string) {
    logger.error(`[PropertyNoteController] Error in ${operation}:`, error);
    if (error instanceof NoteValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    if (error instanceof NoteAuthorizationError) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    if (error instanceof NoteNotFoundError) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || `Failed to ${operation}`
    });
  }
}

// Export singleton instance
export const propertyNoteController = new PropertyNoteController();