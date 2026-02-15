import { getPrismaClient } from '../utils/prisma';
import { Role } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * PropertyNoteService - Property-Centric Notes Management
 *
 * BUSINESS RULES (STRICT):
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUTHORIZATION MATRIX:
 * ┌─────────┬───────┬─────────────────┬─────────────────┬──────────────────┐
 * │ Action  │ ADMIN │ AGENT (assigned)│ OWNER (property)│ TENANT (assigned)│
 * ├─────────┼───────┼─────────────────┼─────────────────┼──────────────────┤
 * │ CREATE  │  ✅   │       ✅        │       ❌        │        ❌        │
 * │ READ    │  ✅   │       ❌        │       ✅        │        ✅        │
 * │ UPDATE  │  ✅   │  ✅ (own only)  │       ❌        │        ❌        │
 * │ DELETE  │  ✅   │  ✅ (own only)  │       ❌        │        ❌        │
 * └─────────┴───────┴─────────────────┴─────────────────┴──────────────────┘
 *
 * CRITICAL SAFETY RULES:
 * ✅ Notes are PROPERTY-CENTRIC (tied to a specific property)
 * ✅ Soft delete only (isDeleted = true, never hard delete)
 * ✅ Full audit trail (authorId, deletedBy, timestamps)
 * ✅ Role-based visibility enforcement
 * ❌ NO access to Booking mutations
 * ❌ NO access to Payment mutations
 * ❌ NO access to Subscription mutations
 * ❌ NO cross-role data leakage
 * ❌ Deleted notes NEVER exposed to non-admin users
 */

const prisma = getPrismaClient();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PropertyNoteView {
  id: string;
  propertyId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    role: string;
  };
  // Only visible to admin
  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}
export interface CreateNoteInput {
  propertyId: string;
  content: string;
  authorId: string;
  authorRole: Role;
}
export interface UpdateNoteInput {
  noteId: string;
  content: string;
  userId: string;
  userRole: Role;
}
export interface DeleteNoteInput {
  noteId: string;
  userId: string;
  userRole: Role;
}
export interface GetNotesInput {
  propertyId: string;
  userId: string;
  userRole: Role;
}

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

