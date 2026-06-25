import { Suspense, lazy } from 'react';
import { Nav } from './components/Nav';
import { useData } from './lib/useData';
import { useHashRoute } from './lib/useHashRoute';
import { Dashboard } from './views/Dashboard';
import { FlightLog } from './views/FlightLog';

// Analytics pulls in Recharts, the heaviest dependency. Load it on demand so the
// Dashboard and Flight Log don't pay for the charting bundle up front.
const Analytics = lazy(() =>
  import('./views/Analytics').then((m) => ({ default: m.Analytics })),
);

export default function App() {
  const state = useData();
  const { route, navigate } = useHashRoute();

  if (state.status === 'loading') {
    return <div className="center-screen">Loading flight data…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className="center-screen">
        <div>
          <p>Could not load flight data.</p>
          <p className="muted mono">{state.message}</p>
        </div>
      </div>
    );
  }

  const { data } = state;
  const path = route.path;
  const isKnown =
    path === '/' || path.startsWith('/flights') || path.startsWith('/analytics');

  return (
    <div className="app">
      <Nav path={path} />
      <main className="page">
        {path === '/' && <Dashboard data={data} navigate={navigate} />}
        {path.startsWith('/flights') && (
          <FlightLog data={data} route={route} navigate={navigate} />
        )}
        {path.startsWith('/analytics') && (
          <Suspense fallback={<div className="empty">Loading analytics…</div>}>
            <Analytics data={data} navigate={navigate} />
          </Suspense>
        )}
        {!isKnown && <div className="empty">Page not found.</div>}
      </main>
    </div>
  );
}
