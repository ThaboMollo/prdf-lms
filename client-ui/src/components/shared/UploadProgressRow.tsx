export type ActiveUpload = {
  id: string
  docType: string
  fileName: string
  /** Bytes, for the "of 2.4 MB" caption. */
  size: number
  /** 0..1, driven by XHR upload progress. */
  progress: number
  /** Set once the request fails; the row stays so the message is readable. */
  error?: string
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * One in-flight (or just-failed) file.
 *
 * The bar is driven by real bytes-on-the-wire from XMLHttpRequest rather than
 * a fake animation — uploadToSignedUrl holds it at 99% until the PUT response
 * lands, so "100%" is only ever shown for a file the server has actually
 * stored.
 */
export function UploadProgressRow({
  upload,
  onDismiss,
}: {
  upload: ActiveUpload
  onDismiss: (id: string) => void
}) {
  const percent = Math.round(upload.progress * 100)
  const failed = Boolean(upload.error)

  return (
    <div className={`upload-row${failed ? ' upload-row--error' : ''}`}>
      <div className="upload-row__top">
        <span className="upload-row__name" title={upload.fileName}>
          <i className={`fa-solid ${failed ? 'fa-circle-exclamation' : 'fa-arrow-up-from-bracket'}`} aria-hidden="true" />
          {upload.fileName}
        </span>
        <span className="upload-row__meta">
          {failed ? 'Failed' : percent >= 100 ? 'Saving…' : `${percent}%`}
        </span>
      </div>

      <div
        className="upload-row__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={failed ? undefined : percent}
        aria-label={`Uploading ${upload.fileName}`}
      >
        <div className="upload-row__fill" style={{ width: `${failed ? 100 : percent}%` }} />
      </div>

      <div className="upload-row__bottom">
        <span className="upload-row__size">
          {failed ? upload.error : `${formatSize(upload.size)} · keep this tab open until it finishes`}
        </span>
        {failed && (
          <button type="button" className="link-btn" onClick={() => onDismiss(upload.id)}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
