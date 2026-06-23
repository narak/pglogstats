import { Card, Section, StatCard } from '../components/primitives';
import { fmtDate, fmtDuration, fmtHours, fmtInt, fmtNum } from '../lib/format';
import type { AppData } from '../lib/useData';
import {
  hoursByLiftSignals,
  incompleteCount,
  lifetimeSummary,
  personalRecords,
  recentActivity,
  type RecordEntry,
} from '../shared/stats';
import type { DerivedFlight } from '../shared/types';

interface Props {
  data: AppData;
  navigate: (path: string, query?: URLSearchParams) => void;
}

function gotoFlight(
  navigate: Props['navigate'],
  flight: DerivedFlight | undefined,
) {
  if (!flight) return;
  navigate('/flights', new URLSearchParams({ flight: flight.flight.id }));
}

function LiftStat({ label, hours }: { label: string; hours: number }) {
  return (
    <div className="lift-item">
      <span className="muted">{label}</span>
      <span className="lift-value mono">{fmtHours(hours * 60)}</span>
    </div>
  );
}

export function Dashboard({ data, navigate }: Props) {
  const { derived } = data;
  const summary = lifetimeSummary(derived);
  const lift = hoursByLiftSignals(derived);
  const records = personalRecords(derived);
  const recent = recentActivity(derived);
  const incomplete = incompleteCount(derived);
  const sitesFlown = (() => {
    const map = new Map<string, { site: NonNullable<DerivedFlight['site']>; flights: number; hours: number }>();
    for (const f of derived) {
      if (!f.site) continue;
      const prev = map.get(f.site.id);
      const h = f.flight.durationMinutes / 60;
      if (!prev) map.set(f.site.id, { site: f.site, flights: 1, hours: h });
      else {
        prev.flights += 1;
        prev.hours += h;
      }
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  })();

  const recordRow = (
    label: string,
    entry: RecordEntry | null,
    render: (e: RecordEntry) => { value: string; meta: string },
  ) => {
    if (!entry) return null;
    const { value, meta } = render(entry);
    return (
      <div
        className="rec-row link"
        role="link"
        tabIndex={0}
        onClick={() => gotoFlight(navigate, entry.flight)}
        onKeyDown={(e) => e.key === 'Enter' && gotoFlight(navigate, entry.flight)}
      >
        <span className="rec-label">{label}</span>
        <span className="rec-value">
          <div className="rec-num mono">{value}</div>
          <div className="rec-meta">{meta}</div>
        </span>
      </div>
    );
  };

  return (
    <>
      <h1 className="page-title">Dashboard</h1>

      <Section title="Lifetime">
        <div className="stat-grid">
          <StatCard value={fmtInt(summary.totalFlights)} label="Flights" />
          <StatCard value={fmtNum(summary.totalHours, 1)} label="Airtime (h)" />
          <StatCard value={fmtInt(summary.uniqueSites)} label="Sites" />
        </div>
        <Card>
          <div className="lift-row">
            <LiftStat label="Thermal" hours={lift.thermalHours} />
            <LiftStat label="Soaring" hours={lift.soaringHours} />
            <LiftStat label="Towing" hours={lift.towingHours} />
          </div>
          <div className="divider" />
          <span className="muted">
            Sledders: <span className="mono">{lift.sledderCount}</span> flights ·{' '}
            <span className="mono">{fmtHours(lift.sledderHours * 60)}</span>
          </span>
        </Card>
      </Section>

      {recent.lastFlight && (
        <Section title="Recent activity">
          <Card>
            <div className="recent">
              <div className="recent-top">
                <span>
                  <span className="muted">Last flight</span>{' '}
                  {fmtDate(recent.lastFlight.flight.date)} ·{' '}
                  {recent.lastFlight.site?.name || 'Unknown site'} ·{' '}
                  <span className="mono">
                    {fmtDuration(recent.lastFlight.flight.durationMinutes)}
                  </span>
                </span>
              </div>
              <span className="muted">
                <span className="mono">{recent.flightsThisMonth}</span> flights this month ·{' '}
                <span className="mono">{recent.flightsSameMonthLastYear}</span> same month last
                year
              </span>
            </div>
          </Card>
        </Section>
      )}

      <Section title="Personal records">
        <Card>
          <div className="rec-grid two-col">
            {recordRow('Longest flight', records.longestFlight, (e) => ({
              value: fmtDuration(e.value),
              meta: `${fmtDate(e.flight.flight.date)} · ${e.flight.site?.name || 'Unknown'}`,
            }))}
            {recordRow('Highest altitude (AMSL)', records.highestAltitude, (e) => ({
              value: `${fmtInt(e.value)} m`,
              meta: fmtDate(e.flight.flight.date),
            }))}
            {recordRow('Best climb rate', records.bestClimbRate, (e) => ({
              value: `${fmtNum(e.value, 1)} m/s`,
              meta: fmtDate(e.flight.flight.date),
            }))}
            {recordRow('Furthest from takeoff', records.furthestFromTakeoff, (e) => ({
              value: `${fmtNum(e.value, 1)} km`,
              meta: fmtDate(e.flight.flight.date),
            }))}
            {recordRow('Longest XC', records.longestXc, (e) => ({
              value: `${fmtNum(e.value, 1)} km`,
              meta: fmtDate(e.flight.flight.date),
            }))}
          </div>
        </Card>
      </Section>

      {sitesFlown.length > 0 && (
        <Section title="Sites flown">
          <Card>
            <div className="rec-grid">
              {sitesFlown.map(({ site, flights, hours }) => (
                <details key={site.id} className="site-details">
                  <summary className="site-summary rec-row">
                    <span className="rec-label">
                      {site.name} <span className="subtle">({site.country || '—'})</span>
                    </span>
                    <span className="rec-value mono">
                      {flights}× · {fmtNum(hours, 1)} h
                    </span>
                  </summary>
                  <div className="site-body">
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="dl">Coordinates</span>
                        <span className="mono">
                          {fmtNum(site.lat, 5)}, {fmtNum(site.lon, 5)}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="dl">Lift Flags</span>
                        <span className="mono">
                          T:{site.supportsThermals ? 'Y' : 'N'} S:{site.supportsSoaring ? 'Y' : 'N'} W:
                          {site.supportsWinch ? 'Y' : 'N'}
                        </span>
                      </div>
                      {site.elevationM != null && (
                        <div className="detail-item">
                          <span className="dl">Elevation</span>
                          <span className="mono">{fmtInt(site.elevationM)} m</span>
                        </div>
                      )}
                      {site.region && (
                        <div className="detail-item">
                          <span className="dl">Region</span>
                          <span>{site.region}</span>
                        </div>
                      )}
                      <div className="detail-item">
                        <span className="dl">ParaglidingEarth API</span>
                        <a
                          className="link mono site-link"
                          href={`https://www.paraglidingearth.com/api/geojson/getAroundLatLngSites.php?lat=${site.lat}&lng=${site.lon}&distance=25`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open nearby sites API →
                        </a>
                      </div>
                    </div>
                    {site.apiDetails && Object.keys(site.apiDetails).length > 0 && (
                      <div className="api-details">
                        <span className="dl">ParaglidingEarth Details</span>
                        <div className="api-grid">
                          {Object.entries(site.apiDetails).map(([k, v]) => (
                            <div key={k} className="api-row">
                              <span className="subtle">{k}</span>
                              <span className="mono">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </Card>
        </Section>
      )}

      {incomplete > 0 && (
        <Card className="notice">
          <span>
            <span className="mono">{incomplete}</span> flight{incomplete === 1 ? '' : 's'} with
            incomplete metadata.
          </span>
          <span
            className="link"
            onClick={() =>
              navigate('/flights', new URLSearchParams({ metadata: 'incomplete' }))
            }
          >
            Review →
          </span>
        </Card>
      )}
    </>
  );
}
