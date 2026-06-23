import { useCallback, useEffect, useState } from 'react';

export interface HashRoute {
  path: string; // e.g. "/flights"
  query: URLSearchParams;
}

function parseHash(): HashRoute {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart || '/';
  return { path, query: new URLSearchParams(queryPart) };
}

export function useHashRoute() {
  const [route, setRoute] = useState<HashRoute>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.hash = '#/';
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((path: string, query?: URLSearchParams) => {
    const qs = query?.toString();
    window.location.hash = `#${path}${qs ? `?${qs}` : ''}`;
  }, []);

  // Replace query params for the current path without adding history noise.
  const setQuery = useCallback(
    (query: URLSearchParams) => {
      const qs = query.toString();
      const next = `#${route.path}${qs ? `?${qs}` : ''}`;
      if (next !== `#${route.path}?${route.query.toString()}`.replace(/\?$/, '')) {
        window.location.hash = next;
      }
    },
    [route.path, route.query],
  );

  return { route, navigate, setQuery };
}
