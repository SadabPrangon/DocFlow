import { useState } from 'react';
import Dropdown from './Dropdown';
import { CONSULTATION_LENGTHS, MAX_LENGTH, MIN_LENGTH, dayCapacity, lengthLabel } from '../lib/consultation';

// How long the doctor spends with one patient. The common lengths are one pick
// away; anything else is typed in minutes.
export default function ConsultationLength({ value, onChange, weekly }) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  // A length the doctor typed earlier arrives from the server as a plain number,
  // so the field opens itself rather than showing a preset that is not the truth.
  const custom = typing || !CONSULTATION_LENGTHS.includes(value);
  const entered = Number(draft);
  const invalid = draft !== '' && !(Number.isInteger(entered) && entered >= MIN_LENGTH && entered <= MAX_LENGTH);
  const capacity = dayCapacity(weekly, value);

  const pick = (next) => {
    if (next === 'custom') return setTyping(true);
    setTyping(false);
    setDraft('');
    onChange(Number(next));
  };

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
    <div className="cons-controls">
      <Dropdown
        label="Consultation length"
        value={custom ? 'custom' : String(value)}
        onChange={pick}
        options={[
          ...CONSULTATION_LENGTHS.map((minutes) => ({ value: String(minutes), label: lengthLabel(minutes) })),
          { value: 'custom', label: 'Custom length' },
        ]}
      />
      {custom && <span className="cons-minutes">
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
      </span>}
    </div>
  </div>;
}
