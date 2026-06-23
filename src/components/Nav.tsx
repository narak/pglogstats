interface NavProps {
  path: string;
}

const LINKS: { path: string; label: string }[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/flights', label: 'Flights' },
  { path: '/analytics', label: 'Analytics' },
];

export function Nav({ path }: NavProps) {
  return (
    <header className="nav">
      <div className="nav-inner">
        <a href="#/" className="wordmark">
          PgLogStats
        </a>
        <nav className="nav-links">
          {LINKS.map((l) => {
            const active = l.path === '/' ? path === '/' : path.startsWith(l.path);
            return (
              <a
                key={l.path}
                href={`#${l.path}`}
                className={active ? 'nav-link active' : 'nav-link'}
              >
                {l.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
