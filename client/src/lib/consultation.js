// How long the doctor spends with one patient. The server accepts 15 to 240
// minutes; these are the lengths a clinic actually books in.
export const CONSULTATION_LENGTHS = [15, 20, 30, 45, 60, 90, 120];

export const lengthLabel = (minutes) => {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const head = `${hours} hour${hours === 1 ? '' : 's'}`;
  return rest ? `${head} ${rest} min` : head;
};

export const lengthOptions = CONSULTATION_LENGTHS.map((minutes) => ({ value: String(minutes), label: lengthLabel(minutes) }));

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
