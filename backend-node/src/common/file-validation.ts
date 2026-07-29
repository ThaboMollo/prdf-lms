import { BadRequestException } from '@nestjs/common';
import { basename, extname } from 'path';

/**
 * Server-side upload validation (platform-architecture-design.md §6.3).
 *
 * File-type checking used to be client-side only (FileDropzone filters by
 * extension). That check is bypassable by anyone calling the API directly,
 * which is now the documented integration path — so it is re-done here.
 *
 * Kept deliberately aligned with what the client offers: the dropzones pass
 * `accept=".pdf,.doc,.docx"`. If that list changes, change this one too —
 * a type the UI accepts but the API rejects is a confusing dead end, and a
 * type the API accepts but the UI doesn't is unvalidated surface.
 */
export const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
] as const;

/**
 * Size is NOT enforced here, and cannot be: the browser uploads directly to
 * Supabase Storage using the signed URL, so the API never sees the bytes and
 * any client-supplied size is unverifiable. The real control is the bucket's
 * `file_size_limit` — see docs/outstanding-work.md item S2.
 */
export const DOCUMENT_SIZE_LIMIT_IS_ENFORCED_AT_BUCKET_LEVEL = true;

/**
 * Strip any directory component from a client-supplied filename.
 *
 * The storage path is built as `applications/<id>/<uuid>-<fileName>`. Without
 * this, a fileName of `../../evil.pdf` would climb out of the application's
 * folder and let a caller write outside the prefix their permissions are
 * scoped to. `basename()` removes path separators; the remaining replaces
 * collapse anything else awkward in an object key.
 */
export function sanitizeFileName(fileName: string): string {
  const base = basename(fileName)
    .replace(/[/\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '');

  // basename('..') is '..', and a name that sanitises down to nothing (or to
  // dots only) would produce a malformed or traversing object key.
  if (!base || /^\.+$/.test(base)) {
    throw new BadRequestException('Invalid file name.');
  }

  return base;
}

/**
 * Build the storage prefix an application's documents must live under.
 * Single source of truth — presign constructs paths with it, confirm
 * validates against it.
 */
export function applicationStoragePrefix(applicationId: string): string {
  return `applications/${applicationId}/`;
}

/**
 * Assert a client-supplied storage path belongs to the application it is being
 * recorded against.
 *
 * Without this check, confirmUpload accepts any path the caller invents. That
 * is directly exploitable: record a document row on your *own* application
 * pointing at another client's object key, then request a download URL for it.
 * The ownership query (`where id = $1 and application_id = $2`) passes, because
 * the row really is on your application — and the signed URL is minted with the
 * service role key, which bypasses storage RLS. The result is a working
 * download link to another borrower's financial documents.
 *
 * The presign endpoint is the only thing that should ever decide an object key,
 * and it always builds one under this prefix.
 */
export function assertStoragePathWithinApplication(storagePath: string, applicationId: string): void {
  const prefix = applicationStoragePrefix(applicationId);

  // Reject traversal outright rather than trying to normalise it away.
  if (storagePath.includes('..') || storagePath.includes('\\')) {
    throw new BadRequestException('Invalid storage path.');
  }

  if (!storagePath.startsWith(prefix)) {
    throw new BadRequestException('Storage path does not belong to this application.');
  }

  // Must be a file directly in the application's folder, not a nested path.
  const remainder = storagePath.slice(prefix.length);
  if (!remainder || remainder.includes('/')) {
    throw new BadRequestException('Invalid storage path.');
  }
}

/**
 * Validate a presign request and return the safe filename to build the
 * storage path from. Throws BadRequestException (400) on anything rejected.
 */
export function validateDocumentUpload(fileName: string, contentType?: string | null): string {
  const safeFileName = sanitizeFileName(fileName);

  const extension = extname(safeFileName).toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension as (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number])) {
    throw new BadRequestException(
      `Unsupported file type "${extension || '(none)'}". Allowed: ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')}.`,
    );
  }

  // contentType is optional on the DTO and older clients may omit it. The
  // extension check above still applies in that case; when it IS supplied it
  // must also be allowed, so a caller cannot smuggle an executable through by
  // naming it .pdf while declaring a different type.
  if (contentType) {
    const normalized = contentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(normalized as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) {
      throw new BadRequestException(
        `Unsupported content type "${normalized}". Allowed: ${ALLOWED_DOCUMENT_MIME_TYPES.join(', ')}.`,
      );
    }
  }

  return safeFileName;
}
