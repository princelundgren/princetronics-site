import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isResponse, loadFunction, requestEvent } from './simulate.js';

/** One URL the old site served, with `gone` marking one whose 410 is expected. */
export type InventoryEntry = { url: string; gone?: true };
export type Hop = { status: number; location?: string };
export type Step = (url: string) => Promise<Hop>;

const MAX_REDIRECTS = 2;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * Requests `entry.url` through `step`, following at most two redirects. `ok` when the last answer is 200, or 410 for an
 * entry marked `gone`; `hops` lists each answer as `<status> <url>`.
 */
export async function checkUrl(entry: InventoryEntry, step: Step): Promise<{ ok: boolean; hops: string[] }> {
  const hops: string[] = [];
  let url = entry.url;
  for (let request = 0; request <= MAX_REDIRECTS; request++) {
    const hop = await step(url);
    hops.push(`${hop.status} ${url}`);
    if (!(REDIRECTS.has(hop.status) && hop.location)) {
      return { ok: hop.status === 200 || (hop.status === 410 && entry.gone === true), hops };
    }
    url = new URL(hop.location, url).href;
  }
  return { ok: false, hops };
}

/**
 * A step against a local build: `http://` answers CloudFront's 301 to `https://`; otherwise the viewer-request function
 * runs on the URL, and a request it passes on answers 200 when `distDir` holds that file, else 404.
 */
export function buildStep(functionCode: string, distDir: string): Step {
  const handler = loadFunction(functionCode);
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') {
      return { status: 301, location: `https://${parsed.host}${parsed.pathname}${parsed.search}` };
    }
    const result = handler(requestEvent(parsed.host, parsed.pathname, Object.fromEntries(parsed.searchParams)));
    if (isResponse(result)) {
      return { status: result.statusCode, location: result.headers?.location?.value };
    }
    const file = join(distDir, decodeURIComponent(result.uri));
    return { status: existsSync(file) && statSync(file).isFile() ? 200 : 404 };
  };
}

/** curl's arguments for one request that reports its status and redirect target without following it. */
export function curlArgs(url: string, connectTo?: string): string[] {
  const args = ['-s', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', '--max-redirs', '0'];
  if (connectTo) args.push('--connect-to', `::${connectTo}:`);
  return [...args, url];
}

/**
 * A step against the live site through curl, one request at a time with `intervalMs` between them, so a full run stays
 * under the web ACL's rate rule; `connectTo` sends every request to that host instead of the one DNS gives.
 */
export function liveStep(connectTo?: string, intervalMs = 400): Step {
  let ready: Promise<unknown> = Promise.resolve();
  return (url) => {
    const answer = ready.then(() => curl(url, connectTo));
    const pause = () => new Promise((resolve) => setTimeout(resolve, intervalMs));
    ready = answer.then(pause, pause);
    return answer;
  };
}

function curl(url: string, connectTo?: string): Promise<Hop> {
  return new Promise((resolve, reject) => {
    execFile('curl', curlArgs(url, connectTo), (error, stdout) => {
      const match = /^(\d{3}) ?(.*)$/.exec(String(stdout).trim());
      if (!match) {
        reject(new Error(`curl gave no status for ${url}: ${error?.message ?? stdout}`));
        return;
      }
      resolve(match[2] ? { status: Number(match[1]), location: match[2] } : { status: Number(match[1]) });
    });
  });
}

function readInventory(file: string): InventoryEntry[] {
  const entries: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(entries)) throw new Error(`${file}: expected a JSON array of { url, gone? }`);
  entries.forEach((entry, index) => {
    if (typeof entry?.url !== 'string') throw new Error(`${file}: entry ${index} has no string url`);
  });
  return entries as InventoryEntry[];
}

export type Mode = { kind: 'local'; dist: string; functionFile: string } | { kind: 'live'; connectTo?: string };

const USAGE =
  'usage: npm run url-check -- --inventory <file> (--dist <dir> --function <file> | --live [--connect-to <host>])';

/** Reads the CLI's arguments into the inventory file and one mode. Throws the usage line on any other combination. */
export function readOptions(args: string[]): { inventory: string; mode: Mode } {
  const { values } = parseArgs({
    args,
    options: {
      inventory: { type: 'string' },
      dist: { type: 'string' },
      function: { type: 'string' },
      live: { type: 'boolean' },
      'connect-to': { type: 'string' },
    },
  });
  const { inventory, dist, function: functionFile, live, 'connect-to': connectTo } = values;
  if (inventory && live && dist === undefined && functionFile === undefined) {
    return { inventory, mode: connectTo ? { kind: 'live', connectTo } : { kind: 'live' } };
  }
  if (inventory && !live && dist && functionFile && connectTo === undefined) {
    return { inventory, mode: { kind: 'local', dist, functionFile } };
  }
  throw new Error(USAGE);
}

async function main(args: string[]): Promise<number> {
  const { inventory: inventoryFile, mode } = readOptions(args);
  const step =
    mode.kind === 'live' ? liveStep(mode.connectTo) : buildStep(readFileSync(mode.functionFile, 'utf8'), mode.dist);
  const inventory = readInventory(inventoryFile);
  let failures = 0;
  for (const entry of inventory) {
    const { ok, hops } = await checkUrl(entry, step);
    if (!ok) {
      failures++;
      console.log(`FAIL ${entry.url}\n  ${hops.join('\n  ')}`);
    }
  }
  console.log(`${inventory.length - failures}/${inventory.length} URLs pass`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
