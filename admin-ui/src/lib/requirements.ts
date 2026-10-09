/**
 * Document-type wording for the admin console.
 *
 * This used to be a second hardcoded label map that had already drifted from
 * client-ui's ("Bank Statements (3 months)" here, "(last 3 months)" there), so
 * staff and applicants were reading different names for the same document.
 * Both now render packages/domain/documents.ts.
 *
 * DOCUMENT_LABELS kept its Record<string, string> shape because three call
 * sites index it directly (CaseDocuments, RequestDocumentModal); it is derived
 * from the shared table rather than restated.
 */
import { DOCUMENT_TYPES } from '../../../packages/domain/documents'

export { getDocumentLabel } from '../../../packages/domain/documents'

export const DOCUMENT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DOCUMENT_TYPES).map(([key, meta]) => [key, meta.label]),
)
