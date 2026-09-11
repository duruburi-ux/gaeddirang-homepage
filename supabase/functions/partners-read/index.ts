import { makeHandler } from './handler.mjs';
Deno.serve(makeHandler({ env: (name: string) => Deno.env.get(name) }));
