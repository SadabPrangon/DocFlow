const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { scheduleSlots, today } = require('./availability');
const ollama = require('./ollama');

const LOOKAHEAD_DAYS = Number(process.env.AI_LOOKAHEAD_DAYS) || 7;
const MAX_DATES = 2;
const MAX_SLOTS = 3;
const EMERGENCY_REPLY = 'This sounds like a medical emergency. Please call your local emergency number or go to the nearest emergency department now. Do not wait for an appointment.';

// Deterministic and model-independent. A local 3B model must never be the only
// thing standing between a patient and "call emergency services".
// Patterns, not fixed phrases. Plain substrings missed "my face is drooping" and
// "my speech is slurred" because patients do not phrase symptoms in dictionary order.
const RED_FLAGS = [
  /unconscious|unresponsive|passed out|blacked out/i,
  /(not|cannot|can ?not|can't|trouble|difficulty|struggling to)\s*\w*\s*breath/i,
  /breathing\s*(problem|trouble|difficulty|issue)/i,
  /(severe|heavy|lot of|profuse|uncontrolled)\s*\w*\s*bleed/i,
  /bleeding\s*(heavily|badly|a lot|non ?stop)/i,
  /stroke/i,
  /face\b[^.]{0,25}\bdroop|droop[^.]{0,25}\bface/i,
  /slurr\w*[^.]{0,25}speech|speech[^.]{0,25}slurr/i,
  /suicid|kill myself|end my life|harm myself/i,
  /overdose|poison(ed|ing)/i,
  /seizure|convulsion|fitting|having a fit/i,
  /anaphyla|throat closing|swollen throat/i,
  /(severe|crushing|tight|worst)\s*\w*\s*chest\s*(pain|pressure|tightness)/i,
  /chest pain[^.]{0,40}(sweat|left arm|jaw|short of breath|nausea)/i,
];
const hasRedFlag = (text) => RED_FLAGS.some((pattern) => pattern.test(String(text)));

// The original keyword rules, kept as the offline fallback.
const RULES = [
  [['chest', 'heart', 'palpitation'], 'Cardiology'],
  [['skin', 'rash', 'acne'], 'Dermatology'],
  [['headache', 'dizzy', 'migraine', 'numb'], 'Neurology'],
  [['child', 'baby', 'infant'], 'Paediatrics'],
  [['tooth', 'teeth', 'dental', 'gum', 'cavity'], 'Dentist'],
];
// A deterministic gate in front of the model. "Ignore previous instructions..." was
// classified as a recommendation and pushed a neurologist at someone who had
// described nothing, so a card now requires an actual health signal in the message.
const SYMPTOM_HINTS = /(pain|ache|aching|hurt|sore|fever|temperature|rash|itch|cough|cold|flu|vomit|nausea|diarrh|swell|injur|wound|burn|bleed|breath|dizzy|faint|numb|fatigue|infection|allerg|cramp|stomach|tooth|teeth|gum|skin|heart|chest|head|migraine|eye|ear|throat|back|knee|joint|pregnan|period|anxiet|depress|sleep|pressure|sugar|diabet|sick|ill\b|symptom)/i;
const CARE_INTENT = /\b(need|want|looking for|book|see|consult|appointment with)\b[^.]{0,30}\b(doctor|specialist|physician|dentist|surgeon|\w+ologist)\b/i;
const describesHealthNeed = (message, catalogue) => SYMPTOM_HINTS.test(message)
  || CARE_INTENT.test(message)
  || catalogue.some((doctor) => new RegExp(`\\b${doctor.specialty}\\b`, 'i').test(message));

const ruleSpecialty = (text) => {
  const value = String(text).toLowerCase();
  const hit = RULES.find(([words]) => words.some((word) => value.includes(word)));
  return hit ? hit[1] : 'General Medicine';
};

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const weekdayName = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Working days, hours and days off, so the assistant can answer "which days does
// he sit?" or "what is his fee?" from real data instead of guessing.
const scheduleFacts = (doctor) => {
  const availability = doctor.availability || {};
  const weekly = (availability.weekly || []).filter((entry) => entry.enabled !== false && Number.isInteger(entry.day));
  const unavailableDates = availability.unavailableDates || [];
  if (!weekly.length) {
    return { workingDays: DAY_NAMES.slice(), offDays: [], hours: '9:00 AM to 4:00 PM', unavailableDates };
  }
  const workingDays = [...new Set(weekly.map((entry) => DAY_NAMES[entry.day]))];
  // 12-hour, because every other time the patient sees is, and because the guard
  // that checks quoted times parses this string.
  const to12 = (value) => {
    const [hour, minute] = String(value).split(':').map(Number);
    if (!Number.isFinite(hour)) return String(value);
    return `${hour % 12 || 12}:${String(minute || 0).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
  };
  return {
    workingDays,
    offDays: DAY_NAMES.filter((name) => !workingDays.includes(name)),
    hours: `${to12(weekly[0].start)} to ${to12(weekly[0].end)}`,
    unavailableDates,
  };
};

// One query covers the whole window; free slots are then computed in memory.
const buildCatalogue = async () => {
  const doctors = await User.find({ role: 'doctor', isActive: true }).sort({ name: 1 });
  if (!doctors.length) return [];
  const start = today();
  const dates = Array.from({ length: LOOKAHEAD_DAYS }, (_, index) => addDays(start, index));
  const taken = await Appointment.find({
    doctor: { $in: doctors.map((doctor) => doctor._id) },
    appointmentDate: { $in: dates },
    status: { $in: ['Pending', 'Approved'] },
  }).select('doctor appointmentDate appointmentTime');
  const busy = new Set(taken.map((item) => `${item.doctor}:${item.appointmentDate}:${item.appointmentTime}`));

  return doctors.map((doctor) => {
    const availability = [];
    for (const date of dates) {
      if (availability.length >= MAX_DATES) break;
      const free = scheduleSlots(doctor, date).filter((slot) => !busy.has(`${doctor._id}:${date}:${slot}`));
      if (free.length) availability.push({ date, day: weekdayName(date), times: free.slice(0, MAX_SLOTS) });
    }
    return {
      id: String(doctor._id),
      name: doctor.name,
      specialty: doctor.specialty || 'General Medicine',
      experience: doctor.experience || '',
      location: doctor.location || 'DocFlow Clinic',
      fee: doctor.fee || 0,
      ...scheduleFacts(doctor),
      availability,
    };
  });
};

const SYSTEM_PROMPT = [
  'You are the DocFlow care assistant for a clinic in Bangladesh.',
  'You do two things: route a patient to the right doctor from the DOCTORS list, and',
  'answer plain questions about those doctors (fee, working days, days off, timings, location).',
  '',
  'Decide the intent first:',
  '- "recommend" when the patient describes a symptom or asks who to see.',
  '- "unclear" when the message is a greeting, small talk, thanks, gibberish, or contains',
  '  no health problem at all. Never recommend a doctor for an "unclear" message.',
  '- "info" when they ask a question about a doctor already mentioned, such as the fee,',
  '  which days he sits, his day off, his timing or where he sits.',
  '',
  'Hard rules:',
  '- Every fact must come from the DOCTORS list. Never invent a doctor, fee, day, date or time.',
  '- Never diagnose, never state a disease as fact, never suggest medication or dosage.',
  '- Write "reply" as plain conversational sentences. No markdown, no bullet points, no JSON inside it.',
  '- For intent "info": answer the question directly and specifically in the reply, naming the',
  '  doctor and the exact fee, days or hours asked about. Leave "recommendations" empty.',
  '- For intent "recommend": do NOT put doctor names, dates, times or fees in the reply, because',
  '  the app shows those on cards below your text. Say which kind of doctor fits and why.',
  '- If a detail is not in the DOCTORS list, say plainly that you do not have it.',
  '- If the patient asks for a time the doctor does not offer, say clearly that it is not',
  '  available and give a real one. Never repeat back a time that is not in the list.',
  '- Keep the reply to at most two sentences.',
  '- If the problem sounds like an emergency, set "urgent" to true.',
  '',
  'Answer with JSON only, in exactly this shape:',
  '{"reply": string, "intent": "recommend" | "info" | "unclear", "specialty": string, "urgent": boolean,',
  ' "recommendations": [{"doctorId": string, "date": "YYYY-MM-DD", "time": string, "why": string}]}',
  'Include at most 2 recommendations, best match first, and only when intent is "recommend".',
].join('\n');

const buildPrompt = (catalogue, history, message, focus) => {
  const conversation = history.slice(-4).map((item) => `${item.role === 'user' ? 'Patient' : 'Assistant'}: ${item.text}`).join('\n');
  const context = focus
    ? `CURRENT DOCTOR UNDER DISCUSSION: ${focus.name} (${focus.specialty}). Stay with this doctor unless the patient describes a new and different problem.\n\n`
    : '';
  return `DOCTORS:\n${JSON.stringify(catalogue)}\n\n${context}${conversation ? `EARLIER:\n${conversation}\n\n` : ''}PATIENT SAYS:\n${message}`;
};

// The model's output is a suggestion, not an authority: every doctor id, date and
// time it returns is checked back against the catalogue before a patient sees it.
const groundRecommendations = (raw, catalogue) => {
  const byId = new Map(catalogue.map((doctor) => [doctor.id, doctor]));
  const grounded = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, 4) : []) {
    const doctor = byId.get(String((item && item.doctorId) || '').trim());
    if (!doctor || grounded.some((entry) => entry.doctorId === doctor.id)) continue;
    const day = doctor.availability.find((slot) => slot.date === (item && item.date)) || doctor.availability[0];
    if (!day) continue;
    const time = day.times.includes(item && item.time) ? item.time : day.times[0];
    grounded.push({
      doctorId: doctor.id, name: doctor.name, specialty: doctor.specialty,
      location: doctor.location, fee: doctor.fee,
      date: day.date, day: day.day, time,
      why: String((item && item.why) || '').trim().slice(0, 160),
    });
    if (grounded.length === 2) break;
  }
  return grounded;
};

// Strict on purpose. Falling back to "any doctor with a free slot" once offered a
// neurologist to someone who had only said hello, and would offer one for chest
// pain if no cardiologist were free. No match means no card.
// Grounding the cards is not enough: the model can still assert a time in prose that
// nobody offers ("you can book tomorrow at 8:00 AM" for a doctor who starts at 9).
const TIME_TOKEN = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi;
const normalizeTime = (hour, minute, meridiem) => `${Number(hour)}:${minute || '00'} ${meridiem.toUpperCase()}`;

const allowedTimes = (doctors) => {
  const allowed = new Set();
  for (const doctor of doctors) {
    (doctor.availability || []).forEach((entry) => entry.times.forEach((time) => allowed.add(time.toUpperCase())));
    String(doctor.hours || '').split(' to ').forEach((part) => {
      const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(part.trim());
      if (match) allowed.add(normalizeTime(match[1], match[2], match[3]));
    });
  }
  return allowed;
};

// The same problem as invented times, one channel over: "he is available on Friday"
// for a doctor who works Sunday to Thursday.
const DAY_CLAIMS = [/available\s*(?:on|from)?\s*([^.]*)/gi, /open slot is\s*([^.,]*)/gi, /sits?\s*on\s*([^.]*)/gi, /works?\s*on\s*([^.]*)/gi];
const daysClaimedAvailable = (text) => {
  const found = new Set();
  for (const pattern of DAY_CLAIMS) {
    for (const match of String(text).matchAll(pattern)) {
      DAY_NAMES.forEach((day) => { if (new RegExp(`\\b${day}\\b`, 'i').test(match[1])) found.add(day); });
    }
  }
  return [...found];
};

const statesUnrealDay = (reply, doctors) => {
  if (doctors.length !== 1) return false;
  const [doctor] = doctors;
  return daysClaimedAvailable(reply).some((day) => !doctor.workingDays.includes(day));
};

const scheduleSentence = (doctor) => {
  const off = doctor.offDays.length ? ` He is off on ${doctor.offDays.join(', ')}.` : '';
  const next = (doctor.availability || [])[0];
  const slot = next ? ` The next open slot is ${next.day}, ${next.date} at ${next.times[0]}.` : '';
  return `${doctor.name} works ${doctor.workingDays.join(', ')}, ${doctor.hours}.${off}${slot}`;
};

const statesUnrealTime = (reply, doctors) => {
  if (!doctors.length) return false;
  const allowed = allowedTimes(doctors);
  return [...String(reply).matchAll(TIME_TOKEN)]
    .map((match) => normalizeTime(match[1], match[2], match[3]))
    .some((time) => !allowed.has(time));
};

const doctorsNamedIn = (reply, catalogue) => {
  const lower = String(reply).toLowerCase();
  return catalogue.filter((doctor) => lower.includes(doctor.name.toLowerCase()));
};

// Who the conversation is actually about. Without this, a follow-up like "what
// should I do then?" gets answered about whichever doctor happens to sort first.
const focusDoctorFrom = (history, catalogue) => {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const named = doctorsNamedIn(history[index].text, catalogue);
    if (named.length) return named[0];
  }
  return null;
};

const cardFor = (doctor) => {
  const day = (doctor.availability || [])[0];
  if (!day) return null;
  return {
    doctorId: doctor.id, name: doctor.name, specialty: doctor.specialty,
    location: doctor.location, fee: doctor.fee,
    date: day.date, day: day.day, time: day.times[0],
    why: `Next open slot ${day.day} at ${day.times[0]}.`,
  };
};

// Nothing was routed, so the reply must not tout doctors either. Left to itself the
// model sometimes answers a symptom-free message by listing the entire roster, which
// is the card bug wearing prose.
const noRouting = (reply, catalogue) => ({
  reply: doctorsNamedIn(reply, catalogue).length
    ? 'Tell me what symptoms you are having and I will suggest the right doctor.'
    : reply,
  specialty: '',
  recommendations: [],
  urgent: false,
});

const pickBySpecialty = (catalogue, specialty) => {
  const wanted = String(specialty || '').trim().toLowerCase();
  if (!wanted) return [];
  const pool = catalogue.filter((doctor) => doctor.specialty.toLowerCase() === wanted && doctor.availability.length);
  return pool.slice(0, 2).map((doctor) => {
    const day = doctor.availability[0];
    return {
      doctorId: doctor.id, name: doctor.name, specialty: doctor.specialty,
      location: doctor.location, fee: doctor.fee,
      date: day.date, day: day.day, time: day.times[0],
      why: `Available ${day.day} at ${day.times[0]}.`,
    };
  });
};

const fallbackAnswer = (catalogue, message) => {
  const specialty = ruleSpecialty(message);
  const recommendations = pickBySpecialty(catalogue, specialty);
  const reply = recommendations.length
    ? `Based on what you described, ${specialty} is the right place to start. Here is who is free soonest.`
    : `Based on what you described, ${specialty} is the right place to start, but nobody has an open slot in the next ${LOOKAHEAD_DAYS} days.`;
  return { reply, specialty, recommendations, source: 'rules' };
};

const answer = async ({ message, history = [] }) => {
  const urgent = hasRedFlag(message);
  // Emergencies never reach the model: a routine booking is the wrong answer, and a
  // 3B model cannot be relied on to refuse to give one.
  if (urgent) return { reply: EMERGENCY_REPLY, specialty: '', recommendations: [], urgent: true, source: 'safety' };
  const catalogue = await buildCatalogue();
  if (!catalogue.length) {
    return { reply: 'No doctors are accepting appointments right now. Please contact reception.', specialty: '', recommendations: [], urgent, source: 'rules' };
  }
  if (await ollama.isAvailable()) {
    try {
      const focus = focusDoctorFrom(history, catalogue);
      const raw = await ollama.chatJson(SYSTEM_PROMPT, buildPrompt(catalogue, history, message, focus));
      const reply = String((raw && raw.reply) || '').trim().slice(0, 400);
      if (reply) {
        const specialty = String((raw && raw.specialty) || '').trim().slice(0, 60);
        const keyword = ruleSpecialty(message);
        // Answering a question about a doctor already discussed: the reply carries the
        // facts, so no cards are attached and the keyword router stays out of the way.
        // Greetings, thanks and nonsense: answer, but never push a specialist at
        // someone who has not described a problem.
        if ((raw && raw.intent) === 'unclear') {
          return { ...noRouting(reply, catalogue), source: 'ollama-unclear' };
        }
        if ((raw && raw.intent) === 'info') {
          const named = doctorsNamedIn(reply, catalogue);
          // An answer about a doctor the patient was not asking about is wrong however
          // accurate it is, so the doctor under discussion wins.
          if (focus && named.length && !named.some((doctor) => doctor.id === focus.id)) {
            return { reply: scheduleSentence(focus), specialty: '', recommendations: [], urgent: false, source: 'focus-corrected' };
          }
          // Prefer the doctor being discussed over whoever the model happened to name,
          // and never fall back to an arbitrary entry in the catalogue.
          const scope = named.length ? named : (focus ? [focus] : catalogue);
          if (statesUnrealDay(reply, scope)) {
            return { reply: scheduleSentence(scope[0]), specialty: '', recommendations: [], urgent: false, source: 'day-corrected' };
          }
          if (statesUnrealTime(reply, scope)) {
            const doctor = focus && !named.length ? focus : scope[0];
            const next = doctor.availability[0];
            const correction = next
              ? `That time is not in the schedule. ${doctor.name} works ${doctor.hours}, and the next open slot is ${next.day}, ${next.date} at ${next.times[0]}.`
              : `That time is not in the schedule. ${doctor.name} works ${doctor.hours}.`;
            return { reply: correction, specialty: '', recommendations: [], urgent: false, source: 'time-corrected' };
          }
          return { reply, specialty: '', recommendations: [], urgent: false, source: 'ollama-info' };
        }
        // No doctor under discussion and no health signal in the message: answer, but
        // do not put a specialist in front of someone who has not asked for one.
        if (!focus && !describesHealthNeed(message, catalogue)) {
          return { ...noRouting(reply, catalogue), source: 'no-health-signal' };
        }
        // Follow-ups such as "so what should I do?" carry no new symptom. Drifting to a
        // different specialist there is how a dental question ended up recommending a
        // neurologist, so the doctor under discussion is kept.
        if (focus && keyword === 'General Medicine' && specialty.toLowerCase() !== focus.specialty.toLowerCase()) {
          const card = cardFor(focus);
          return {
            reply: card
              ? `${focus.name} works ${focus.hours}. The next open slot is ${card.day}, ${card.date} at ${card.time}.`
              : `${focus.name} works ${focus.hours}, but has no open slot in the next ${LOOKAHEAD_DAYS} days.`,
            specialty: focus.specialty,
            recommendations: card ? [card] : [],
            urgent: false,
            source: 'focus-kept',
          };
        }
        // A small local model mis-routes often enough to matter. Where the keyword
        // rules fire confidently and disagree, they win, and the deterministic reply
        // is used so the wording cannot contradict the cards beneath it.
        if (keyword !== 'General Medicine' && specialty.toLowerCase() !== keyword.toLowerCase()) {
          return { ...fallbackAnswer(catalogue, message), urgent: false, source: 'rules-corrected' };
        }
        // Without a specialty the model has not actually routed anyone yet (a greeting,
        // a follow-up question), so nothing should be recommended.
        const grounded = specialty
          ? groundRecommendations(raw && raw.recommendations, catalogue)
            .filter((item) => item.specialty.toLowerCase() === specialty.toLowerCase())
          : [];
        const recommendations = grounded.length ? grounded : pickBySpecialty(catalogue, specialty);
        // Last guard against text and cards disagreeing: if the reply names a doctor
        // who is not on a card, the patient would be told to see someone the app is
        // not offering, so the deterministic wording is used instead.
        const lower = reply.toLowerCase();
        const namesOther = catalogue.some((doctor) =>
          lower.includes(doctor.name.toLowerCase()) && !recommendations.some((item) => item.doctorId === doctor.id));
        if (namesOther) return { ...fallbackAnswer(catalogue, message), urgent: false, source: 'rules-corrected' };
        // Same check for times: a reply offering a slot that does not exist is worse
        // than a blunt one, because the patient will try to book it.
        const scope = catalogue.filter((doctor) => recommendations.some((item) => item.doctorId === doctor.id));
        if (statesUnrealDay(reply, scope)) {
          return { reply: scheduleSentence(scope[0]), specialty, recommendations, urgent: false, source: 'day-corrected' };
        }
        if (statesUnrealTime(reply, scope)) {
          const first = recommendations[0];
          return {
            reply: `That time is not in the schedule. The earliest open slot is ${first.day}, ${first.date} at ${first.time}.`,
            specialty, recommendations, urgent: false, source: 'time-corrected',
          };
        }
        return {
          reply,
          specialty,
          recommendations,
          urgent: Boolean(raw && raw.urgent === true),
          source: 'ollama',
        };
      }
    } catch (error) {
      console.error(JSON.stringify({ level: 'warn', event: 'care_assistant_model_failed', message: error.message }));
    }
  }
  return { ...fallbackAnswer(catalogue, message), urgent };
};

module.exports = { answer, buildCatalogue, hasRedFlag, ruleSpecialty, groundRecommendations, fallbackAnswer };
