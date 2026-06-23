import { useEffect, useState } from 'react';
import { deriveAll } from '../shared/domain';
import type { DerivedFlight, Flight, Site } from '../shared/types';

export interface AppData {
  flights: Flight[];
  sites: Site[];
  derived: DerivedFlight[];
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AppData };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export function useData(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetchJson<Flight[]>(`${base}data/flights.json`),
      fetchJson<Site[]>(`${base}data/sites.json`),
    ])
      .then(([flights, sites]) => {
        const derived = deriveAll(flights, sites);
        setState({ status: 'ready', data: { flights, sites, derived } });
      })
      .catch((err: unknown) =>
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, []);

  return state;
}
