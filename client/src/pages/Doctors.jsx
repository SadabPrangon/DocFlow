import { Calendar, MapPin, Search, Stethoscope } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Dropdown from '../components/Dropdown';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

const years = (value) => Number(String(value || '').match(/\d+/)?.[0] || 0);
const SORTS = {
  name: ['Name A to Z', (a, b) => a.name.localeCompare(b.name)],
  feeLow: ['Fee, low to high', (a, b) => (a.fee || 0) - (b.fee || 0)],
  feeHigh: ['Fee, high to low', (a, b) => (b.fee || 0) - (a.fee || 0)],
  experience: ['Most experienced', (a, b) => years(b.experience) - years(a.experience)],
};

export default function Doctors() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [sort, setSort] = useState('name');

  useEffect(() => {
    api.get('/users/doctors').then((r) => setDoctors(r.data.doctors || [])).finally(() => setLoading(false));
  }, []);

  const specialties = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialty || 'General Medicine'))].sort(),
    [doctors],
  );

  // The endpoint returns every active doctor at one clinic, so filtering here
  // avoids a round trip per keystroke.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return doctors
      .filter((doctor) => !specialty || (doctor.specialty || 'General Medicine') === specialty)
      .filter((doctor) => !needle || [doctor.name, doctor.specialty, doctor.location, doctor.experience]
        .some((field) => String(field || '').toLowerCase().includes(needle)))
      .sort(SORTS[sort][1]);
  }, [doctors, query, specialty, sort]);

  const filtering = Boolean(query.trim() || specialty);

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Find Doctors" backTo="/dashboard"/>
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="tbar">
        <span className="tbar-search">
          <Search size={14}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, specialty or place" aria-label="Search doctors"/>
        </span>
        <Dropdown
          label="Filter by specialty"
          value={specialty}
          onChange={setSpecialty}
          options={[{ value: '', label: 'All specialties' }, ...specialties.map((item) => ({ value: item, label: item }))]}
        />
        <Dropdown
          label="Sort doctors"
          value={sort}
          onChange={setSort}
          options={Object.entries(SORTS).map(([key, [label]]) => ({ value: key, label }))}
        />
        {filtering && <button type="button" className="tbar-clear" onClick={() => { setQuery(''); setSpecialty(''); }}>Clear</button>}
        <span className="tbar-count">{loading ? 'Loading…' : `${visible.length} of ${doctors.length}`}</span>
      </div>

      {!loading && !visible.length && <p className="tbar-empty">No doctor matches that. Try a different search or specialty.</p>}

      <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((doctor) => <article key={doctor.id} className="rounded-3xl bg-white p-6 shadow">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600"><Stethoscope size={30}/></div>
          <h2 className="mt-5 text-xl font-bold">{doctor.name}</h2>
          <p className="font-semibold text-blue-600">{doctor.specialty || 'General Medicine'}</p>
          <p className="mt-2 text-sm text-slate-500">{doctor.experience || 'Experience not specified'}</p>
          <p className="mt-4 flex gap-2 text-sm text-slate-600"><MapPin size={17}/>{doctor.location || 'DocFlow Clinic'}</p>
          <div className="mt-6 flex items-end justify-between">
            <div><p className="text-sm text-slate-500">Fee</p><b className="text-xl">৳{doctor.fee || 0}</b></div>
            <Link to={`/book-appointment/${doctor.id}`} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"><Calendar size={18}/>Book</Link>
          </div>
        </article>)}
      </div>
    </main>
  </div>;
}
