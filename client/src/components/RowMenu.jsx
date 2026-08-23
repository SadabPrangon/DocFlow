import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// Row actions live behind a dots button. The panel is positioned against the
// viewport because the table scrolls, and an absolute panel would be clipped.
export default function RowMenu({ items, label = 'Row actions' }) {
  const [at, setAt] = useState(null);
  const [active, setActive] = useState(0);
  const button = useRef(null);
  const panel = useRef(null);
  const open = Boolean(at);

  const show = () => {
    const box = button.current.getBoundingClientRect();
    setActive(0);
    setAt({ top: box.bottom + 6, left: box.right });
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setAt(null);
    const away = (event) => {
      if (!panel.current?.contains(event.target) && !button.current?.contains(event.target)) setAt(null);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const run = (item) => { setAt(null); item.onClick?.(); };

  const onKeyDown = (event) => {
    if (!open) {
      if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      return show();
    }
    if (event.key === 'Escape' || event.key === 'Tab') setAt(null);
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => (index + 1) % items.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => (index - 1 + items.length) % items.length); }
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = items[active];
      if (item.to) panel.current?.querySelectorAll('.rowmenu-item')[active]?.click();
      else run(item);
    }
  };

  if (!items.length) return <span className="tbl-sub">No action left</span>;

  return <>
    <button
      type="button"
      ref={button}
      className={`rowmenu-button ${open ? 'open' : ''}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={label}
      onClick={() => (open ? setAt(null) : show())}
      onKeyDown={onKeyDown}
    >
      <MoreVertical size={15}/>
    </button>

    {open && <div className="rowmenu-list" role="menu" aria-label={label} ref={panel} style={{ top: at.top, left: at.left }} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const className = `rowmenu-item ${item.tone || ''} ${index === active ? 'active' : ''}`;
        const inside = <>{item.icon}{item.label}</>;
        return item.to
          ? <Link key={item.label} to={item.to} role="menuitem" className={className} onMouseEnter={() => setActive(index)}>{inside}</Link>
          : <button key={item.label} type="button" role="menuitem" className={className} onMouseEnter={() => setActive(index)} onClick={() => run(item)}>{inside}</button>;
      })}
    </div>}
  </>;
}
