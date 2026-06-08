import fs from "fs";
import path from "path";
import type { AuthResult, ParsedWriteArgs, Spinner, WriteFlags } from "./types.ts";
import { c, die, info, usageError } from "./ui.ts";

export function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h) return `${h}h ${m}m ${s}s`;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function parseId(input: string | undefined): string | null {
  if (!input) return null;
  const m = input.match(/loom\.com\/(?:share|looms)\/([a-f0-9]{32})/);
  return m ? m[1] : input;
}

export function needsId(id: string | null, command: string): asserts id is string {
  if (!id) usageError(
    `error: missing required argument\n  command: loom ${command}\n\n` +
    `  hint: loom ${command} <ID>\n` +
    `        Accepts a video ID or full Loom URL.`
  );
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

export function suggest(input: string, candidates: string[]): string | null {
  let best: string | null = null, bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= 3 ? best : null;
}

export function resolveAuth(authFile: string): AuthResult {
  if (process.env.LOOM_COOKIE) {
    return { cookies: process.env.LOOM_COOKIE, sid: null };
  }

  if (!fs.existsSync(authFile)) {
    die(
      `error: no auth found\n  ${c.dim("path:")} ${authFile}\n\n` +
      `  hint: Either:\n` +
      `    ${c.cyan('export LOOM_COOKIE="connect.sid=..."')}  (from browser DevTools)\n` +
      `    Run ${c.cyan('"node login.js"')} to create auth.json`
    );
  }

  const state = JSON.parse(fs.readFileSync(authFile, "utf8"));
  const sid = state.cookies?.find((ck: { name: string }) => ck.name === "connect.sid");
  if (!sid) {
    die(
      `error: no connect.sid cookie in auth file\n  ${c.dim("path:")} ${authFile}\n\n` +
      `  hint: Re-run ${c.cyan('"node login.js"')} to capture a fresh session.`
    );
  }
  if (sid.expires && sid.expires * 1000 < Date.now()) {
    die(
      `error: session expired\n  ${c.dim("expired:")} ${new Date(sid.expires * 1000).toLocaleDateString()}\n\n` +
      `  hint: Run ${c.cyan('"node refresh.js"')} to extend, or ${c.cyan('"node login.js"')} for a fresh session.`
    );
  }

  const cookies = state.cookies
    .filter((ck: { domain: string }) => ck.domain.includes("loom.com"))
    .map((ck: { name: string; value: string }) => `${ck.name}=${ck.value}`)
    .join("; ");

  return { cookies, sid };
}

export function dryRun(spin: Spinner, flags: WriteFlags, message: string, preview: Record<string, unknown> = {}): void {
  spin.stop();
  if (flags.json) { console.log(JSON.stringify({ dry_run: true, ...preview }, null, 2)); }
  else { info(message); }
}

export function parseWriteArgs(args: string[], valueFlags: string[] = []): ParsedWriteArgs {
  const flags: WriteFlags = { dryRun: false, yes: false, force: false, json: false };
  const positional: string[] = [];
  let pastSeparator = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!pastSeparator && a === "--") { pastSeparator = true; continue; }
    if (pastSeparator) { positional.push(a); continue; }
    if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--force" || a === "-f") flags.force = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--help" || a === "-h") { /* handled elsewhere */ }
    else if (valueFlags.includes(a) && i + 1 < args.length) {
      flags[a.replace(/^--/, "")] = args[++i];
    } else if (!a.startsWith("-")) {
      positional.push(a);
    }
  }
  return { flags, positional };
}

export function checkUnknownFlags(args: string[], knownFlags: Set<string>): void {
  for (const a of args) {
    if (a === "--") break;
    if (a.startsWith("-") && !knownFlags.has(a) && !knownFlags.has(a.split("=")[0]) && !/^-\d+$/.test(a)) {
      const suggestion = suggest(a, [...knownFlags]);
      let msg = `error: unknown flag "${a}"`;
      if (suggestion) msg += `\n\n  Did you mean ${c.cyan(suggestion)}?`;
      msg += `\n\n  hint: Run ${c.cyan('"loom help"')} for available options.`;
      usageError(msg);
    }
  }
}
