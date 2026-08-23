import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// A listbox rather than a native select, because the browser draws that popup
// itself and it cannot be made to match the rest of the app.
export default function Dropdown({ value, onChange, options, label }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const current = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (!wrap.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const choose = (next) => { onChange(next); setOpen(false); wrap.current?.querySelector('button')?.focus(); };

  const onKeyDown = (event) => {
    if (!open && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setActive(Math.max(options.findIndex((option) => option.value === value), 0));
      return setOpen(true);
    }
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => (index + 1) % options.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => (index - 1 + options.length) % options.length); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(options[active].value); }
    else if (event.key === 'Tab') setOpen(false);
  };

  return <div className="dd" ref={wrap}>
    <button
      type="button"
      className={`dd-button ${open ? 'open' : ''}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={label}
      onClick={() => { setActive(Math.max(options.findIndex((option) => option.value === value), 0)); setOpen((was) => !was); }}
      onKeyDown={onKeyDown}
    >
      <span className="dd-value">{current?.label}</span>
      <ChevronDown size={14} className={`dd-chevron ${open ? 'up' : ''}`}/>
    </button>

    {open && <ul className="dd-list" role="listbox" aria-label={label}>
      {options.map((option, index) => <li
        key={option.value}
        role="option"
        aria-selected={option.value === value}
        className={`dd-option ${option.value === value ? 'selected' : ''} ${index === active ? 'active' : ''}`}
        onMouseEnter={() => setActive(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(option.value)}
      >
        <span>{option.label}</span>
        {option.value === value && <Check size={13}/>}
      </li>)}
    </ul>}
  </div>;
}
