type ChipSelectProps = {
  options: string[]
  value: string
  onChange: (value: string) => void
  label?: string
}

export function ChipSelect({ options, value, onChange, label }: ChipSelectProps) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`chip${value === option ? ' chip--selected' : ''}`}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
        >
          {value === option && (
            <i className="fa-solid fa-check chip-check" aria-hidden="true" />
          )}
          {option}
        </button>
      ))}
    </div>
  )
}
