import { useState, useRef, useEffect } from 'react';

export default function SearchSelect({ label, options, value, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div className="search-select" ref={ref}>
      <label className="search-select-label">{label}</label>
      <div className="search-select-input-wrap">
        <input
          className="search-select-input"
          type="text"
          placeholder={value || placeholder || 'All'}
          value={open ? query : ''}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => setQuery(e.target.value)}
        />
        {value && (
          <button
            className="search-select-clear"
            onClick={() => { onChange(''); setQuery(''); setOpen(false); }}
          >
            x
          </button>
        )}
      </div>
      {open && (
        <div className="search-select-dropdown">
          {filtered.length === 0 && (
            <div className="search-select-empty">No matches</div>
          )}
          {filtered.slice(0, 30).map((opt) => (
            <button
              key={opt}
              className={`search-select-option ${opt === value ? 'selected' : ''}`}
              onClick={() => { onChange(opt); setQuery(''); setOpen(false); }}
            >
              {opt}
            </button>
          ))}
          {filtered.length > 30 && (
            <div className="search-select-empty">
              +{filtered.length - 30} more — type to narrow
            </div>
          )}
        </div>
      )}
    </div>
  );
}
