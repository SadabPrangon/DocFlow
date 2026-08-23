import { useState } from 'react';
import { MAX_LENGTH, MIN_LENGTH, dayCapacity, lengthLabel } from '../lib/consultation';

// How long the doctor spends with one patient, in minutes.
export default function ConsultationLength({ value, onChange, weekly }) {
  const [draft, setDraft] = useState('');
  const entered = Number(draft);
  const invalid = draft !== '' && !(Number.isInteger(entered) && entered >= MIN_LENGTH && entered <= MAX_LENGTH);
  const capacity = dayCapacity(weekly, value);

  const type = (event) => {
    setDraft(event.target.value);
    const minutes = Number(event.target.value);
    if (Number.isInteger(minutes) && minutes >= MIN_LENGTH && minutes <= MAX_LENGTH) onChange(minutes);
  };

  return <div className="cons">
    <div>
      <p className="cons-label">Consultation length</p>
      <p className={`cons-hint ${invalid ? 'bad' : ''}`}>
        {invalid
          ? `Enter a whole number of minutes between ${MIN_LENGTH} and ${MAX_LENGTH}.`
          : capacity && `A ${capacity.start}–${capacity.end} day fits ${capacity.fits} patients at ${lengthLabel(value)} each.`}
      </p>
    </div>
    <span className="cons-minutes">
      <input
        type="number"
        min={MIN_LENGTH}
        max={MAX_LENGTH}
        value={draft === '' ? value : draft}
        onChange={type}
        aria-label="Consultation length in minutes"
        aria-invalid={invalid}
      />
      min
    </span>
  </div>;
}
