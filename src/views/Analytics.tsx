import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Card, EmptyState, Section } from '../components/primitives';
import { fmtDate, fmtDuration, fmtNum } from '../lib/format';
import type { AppData } from '../lib/useData';
import {
  airtimeByMonth,
  classificationByYear,
  perGlider,
  perSite,
  topBy,
} from '../shared/stats';
import type { DerivedFlight } from '../shared/types';

interface Props {
  data: AppData;
  navigate: (path: string, query?: URLSearchParams) => void;
}

const AXIS_COLOR = '#a1a1aa';
const GRID_COLOR = '#27272a';

const tooltipStyle = {
  background: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  fontSize: 12,
} as const;

const LIFT_COLORS = {
  thermal: '#F59E0B',
  soaring: '#38BDF8',
  towing: '#A78BFA',
  sledder: '#94A3B8',
  unknown: '#71717A',
};

export function Analytics({ data, navigate }: Props) {
  const { derived } = data;
  const [breakdown, setBreakdown] = useState(true);

  const months = airtimeByMonth(derived).map((m) => ({
    label: m.label,
    total: Number(m.total.toFixed(2)),
    thermal: Number(m.thermal.toFixed(2)),
    soaring: Number(m.soaring.toFixed(2)),
    towing: Number(m.towing.toFixed(2)),
    sledder: Number(m.sledder.toFixed(2)),
  }));

  const years = classificationByYear(derived).map((y) => ({
    label: y.year,
    thermal: Number(y.thermal.toFixed(2)),
    soaring: Number(y.soaring.toFixed(2)),
    towing: Number(y.towing.toFixed(2)),
    sledder: Number(y.sledder.toFixed(2)),
  }));

  const sites = perSite(derived);
  const gliders = perGlider(derived);
  const topDuration = topBy(derived, (f) => f.flight.durationMinutes);
  const topAltitude = topBy(derived, (f) => f.flight.maxAltitudeAmsl);
  const durationScatter = derived.map((f) => ({
    id: f.flight.id,
    x: Number(f.flight.durationMinutes.toFixed(1)),
    y: Number(f.flight.maxAltitudeAmsl.toFixed(0)),
    z: Number((f.flight.radialDistanceKm + 0.1).toFixed(2)),
    date: f.flight.date,
    site: f.site?.name || 'Unknown',
    lift: liftLabel(f),
    climb: Number(f.flight.maxClimbRate.toFixed(1)),
    sink: Number(f.flight.maxSinkRate.toFixed(1)),
    radialKm: Number(f.flight.radialDistanceKm.toFixed(1)),
    xcKm: Number(f.flight.longestXcKm.toFixed(1)),
    glider: f.gear?.name || '—',
    sourceFileName: f.flight.sourceFileName || '—',
  }));

  const gotoFlight = (f: DerivedFlight) =>
    navigate('/flights', new URLSearchParams({ flight: f.flight.id }));

  return (
    <>
      <h1 className="page-title">Analytics</h1>

      <Section
        title="Airtime by month"
        action={
          <label className="toggle">
            <input
              type="checkbox"
              checked={breakdown}
              onChange={(e) => setBreakdown(e.target.checked)}
            />
            Breakdown
          </label>
        }
      >
        <Card>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS_COLOR, fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff10' }} />
                {breakdown ? (
                  <>
                    <Bar dataKey="thermal" stackId="a" fill={LIFT_COLORS.thermal} />
                    <Bar dataKey="soaring" stackId="a" fill={LIFT_COLORS.soaring} />
                    <Bar dataKey="towing" stackId="a" fill={LIFT_COLORS.towing} />
                    <Bar dataKey="sledder" stackId="a" fill={LIFT_COLORS.sledder} />
                  </>
                ) : (
                  <Bar dataKey="total" fill={LIFT_COLORS.thermal} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      <Section title="Lift breakdown over time">
        <Card>
          {years.length === 0 ? (
            <EmptyState message="No data yet." />
          ) : (
            <>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={years} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
                    <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff10' }} />
                    <Bar dataKey="thermal" stackId="a" fill={LIFT_COLORS.thermal} />
                    <Bar dataKey="soaring" stackId="a" fill={LIFT_COLORS.soaring} />
                    <Bar dataKey="towing" stackId="a" fill={LIFT_COLORS.towing} />
                    <Bar dataKey="sledder" stackId="a" fill={LIFT_COLORS.sledder} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title="Flights and hours per site">
        <Card>
          <RankedBars
            rows={sites.map((s) => ({
              label: s.name,
              hours: Number(s.hours.toFixed(2)),
              meta: `${s.count}×`,
            }))}
          />
        </Card>
      </Section>

      <Section title="Hours per glider">
        <Card>
          {gliders.length === 0 ? (
            <EmptyState message="No matched gear yet." />
          ) : (
            <RankedBars
              rows={gliders.map((g) => ({
                label: g.name,
                hours: Number(g.hours.toFixed(2)),
              }))}
            />
          )}
        </Card>
      </Section>

      <Section title="Duration vs altitude (scatter)">
        <Card>
          {durationScatter.length === 0 ? (
            <EmptyState message="No data yet." />
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke={GRID_COLOR} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Duration (min)"
                    tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Max altitude (m)"
                    tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                  />
                  <ZAxis type="number" dataKey="z" range={[30, 180]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={tooltipStyle}
                    content={<ScatterTooltip />}
                  />
                  <Scatter
                    name="Flights"
                    data={durationScatter}
                    fill="#38bdf8"
                    line={false}
                  >
                    {durationScatter.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={liftColor(entry.lift)}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Top 10 by duration">
        <TopTable
          rows={topDuration}
          value={(f) => fmtDuration(f.flight.durationMinutes)}
          onPick={gotoFlight}
        />
      </Section>

      <Section title="Top 10 by max altitude">
        <TopTable
          rows={topAltitude}
          value={(f) => `${fmtNum(f.flight.maxAltitudeAmsl, 0)} m`}
          onPick={gotoFlight}
        />
      </Section>
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

function liftColor(lift: string): string {
  if (lift === 'Thermal') return LIFT_COLORS.thermal;
  if (lift === 'Soaring') return LIFT_COLORS.soaring;
  if (lift === 'Towing') return LIFT_COLORS.towing;
  if (lift === 'Sledder') return LIFT_COLORS.sledder;
  return LIFT_COLORS.unknown;
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: {
    date?: string;
    site?: string;
    lift?: string;
    x?: number;
    y?: number;
    climb?: number;
    sink?: number;
    radialKm?: number;
    xcKm?: number;
    glider?: string;
    sourceFileName?: string;
  } }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div className="scatter-tooltip">
      <div className="mono">{fmtDate(p.date || '')}</div>
      <div>{p.site || 'Unknown site'} · {p.lift || 'Unknown'}</div>
      <div className="muted">Duration: <span className="mono">{fmtNum(p.x ?? 0, 1)} min</span></div>
      <div className="muted">Max altitude: <span className="mono">{fmtNum(p.y ?? 0, 0)} m</span></div>
      <div className="muted">Climb/Sink: <span className="mono">{fmtNum(p.climb ?? 0, 1)} / {fmtNum(p.sink ?? 0, 1)} m/s</span></div>
      <div className="muted">Radial/XC: <span className="mono">{fmtNum(p.radialKm ?? 0, 1)} / {fmtNum(p.xcKm ?? 0, 1)} km</span></div>
      <div className="muted">Glider: <span className="mono">{p.glider || '—'}</span></div>
      <div className="muted">Log: <span className="mono">{p.sourceFileName || '—'}</span></div>
    </div>
  );
}

function RankedBars({
  rows,
}: {
  rows: { label: string; hours: number; meta?: string }[];
}) {
  const data = rows.map((r) => ({ ...r }));
  if (data.length === 0) return <EmptyState message="No data yet." />;
  return (
    <div style={{ width: '100%', height: Math.max(120, data.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
          <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: AXIS_COLOR, fontSize: 12 }}
            width={110}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff10' }} />
          <Bar dataKey="hours" fill="#38bdf8" radius={[0, 3, 3, 0]}>
            {data.map((_, i) => (
              <Cell key={i} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopTable({
  rows,
  value,
  onPick,
}: {
  rows: DerivedFlight[];
  value: (f: DerivedFlight) => string;
  onPick: (f: DerivedFlight) => void;
}) {
  if (rows.length === 0) return <EmptyState message="No data yet." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Site</th>
            <th className="col-num">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.flight.id} className="flight-row" onClick={() => onPick(f)}>
              <td>{fmtDate(f.flight.date)}</td>
              <td>{f.site?.name || 'Unknown'}</td>
              <td className="col-num">{value(f)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
