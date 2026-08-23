import { useState } from 'react';
import { MAX_LENGTH, MIN_LENGTH, dayCapacity, lengthLabel } from '../lib/consultation';

const usable = (draft) => {
  const minutes = Number(draft);
  return draft !== '' && Number.isInteger(minutes) && minutes >= MIN_LENGTH && minutes <= MAX_LENGTH;
};

// How long the doctor spends with one patient, in minutes.
export default function ConsultationLength({ value, onChange, weekly }) {
  // null means the doctor has not typed yet, so the field shows the saved
  // length. An empty string is a field they cleared on purpose, which has to
  // stay empty for them to type the next number into.
  const [draft, setDraft] = useState(null);
  const emptied = draft === '';
  const invalid = draft !== null && !emptied && !usable(draft);
  // The typed number drives the sentence straight away, but it is only settled
  // on the way out, so the 9 in a half-typed 90 never becomes the length.
  const previewed = draft !== null && usable(draft) ? Number(draft) : value;
  const capacity = dayCapacity(weekly, previewed);
  const range = `a whole number of minutes between ${MIN_LENGTH} and ${MAX_LENGTH}`;

  const settle = () => {
    if (draft === null) return;
    if (usable(draft) && Number(draft) !== value) onChange(Number(draft));
    setDraft(null);
  };

  return <div className="cons">
    <div>
      <p className="cons-label">Consultation length</p>
      <p className={`cons-hint ${invalid ? 'bad' : ''}`}>
        {invalid && `Enter ${range}.`}
        {emptied && `Type ${range}.`}
        {!invalid && !emptied && capacity && `A ${capacity.start}–${capacity.end} day fits ${capacity.fits} patients at ${lengthLabel(previewed)} each.`}
      </p>
    </div>
    <span className="cons-minutes">
      <input
        type="number"
        min={MIN_LENGTH}
        max={MAX_LENGTH}
        value={draft === null ? value : draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={settle}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); settle(); } }}
        aria-label="Consultation length in minutes"
        aria-invalid={invalid}
      />
      min
    </span>
  </div>;
}
