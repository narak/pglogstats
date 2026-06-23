import { Nav } from './components/Nav';
import { useData } from './lib/useData';
import { useHashRoute } from './lib/useHashRoute';
import { Dashboard } from './views/Dashboard';
import { FlightLog } from './views/FlightLog';
import { Analytics } from './views/Analytics';

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

  return (
    <div className="app">
      <Nav path={path} />
      <main className="page">
        {path === '/' && <Dashboard data={data} navigate={navigate} />}
        {path.startsWith('/flights') && (
          <FlightLog data={data} route={route} navigate={navigate} />
        )}
        {path.startsWith('/analytics') && <Analytics data={data} navigate={navigate} />}
        {!['/', '/flights', '/analytics'].some((p) =>
          p === '/' ? path === '/' : path.startsWith(p),
        ) && <div className="empty">Page not found.</div>}
      </main>
    </div>
  );
}
