const Appointment = require('../models/Appointment');

const LEGACY_SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const validDate = (value) => {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const toMinutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const displayTime = (minutes) => {
  const hours = Math.floor(minutes / 60); const mins = minutes % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM'; const hour = hours % 12 || 12;
  return `${hour}:${String(mins).padStart(2, '0')} ${suffix}`;
};
const scheduleSlots = (doctor, date) => {
  const override = doctor.availability?.overrides?.find((item) => item.date === date);
  if (override && !override.enabled) return [];
  if (doctor.availability.unavailableDates?.includes(date)) return [];
  if (!doctor.availability?.weekly?.length && !override) return LEGACY_SLOTS;
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const schedule = override || doctor.availability.weekly.find((item) => item.day === day);
  if (!schedule?.enabled || !TIME_PATTERN.test(schedule.start) || !TIME_PATTERN.test(schedule.end)) return [];
  const duration = Number(doctor.availability.slotDuration) || 60;
  const slots = [];
  for (let time = toMinutes(schedule.start); time + duration <= toMinutes(schedule.end); time += duration) {
    const overlapsBreak = (schedule.breaks || []).some((item) => time < toMinutes(item.end) && time + duration > toMinutes(item.start));
    if (!overlapsBreak) slots.push(displayTime(time));
  }
  return slots;
};
const appointmentDateTime = (date, display) => {
  const match = /^(\d{1,2}):(\d{2})\s(AM|PM)$/.exec(String(display));
  if (!validDate(date) || !match) return null;
  let hour = Number(match[1]) % 12; if (match[3] === 'PM') hour += 12;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 6, Number(match[2])));
};
const availableSlots = async (doctor, date, excludeId = null) => {
  const slots = scheduleSlots(doctor, date);
  const filter = { doctor: doctor._id, appointmentDate: date, status: { $in: ['Pending', 'Approved'] } };
  if (excludeId) filter._id = { $ne: excludeId };
  const booked = await Appointment.distinct('appointmentTime', filter);
  return slots.filter((slot) => !booked.includes(slot));
};

// The patient does not choose a time. The serial is their place in the day's
// grid, and the time follows from it: the doctor's start plus one consultation
// length per patient ahead of them.
const nextAssignment = async (doctor, date, excludeId = null) => {
  const slots = scheduleSlots(doctor, date);
  if (!slots.length) return null;
  const filter = { doctor: doctor._id, appointmentDate: date, status: { $in: ['Pending', 'Approved'] } };
  if (excludeId) filter._id = { $ne: excludeId };
  const booked = await Appointment.distinct('appointmentTime', filter);
  // The first free place, so a cancellation ahead of you moves you up rather
  // than leaving a hole in the day.
  const index = slots.findIndex((slot) => !booked.includes(slot));
  return index < 0 ? null : { serial: index + 1, time: slots[index], of: slots.length };
};

module.exports = { LEGACY_SLOTS, validDate, today, scheduleSlots, availableSlots, nextAssignment, appointmentDateTime };
