import { useEffect, useId, useMemo, useRef, useState } from 'react'

type SearchableSelectProps = {
  id: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Rendered as the first row when the query matches nothing. */
  emptyLabel?: string
  invalid?: boolean
  describedBy?: string
}

/**
 * A type-to-filter combobox over a closed list.
 *
 * A native <select> is unusable past a few dozen options (the country list is
 * ~250), and the plain <input> it replaces looked like a dropdown without
 * behaving like one — Chrome hung its autofill affordance off it, which is the
 * stray person-icon chevron in the reported screenshot.
 *
 * Implements the ARIA 1.2 combobox pattern rather than a <datalist>: datalist
 * cannot be styled, renders differently in every browser, and still allows a
 * free-text value that is not on the list.
 */
export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  emptyLabel = 'No matches',
  invalid,
  describedBy,
}: SearchableSelectProps) {
  const listboxId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const [open, setOpen] = useState(false)
  // null while closed: the field shows the committed value, not a draft.
  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return options
    // Prefix matches first — typing "ind" should offer India before Réunion.
    const starts: string[] = []
    const contains: string[] = []
    for (const option of options) {
      const lower = option.toLowerCase()
      if (lower.startsWith(q)) starts.push(option)
      else if (lower.includes(q)) contains.push(option)
    }
    return [...starts, ...contains]
  }, [options, query])

  // Close on an outside click or a focus that leaves the widget. Both are
  // needed: pointer-down outside never fires blur when the click lands on a
  // non-focusable element.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Keep the highlighted row in view while arrowing through 250 entries.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function openList() {
    if (open) return
    setOpen(true)
    setQuery('')
    const current = options.indexOf(value)
    setActiveIndex(current >= 0 ? current : 0)
  }

  function close() {
    setOpen(false)
    setQuery(null)
  }

  function commit(option: string) {
    onChange(option)
    close()
    inputRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) return openList()
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        if (!open) return openList()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      case 'Home':
        if (!open) return
        event.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        if (!open) return
        event.preventDefault()
        setActiveIndex(filtered.length - 1)
        return
      case 'Enter':
        if (!open) return
        // Only swallow Enter when it selects something — otherwise let it
        // reach the form so the wizard's Continue still works from here.
        if (filtered[activeIndex]) {
          event.preventDefault()
          commit(filtered[activeIndex])
        }
        return
      case 'Escape':
        if (!open) return
        event.preventDefault()
        close()
        return
      case 'Tab':
        if (open) close()
        return
      default:
    }
  }

  return (
    <div className="searchable-select" ref={wrapRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        className={`searchable-select__input${invalid ? ' input-invalid' : ''}`}
        // autoComplete="off" alone is ignored by Chrome on address-shaped
        // fields; a non-standard token is what actually suppresses it.
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={query ?? value}
        onChange={(e) => {
          if (!open) setOpen(true)
          setQuery(e.target.value)
          setActiveIndex(0)
        }}
        onFocus={openList}
        onClick={openList}
        onBlur={(event) => {
          // A click on an option moves focus into the list; only a focus that
          // leaves the whole widget should discard the draft query.
          if (wrapRef.current?.contains(event.relatedTarget as Node)) return
          close()
        }}
        onKeyDown={onKeyDown}
      />
      <i className="fa-solid fa-chevron-down searchable-select__caret" aria-hidden="true" />

      {open && (
        <ul className="searchable-select__list" role="listbox" id={listboxId} ref={listRef}>
          {filtered.length === 0 ? (
            <li className="searchable-select__empty" role="presentation">{emptyLabel}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={option === value}
                data-active={index === activeIndex}
                className={`searchable-select__option${index === activeIndex ? ' is-active' : ''}${option === value ? ' is-selected' : ''}`}
                // onMouseDown, not onClick: mousedown fires before the input's
                // blur, so the selection lands before the list can unmount.
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(option)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="searchable-select__option-text">{option}</span>
                {option === value && <i className="fa-solid fa-check" aria-hidden="true" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
