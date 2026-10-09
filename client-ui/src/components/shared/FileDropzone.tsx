import { useRef, useState } from 'react'
import { DOCUMENT_MAX_SIZE_BYTES, DOCUMENT_MAX_SIZE_LABEL } from '../../../../packages/domain/constraints'

type FileDropzoneProps = {
  label: string
  accept?: string
  multiple?: boolean
  files: File[]
  onFilesChange: (files: File[]) => void
  error?: string
  hint?: string
}

export function FileDropzone({
  label,
  accept,
  multiple = false,
  files,
  onFilesChange,
  error,
  hint,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  // The accept attribute only filters the picker dialog — drag-and-drop (and
  // "All Files" in the dialog) can still hand us anything, so re-check here.
  function filterAccepted(candidates: File[]): File[] {
    if (!accept) return candidates
    const allowed = accept.split(',').map((ext) => ext.trim().toLowerCase())
    const ok = candidates.filter((f) => allowed.some((ext) => f.name.toLowerCase().endsWith(ext)))
    setTypeError(
      ok.length < candidates.length
        ? `Only ${allowed.join(', ')} files are accepted.`
        : null
    )
    return ok
  }

  /**
   * Reject oversized files before the upload starts.
   *
   * This is a courtesy, not the control: the real limit is the storage
   * bucket's `file_size_limit`, because the browser uploads directly to
   * Supabase through a signed URL and the API never sees the bytes. Without
   * this check the bucket still refuses the file, but the applicant gets an
   * opaque storage error partway through instead of being told which file is
   * too big and by how much.
   */
  function filterWithinSizeLimit(candidates: File[]): File[] {
    const ok = candidates.filter((f) => f.size <= DOCUMENT_MAX_SIZE_BYTES)
    const tooBig = candidates.filter((f) => f.size > DOCUMENT_MAX_SIZE_BYTES)
    setSizeError(
      tooBig.length
        ? `${tooBig.map((f) => f.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} larger than ${DOCUMENT_MAX_SIZE_LABEL}. Compress the file or split it, then try again.`
        : null
    )
    return ok
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setIsDragging(false)
    const dropped = filterWithinSizeLimit(filterAccepted(Array.from(event.dataTransfer.files)))
    if (!dropped.length) return
    const next = multiple ? [...files, ...dropped] : dropped.slice(0, 1)
    onFilesChange(next)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = filterWithinSizeLimit(filterAccepted(Array.from(event.target.files ?? [])))
    event.target.value = ''
    if (!selected.length) return
    const next = multiple ? [...files, ...selected] : selected.slice(0, 1)
    onFilesChange(next)
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="form-field">
      <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</label>
      <div
        className={`file-dropzone${isDragging ? ' file-dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <i className="fa-solid fa-cloud-arrow-up file-dropzone-icon" aria-hidden="true" />
        <p>
          <strong>Click to upload</strong> or drag and drop
        </p>
        {hint && <p style={{ fontSize: '0.78rem' }}>{hint}</p>}
        {/* Stated on every dropzone, not just the two screens that carry a
            banner: RequestedDocuments renders this component on the Status
            page, where there is no surrounding copy to read it from. */}
        <p style={{ fontSize: '0.72rem', opacity: 0.75 }}>Max {DOCUMENT_MAX_SIZE_LABEL} per file</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>
                <i className="fa-solid fa-file" aria-hidden="true" style={{ marginRight: '0.4rem', color: 'var(--brand)' }} />
                {file.name}
              </span>
              <span>{(file.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                className="link-btn"
                onClick={(e) => { e.stopPropagation(); removeFile(index) }}
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {typeError && <p className="field-error" role="alert">{typeError}</p>}
      {sizeError && <p className="field-error" role="alert">{sizeError}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}
