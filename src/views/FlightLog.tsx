import { useMemo, useState } from 'react';
import { EmptyState } from '../components/primitives';
import { fmtDate, fmtDuration, fmtNum, fmtTime } from '../lib/format';
import type { AppData } from '../lib/useData';
import type { HashRoute } from '../lib/useHashRoute';
import type { DerivedFlight } from '../shared/types';

interface Props {
  data: AppData;
  route: HashRoute;
  navigate: (path: string, query?: URLSearchParams) => void;
}

type SortCol = 'date' | 'site' | 'dur' | 'lift' | 'alt' | 'glider';
type MultiOption = { value: string; label: string };

const SORT_VALUE: Record<SortCol, (f: DerivedFlight) => string | number> = {
  date: (f) => f.flight.id,
  site: (f) => f.site?.name ?? 'zzz',
  dur: (f) => f.flight.durationMinutes,
  lift: (f) => liftLabel(f),
  alt: (f) => f.flight.maxAltitudeAmsl,
  glider: (f) => f.gear?.name ?? 'zzz',
};

export function FlightLog({ data, route, navigate }: Props) {
  const { derived } = data;
  const q = route.query;
  const selectedLifts = q.getAll('lift');
  const selectedSites = q.getAll('site');
  const selectedGliders = q.getAll('glider');
  const knownSites = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of derived) {
      if (f.site?.id && f.site.name) map.set(f.site.id, f.site.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [derived]);
  const knownGear = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of derived) {
      if (f.gear?.id && f.gear.name) map.set(f.gear.id, f.gear.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [derived]);

  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({
    col: 'date',
    dir: -1,
  });
  const [expanded, setExpanded] = useState<string | null>(q.get('flight'));

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(q);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('flight');
    navigate('/flights', next);
  };

  const setMultiFilter = (key: string, values: string[]) => {
    const next = new URLSearchParams(q);
    next.delete(key);
    for (const v of values) next.append(key, v);
    next.delete('flight');
    navigate('/flights', next);
  };

  const filtered = useMemo(() => {
    const lifts = q.getAll('lift');
    const sites = q.getAll('site');
    const gliders = q.getAll('glider');
    const from = q.get('from');
    const to = q.get('to');
    const durMin = q.get('durMin');
    const durMax = q.get('durMax');
    const metadata = q.get('metadata');

    return derived.filter((f) => {
      if (lifts.length > 0 && !lifts.includes(liftLabel(f))) return false;
      if (sites.length > 0) {
        const id = f.site?.id ?? '__unmatched__';
        if (!sites.includes(id)) return false;
      }
      if (gliders.length > 0 && !gliders.includes(f.gear?.id ?? '__none__')) return false;
      if (from && f.flight.date < from) return false;
      if (to && f.flight.date > to) return false;
      if (durMin && f.flight.durationMinutes < Number(durMin)) return false;
      if (durMax && f.flight.durationMinutes > Number(durMax)) return false;
      if (metadata === 'complete' && !f.metadataComplete) return false;
      if (metadata === 'incomplete' && f.metadataComplete) return false;
      return true;
    });
  }, [derived, q]);

  const sorted = useMemo(() => {
    const pick = SORT_VALUE[sort.col];
    return [...filtered].sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [filtered, sort]);

  const toggleSort = (col: SortCol) =>
    setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: 1 }));

  const activeChips: { key: string; value: string; label: string }[] = [];
  for (const [key, value] of q.entries()) {
    if (key === 'flight') continue;
    let label = `${key}: ${value}`;
    if (key === 'site') {
      const s = knownSites.find(([id]) => id === value)?.[1];
      label = `Site: ${s || (value === '__unmatched__' ? 'Unknown' : value)}`;
    } else if (key === 'glider') {
      const g = knownGear.find(([id]) => id === value)?.[1];
      label = `Glider: ${g || value}`;
    } else if (key === 'lift') label = `Lift: ${value}`;
    else if (key === 'metadata') label = `Metadata: ${value}`;
    else if (key === 'from') label = `From ${value}`;
    else if (key === 'to') label = `To ${value}`;
    else if (key === 'durMin') label = `≥ ${value} min`;
    else if (key === 'durMax') label = `≤ ${value} min`;
    activeChips.push({ key, value, label });
  }

  const removeChip = (key: string, value: string) => {
    if (key === 'site' || key === 'glider' || key === 'lift') {
      const remaining = q.getAll(key).filter((v) => v !== value);
      setMultiFilter(key, remaining);
      return;
    }
    setFilter(key, null);
  };

  const sortHead = (col: SortCol, label: string, extraClass = '') => (
    <th
      className={`${extraClass} ${sort.col === col ? 'sorted' : ''}`}
      onClick={() => toggleSort(col)}
    >
      {label}
      {sort.col === col ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <>
      <div>
        <div className="page-kicker">
          {sorted.length} of {derived.length} flights
        </div>
        <h1 className="page-title">Flight log</h1>
      </div>

      <div className="filter-bar">
        <MultiSelectFilter
          label="Lift"
          selected={selectedLifts}
          onChange={(values) => setMultiFilter('lift', values)}
          options={[
            { value: 'Thermal', label: 'Thermal' },
            { value: 'Soaring', label: 'Soaring' },
            { value: 'Towing', label: 'Towing' },
            { value: 'Sledder', label: 'Sledder' },
            { value: 'Unknown', label: 'Unknown' },
          ]}
        />

        <MultiSelectFilter
          label="Site"
          selected={selectedSites}
          onChange={(values) => setMultiFilter('site', values)}
          options={[
            ...knownSites.map(([id, name]) => ({ value: id, label: name })),
            { value: '__unmatched__', label: 'Unknown site' },
          ]}
        />

        <MultiSelectFilter
          label="Glider"
          selected={selectedGliders}
          onChange={(values) => setMultiFilter('glider', values)}
          options={knownGear.map(([id, name]) => ({ value: id, label: name }))}
        />

        <select
          value={q.get('metadata') ?? ''}
          onChange={(e) => setFilter('metadata', e.target.value || null)}
          aria-label="Metadata completeness"
        >
          <option value="">All metadata</option>
          <option value="complete">Complete</option>
          <option value="incomplete">Incomplete</option>
        </select>

        <input
          type="date"
          value={q.get('from') ?? ''}
          onChange={(e) => setFilter('from', e.target.value || null)}
          aria-label="From date"
        />
        <input
          type="date"
          value={q.get('to') ?? ''}
          onChange={(e) => setFilter('to', e.target.value || null)}
          aria-label="To date"
        />
        <input
          type="number"
          min="0"
          placeholder="min ≥"
          value={q.get('durMin') ?? ''}
          onChange={(e) => setFilter('durMin', e.target.value || null)}
          aria-label="Minimum duration minutes"
          style={{ width: 90 }}
        />
        <input
          type="number"
          min="0"
          placeholder="min ≤"
          value={q.get('durMax') ?? ''}
          onChange={(e) => setFilter('durMax', e.target.value || null)}
          aria-label="Maximum duration minutes"
          style={{ width: 90 }}
        />
      </div>

      {activeChips.length > 0 && (
        <div className="chips">
          {activeChips.map((c) => (
            <button
              key={`${c.key}:${c.value}`}
              className="chip"
              onClick={() => removeChip(c.key, c.value)}
            >
              {c.label} ✕
            </button>
          ))}
        </div>
      )}

      <span className="result-count">{sorted.length} flights</span>
      <FilterStats flights={sorted} />

      {sorted.length === 0 ? (
        <EmptyState message="No flights match these filters." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {sortHead('date', 'Date')}
                <th className="hide-mobile">Takeoff</th>
                <th className="hide-mobile">Landing</th>
                {sortHead('site', 'Site')}
                {sortHead('dur', 'Duration', 'col-num')}
                {sortHead('lift', 'Lift', 'hide-mobile')}
                {sortHead('alt', 'Max Alt', 'hide-mobile col-num')}
                {sortHead('glider', 'Glider', 'hide-mobile')}
                <th className="hide-mobile" aria-label="Metadata complete">
                  ⚠
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => {
                const open = expanded === f.flight.id;
                return (
                  <FlightRow
                    key={f.flight.id}
                    f={f}
                    open={open}
                    onToggle={() => setExpanded(open ? null : f.flight.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FlightRow({
  f,
  open,
  onToggle,
}: {
  f: DerivedFlight;
  open: boolean;
  onToggle: () => void;
}) {
  const fl = f.flight;
  return (
    <>
      <tr className="flight-row" onClick={onToggle}>
        <td>
          {fmtDate(fl.takeoffTime)}
        </td>
        <td className="hide-mobile mono">{fmtTime(fl.takeoffTime)}</td>
        <td className="hide-mobile mono">{fmtTime(fl.landingTime)}</td>
        <td>{f.site?.name || 'Unknown'}</td>
        <td className="col-num">{fmtDuration(fl.durationMinutes)}</td>
        <td className="hide-mobile">{liftLabel(f)}</td>
        <td className="hide-mobile col-num">{fmtNum(fl.maxAltitudeAmsl, 0)} m</td>
        <td className="hide-mobile">{f.gear?.name || '—'}</td>
        <td className="hide-mobile">
          {!f.metadataComplete && (
            <span
              className="warn-flag"
              title={`Missing: ${f.missing.join(', ')}`}
            >
              ⚠
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={9}>
            <div className="detail-grid">
              <Detail label="Takeoff Time" value={fmtTime(fl.takeoffTime)} />
              <Detail label="Landing Time" value={fmtTime(fl.landingTime)} />
              <Detail label="Duration" value={fmtDuration(fl.durationMinutes)} />
              <Detail label="Max Altitude" value={`${fmtNum(fl.maxAltitudeAmsl, 0)} m`} />
              <Detail label="Max Climb Rate" value={`${fmtNum(fl.maxClimbRate, 1)} m/s`} />
              <Detail label="Max Sink Rate" value={`${fmtNum(fl.maxSinkRate, 1)} m/s`} />
              <Detail label="Radial Distance" value={`${fmtNum(fl.radialDistanceKm, 1)} km`} />
              <Detail label="XC Distance" value={`${fmtNum(fl.longestXcKm, 1)} km`} />
            </div>
            <div className="detail-meta">
              <span className="muted">Lift profile: {liftLabel(f)}</span>
              <span className="muted">Site: {f.site?.name || 'Unmatched'}</span>
              <span className="muted">Gear: {f.gear?.name || 'Not matched'}</span>
              <span className="muted">
                Raw glider hint: <span className="mono">{fl.gliderHint || '—'}</span>
              </span>
              <span className="muted">
                Source log file: <span className="mono">{fl.sourceFileName || '—'}</span>
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function liftLabel(f: DerivedFlight): string {
  if (f.isSledder) return 'Sledder';
  if (f.liftTowing) return 'Towing';
  if (f.liftThermal) return 'Thermal';
  if (f.liftSoaring) return 'Soaring';
  return 'Unknown';
}

function FilterStats({ flights }: { flights: DerivedFlight[] }) {
  const totalMinutes = flights.reduce((a, f) => a + f.flight.durationMinutes, 0);
  const thermalMinutes = flights
    .filter((f) => f.liftThermal)
    .reduce((a, f) => a + f.flight.durationMinutes, 0);
  const soaringMinutes = flights
    .filter((f) => f.liftSoaring)
    .reduce((a, f) => a + f.flight.durationMinutes, 0);
  const avgMinutes = flights.length ? totalMinutes / flights.length : 0;
  return (
    <div className="card flight-stats-card">
      <div className="flight-stats-grid">
        <div className="flight-stats-item">
          <span className="flight-stats-label">Filtered flights</span>
          <span className="flight-stats-value mono">{flights.length}</span>
        </div>
        <div className="flight-stats-item">
          <span className="flight-stats-label">Total hours</span>
          <span className="flight-stats-value mono">{fmtNum(totalMinutes / 60, 1)} h</span>
        </div>
        <div className="flight-stats-item">
          <span className="flight-stats-label">Avg duration</span>
          <span className="flight-stats-value mono">{fmtDuration(avgMinutes)}</span>
        </div>
        <div className="flight-stats-item">
          <span className="flight-stats-label">Thermal hours</span>
          <span className="flight-stats-value mono">{fmtNum(thermalMinutes / 60, 1)} h</span>
        </div>
        <div className="flight-stats-item">
          <span className="flight-stats-label">Soaring hours</span>
          <span className="flight-stats-value mono">{fmtNum(soaringMinutes / 60, 1)} h</span>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span className="dl">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  const buttonLabel = selected.length > 0 ? `${label} (${selected.length})` : label;

  const toggleOption = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <details className="multi-filter">
      <summary className="multi-filter-summary" aria-label={`${label} filter`}>
        {buttonLabel}
      </summary>
      <div className="multi-filter-menu">
        {options.map((opt) => (
          <label key={opt.value} className="multi-filter-option">
            <input
              type="checkbox"
              checked={selectedSet.has(opt.value)}
              onChange={() => toggleOption(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