export class NoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoteValidationError';
  }
}
export class NoteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoteNotFoundError';
  }
}
export class NoteAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoteAuthorizationError';
  }
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class PropertyNoteService {
  constructor() {
    // Bind methods to preserve 'this' context
    this.createPropertyNote = this.createPropertyNote.bind(this);
    this.getPropertyNotes = this.getPropertyNotes.bind(this);
    this.updatePropertyNote = this.updatePropertyNote.bind(this);
    this.deletePropertyNote = this.deletePropertyNote.bind(this);
    this.canCreateNote = this.canCreateNote.bind(this);
    this.canReadNotes = this.canReadNotes.bind(this);
    this.canModifyNote = this.canModifyNote.bind(this);
  }

  // ==========================================================================
  // AUTHORIZATION HELPERS
  // ==========================================================================

  /**
   * CHECK CREATE PERMISSION
   *
   * Who can CREATE notes:
   * - ADMIN: Always
   * - AGENT: Only if assigned to the property
   * - OWNER: Never (notes are for internal use)
   * - TENANT: Never (notes are for internal use)
   */
  private async canCreateNote(userId: string, userRole: Role, propertyId: string): Promise<boolean> {
    // ADMIN can always create
    if (userRole === Role.ADMIN) {
      return true;
    }

    // AGENT can create only if assigned to property
    if (userRole === Role.AGENT) {
      const assignment = await prisma.agentPropertyAssignment.findFirst({
        where: {
          agentId: userId,
          propertyId: propertyId,
          isActive: true
        }
      });
      return !!assignment;
    }

    // OWNER and TENANT cannot create notes
    return false;
  }

  /**
   * CHECK READ PERMISSION
   *
   * Who can READ notes:
   * - ADMIN: Always (including deleted notes)
   * - OWNER: Only for their own properties
   * - TENANT: Only if assigned to property via booking or agent assignment
   * - AGENT: Cannot read notes (they create them for others)
   */
  private async canReadNotes(userId: string, userRole: Role, propertyId: string): Promise<boolean> {
    // ADMIN can always read
    if (userRole === Role.ADMIN) {
      return true;
    }

    // OWNER can read notes for their own properties
    if (userRole === Role.OWNER) {
      const property = await prisma.room.findFirst({
        where: {
          id: propertyId,
          ownerId: userId
        }
      });
      return !!property;
    }

    // TENANT can read if:
    // 1. They have an active booking for this property, OR
    // 2. They are assigned to an agent who is assigned to this property
    if (userRole === Role.TENANT) {
      // Check for active booking
      const booking = await prisma.booking.findFirst({
        where: {
          roomId: propertyId,
          tenantId: userId,
          status: 'APPROVED'
        }
      });
      if (booking) return true;

      // Check for agent assignment chain (tenant → agent → property)
      const tenantAssignment = await prisma.agentTenantAssignment.findFirst({
        where: {
          tenantId: userId,
          isActive: true
        },
        select: {
          agentId: true
        }
      });
      if (tenantAssignment) {
        const propertyAssignment = await prisma.agentPropertyAssignment.findFirst({
          where: {
            agentId: tenantAssignment.agentId,
            propertyId: propertyId,
            isActive: true
          }
        });
        return !!propertyAssignment;
      }
      return false;
    }

    // AGENT cannot read notes (they create them)
    return false;
  }

  /**
   * CHECK MODIFY PERMISSION (UPDATE/DELETE)
   *
   * Who can MODIFY notes:
   * - ADMIN: Always
   * - AGENT: Only their own notes (authorId matches)
   * - OWNER: Never
   * - TENANT: Never
   */
  private async canModifyNote(userId: string, userRole: Role, noteId: string): Promise<{
    allowed: boolean;
    note: any;
  }> {
    const note = await prisma.propertyNote.findUnique({
      where: {
        id: noteId
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });
    if (!note) {
      return {
        allowed: false,
        note: null
      };
    }

    // ADMIN can always modify
    if (userRole === Role.ADMIN) {
      return {
        allowed: true,
        note
      };
    }

    // AGENT can only modify their own notes
    if (userRole === Role.AGENT && note.authorId === userId) {
      return {
        allowed: true,
        note
      };
    }

    // OWNER and TENANT cannot modify notes
    return {
      allowed: false,
      note
    };
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * CREATE PROPERTY NOTE
   *
   * Creates a new note for a property.
   *
   * @param input - CreateNoteInput with propertyId, content, authorId, authorRole
   * @returns Created note with author info
   *
   * AUTHORIZATION:
   * - ADMIN: Always allowed
   * - AGENT: Only if assigned to property
   * - OWNER/TENANT: Not allowed
   *
   * VALIDATION:
   * - Property must exist
   * - Content must not be empty
   */
  async createPropertyNote(input: CreateNoteInput): Promise<PropertyNoteView> {
    const {
      propertyId,
      content,
      authorId,
      authorRole
    } = input;
    logger.info(`[PropertyNoteService] Creating note for property ${propertyId} by user ${authorId} (${authorRole})`);

    // STEP 1: Validate content
    if (!content || content.trim().length === 0) {
      throw new NoteValidationError('Note content cannot be empty');
    }

    // STEP 2: Validate property exists
    const property = await prisma.room.findUnique({
      where: {
        id: propertyId
      },
      select: {
        id: true
      }
    });
    if (!property) {
      throw new NoteNotFoundError(`Property not found: ${propertyId}`);
    }

    // STEP 3: Check authorization
    const canCreate = await this.canCreateNote(authorId, authorRole, propertyId);
    if (!canCreate) {
      throw new NoteAuthorizationError(`User ${authorId} (${authorRole}) is not authorized to create notes for property ${propertyId}`);
    }

    // STEP 4: Create the note
    const note = await prisma.propertyNote.create({
      data: {
        propertyId,
        authorId,
        content: content.trim()
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });
    logger.info(`[PropertyNoteService] Note created: ${note.id}`);
    return {
      id: note.id,
      propertyId: note.propertyId,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      author: {
        id: note.author.id,
        name: note.author.name,
        role: note.author.role
      }
    };
  }

  /**
   * GET PROPERTY NOTES
   *
   * Fetches all notes for a property based on user's authorization.
   *
   * @param input - GetNotesInput with propertyId, userId, userRole
   * @returns Array of notes (filtered by visibility rules)
   *
   * VISIBILITY RULES:
   * - ADMIN: Sees all notes including deleted (with deletion metadata)
   * - OWNER: Sees only non-deleted notes for their properties
   * - TENANT: Sees only non-deleted notes for assigned properties
   * - AGENT: Cannot read notes
   *
   * SAFETY:
   * - Deleted notes NEVER exposed to non-admin users
   * - No cross-property data leakage
   */
  async getPropertyNotes(input: GetNotesInput): Promise<PropertyNoteView[]> {
    const {
      propertyId,
      userId,
      userRole
    } = input;
    logger.info(`[PropertyNoteService] Fetching notes for property ${propertyId} by user ${userId} (${userRole})`);

    // STEP 1: Validate property exists
    const property = await prisma.room.findUnique({
      where: {
        id: propertyId
      },
      select: {
        id: true
      }
    });
    if (!property) {
      throw new NoteNotFoundError(`Property not found: ${propertyId}`);
    }

    // STEP 2: Check authorization
    const canRead = await this.canReadNotes(userId, userRole, propertyId);
    if (!canRead) {
      throw new NoteAuthorizationError(`User ${userId} (${userRole}) is not authorized to read notes for property ${propertyId}`);
    }

    // STEP 3: Build query based on role
    const isAdmin = userRole === Role.ADMIN;
    const notes = await prisma.propertyNote.findMany({
      where: {
        propertyId,
        // Non-admin users only see non-deleted notes
        ...(isAdmin ? {} : {
          isDeleted: false
        })
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    logger.info(`[PropertyNoteService] Found ${notes.length} notes for property ${propertyId}`);

    // STEP 4: Transform to response DTO
    return notes.map((note) => {
      const baseNote: PropertyNoteView = {
        id: note.id,
        propertyId: note.propertyId,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        author: {
          id: note.author.id,
          name: note.author.name,
          role: note.author.role
        }
      };

      // Admin sees deletion metadata
      if (isAdmin) {
        baseNote.isDeleted = note.isDeleted;
        baseNote.deletedAt = note.deletedAt;
        baseNote.deletedBy = note.deletedBy;
      }
      return baseNote;
    });
  }

  /**
   * UPDATE PROPERTY NOTE
   *
   * Updates the content of an existing note.
   *
   * @param input - UpdateNoteInput with noteId, content, userId, userRole
   * @returns Updated note
   *
   * AUTHORIZATION:
   * - ADMIN: Can update any note
   * - AGENT: Can only update their own notes
   * - OWNER/TENANT: Cannot update notes
   *
   * VALIDATION:
   * - Note must exist and not be deleted
   * - Content must not be empty
   */
  async updatePropertyNote(input: UpdateNoteInput): Promise<PropertyNoteView> {
    const {
      noteId,
      content,
      userId,
      userRole
    } = input;
    logger.info(`[PropertyNoteService] Updating note ${noteId} by user ${userId} (${userRole})`);

    // STEP 1: Validate content
    if (!content || content.trim().length === 0) {
      throw new NoteValidationError('Note content cannot be empty');
    }

    // STEP 2: Check authorization and get note
    const {
      allowed,
      note
    } = await this.canModifyNote(userId, userRole, noteId);
    if (!note) {
      throw new NoteNotFoundError(`Note not found: ${noteId}`);
    }
    if (!allowed) {
      throw new NoteAuthorizationError(`User ${userId} (${userRole}) is not authorized to update note ${noteId}`);
    }

    // STEP 3: Check if note is deleted (only admin can update deleted notes)
    if (note.isDeleted && userRole !== Role.ADMIN) {
      throw new NoteNotFoundError(`Note not found: ${noteId}`);
    }

    // STEP 4: Update the note
    const updatedNote = await prisma.propertyNote.update({
      where: {
        id: noteId
      },
      data: {
        content: content.trim()
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });
    logger.info(`[PropertyNoteService] Note updated: ${noteId}`);
    return {
      id: updatedNote.id,
      propertyId: updatedNote.propertyId,
      content: updatedNote.content,
      createdAt: updatedNote.createdAt,
      updatedAt: updatedNote.updatedAt,
      author: {
        id: updatedNote.author.id,
        name: updatedNote.author.name,
        role: updatedNote.author.role
      }
    };
  }

  /**
   * DELETE PROPERTY NOTE (SOFT DELETE)
   *
   * Soft-deletes a note by setting isDeleted = true.
   *
   * @param input - DeleteNoteInput with noteId, userId, userRole
   * @returns Success result
   *
   * AUTHORIZATION:
   * - ADMIN: Can delete any note
   * - AGENT: Can only delete their own notes
   * - OWNER/TENANT: Cannot delete notes
   *
   * SAFETY:
   * - NO hard delete - only sets isDeleted = true
   * - Records deletedAt timestamp and deletedBy user
   * - Preserves audit trail
   * - Idempotent - returns success if already deleted
   */
  async deletePropertyNote(input: DeleteNoteInput): Promise<{
    success: boolean;
    message: string;
  }> {
    const {
      noteId,
      userId,
      userRole
    } = input;
    logger.info(`[PropertyNoteService] Deleting note ${noteId} by user ${userId} (${userRole})`);

    // STEP 1: Check authorization and get note
    const {
      allowed,
      note
    } = await this.canModifyNote(userId, userRole, noteId);
    if (!note) {
      throw new NoteNotFoundError(`Note not found: ${noteId}`);
    }
    if (!allowed) {
      throw new NoteAuthorizationError(`User ${userId} (${userRole}) is not authorized to delete note ${noteId}`);
    }

    // STEP 2: Check if already deleted (idempotent)
    if (note.isDeleted) {
      logger.info(`[PropertyNoteService] Note ${noteId} already deleted`);
      return {
        success: true,
        message: 'Note already deleted'
      };
    }

    // STEP 3: Soft delete the note
    await prisma.propertyNote.update({
      where: {
        id: noteId
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId
      }
    });
    logger.info(`[PropertyNoteService] Note soft-deleted: ${noteId}`);
    return {
      success: true,
      message: 'Note deleted successfully'
    };
  }
}

// Export singleton instance
export const propertyNoteService = new PropertyNoteService();