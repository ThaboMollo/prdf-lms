export type AddressValue = {
  addressLine1: string
  addressLine2: string
  city: string
  province: string
  country: string
}

const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
]

type AddressFieldsProps = {
  value: AddressValue
  onChange: (value: AddressValue) => void
  errors?: Partial<Record<keyof AddressValue, string>>
}

export function AddressFields({ value, onChange, errors }: AddressFieldsProps) {
  const set = (field: keyof AddressValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [field]: e.target.value })

  return (
    <div className="address-fields">
      <div className="form-field">
        <label htmlFor="addressLine1">Street address</label>
        <input
          id="addressLine1"
          type="text"
          value={value.addressLine1}
          onChange={set('addressLine1')}
          placeholder="123 Main Street"
        />
        {errors?.addressLine1 && <span className="field-error">{errors.addressLine1}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="addressLine2">Address line 2 <span className="label-optional">(optional)</span></label>
        <input
          id="addressLine2"
          type="text"
          value={value.addressLine2}
          onChange={set('addressLine2')}
          placeholder="Suite, floor, building"
        />
      </div>

      <div className="address-fields__row">
        <div className="form-field">
          <label htmlFor="city">City</label>
          <input
            id="city"
            type="text"
            value={value.city}
            onChange={set('city')}
            placeholder="Johannesburg"
          />
          {errors?.city && <span className="field-error">{errors.city}</span>}
        </div>

        <div className="form-field">
          <label htmlFor="province">Province</label>
          <select id="province" value={value.province} onChange={set('province')}>
            <option value="">Select province</option>
            {SA_PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {errors?.province && <span className="field-error">{errors.province}</span>}
        </div>
      </div>

      <div className="address-fields__country">
        <div className="form-field">
          <label htmlFor="country">Country</label>
          <input
            id="country"
            type="text"
            value={value.country}
            onChange={set('country')}
          />
          {errors?.country && <span className="field-error">{errors.country}</span>}
        </div>
      </div>
    </div>
  )
}
