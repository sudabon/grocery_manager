import { cp, mkdir, rm } from 'node:fs/promises';

const source = new URL('../public/placeholder/', import.meta.url);
const output = new URL('../dist/', import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
