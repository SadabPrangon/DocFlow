// How long the doctor spends with one patient, in whole minutes.
export const MIN_LENGTH = 1;
export const MAX_LENGTH = 59;

export const lengthLabel = (minutes) => {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const head = `${hours} hour${hours === 1 ? '' : 's'}`;
  return rest ? `${head} ${rest} min` : head;
};

const toMinutes = (value) => { const [hour, minute] = String(value).split(':').map(Number); return (hour * 60) + minute; };

// What that length means in practice, so the doctor sees the consequence of the
// choice rather than having to work it out.
export const dayCapacity = (weekly = [], slotDuration = 60) => {
  const day = weekly.find((item) => item.enabled);
  if (!day || !slotDuration) return null;
  const span = toMinutes(day.end) - toMinutes(day.start);
  if (span <= 0) return null;
  return { start: day.start, end: day.end, fits: Math.floor(span / slotDuration) };
};
