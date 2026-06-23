declare module 'js-yaml' {
  export function load(input: string, options?: unknown): unknown;
  export function dump(obj: unknown, options?: unknown): string;
  const _default: { load: typeof load; dump: typeof dump };
  export default _default;
}

