/**
 * Document-type wording for the client portal.
 *
 * The content moved to packages/domain/documents.ts so admin-ui renders the
 * same strings — see that file for why. This module stays as the import path
 * every page here already uses, and keeps the {label, hint, expectedCount}
 * shape those pages destructure.
 */
export {
  DOCUMENT_TYPES as DOCUMENT_LABELS,
  getDocumentLabel,
  getDocumentHint,
  expectedFileCount,
  type DocumentTypeMeta,
} from '../../../packages/domain/documents'
