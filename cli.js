#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { LoomClient } from "./loom.js";

const VERSION = "1.0.0";

// Load ../.env (no dependencies)
const envPath = path.join(import.meta.dir, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const AUTH_FILE = process.env.LOOM_AUTH_FILE || path.join(import.meta.dir, "..", "auth.json");

const COMMANDS = {
  list:        { desc: "List recent videos",          usage: "loom list [-n COUNT | --all]" },
  search:      { desc: "Semantic search",             usage: "loom search <query>" },
  video:       { desc: "Get video details",           usage: "loom video <ID>" },
  transcript:  { desc: "Get transcript as text",      usage: "loom transcript <ID>" },
  captions:    { desc: "Get VTT captions",            usage: "loom captions <ID>" },
  download:    { desc: "Get download URL",            usage: "loom download <ID>" },
  chapters:    { desc: "Get chapters",                usage: "loom chapters <ID>" },
  summary:     { desc: "Get AI summary",              usage: "loom summary <ID>" },
  description: { desc: "Get AI description",          usage: "loom description <ID>" },
  comments:    { desc: "Get comments and replies",    usage: "loom comments <ID>" },
  tasks:       { desc: "Get action items",            usage: "loom tasks <ID>" },
  reactions:   { desc: "Get emoji reactions",          usage: "loom reactions <ID>" },
  notes:       { desc: "Get meeting notes URL",       usage: "loom notes <ID>" },
  folders:     { desc: "List your folders",            usage: "loom folders" },
  spaces:      { desc: "List your spaces",             usage: "loom spaces" },
  backlinks:   { desc: "Get backlinks",               usage: "loom backlinks <ID>" },
  tags:        { desc: "Get tags",                    usage: "loom tags <ID>" },
  user:        { desc: "Get user profile",            usage: "loom user <userId>" },
  open:        { desc: "Open video in browser",       usage: "loom open <ID>" },
  whoami:      { desc: "Check auth status",           usage: "loom whoami" },
  dump:        { desc: "Dump all data as JSON",       usage: "loom dump <ID>" },
  completions: { desc: "Generate shell completions",  usage: "loom completions <bash|zsh|fish>" },
};

// --- Output helpers ---

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function usageError(msg) {
  die(msg, 2);
}

function suggest(input, candidates) {
  let best = null, bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= 3 ? best : null;
}

function levenshtein(a, b) {
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

function resolveAuth() {
  if (process.env.LOOM_COOKIE) {
    return { cookies: process.env.LOOM_COOKIE, sid: null };
  }

  if (!fs.existsSync(AUTH_FILE)) {
    die(
      `error: no auth found\n  path: ${AUTH_FILE}\n\n` +
      `  hint: Either:\n` +
      `    export LOOM_COOKIE="connect.sid=..."  (from browser DevTools)\n` +
      `    Run "node login.js" to create auth.json`
    );
  }

  const state = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
  const sid = state.cookies?.find((c) => c.name === "connect.sid");
  if (!sid) {
    die(
      `error: no connect.sid cookie in auth file\n  path: ${AUTH_FILE}\n\n` +
      `  hint: Re-run "node login.js" to capture a fresh session.`
    );
  }
  if (sid.expires && sid.expires * 1000 < Date.now()) {
    die(
      `error: session expired\n  expired: ${new Date(sid.expires * 1000).toLocaleDateString()}\n\n` +
      `  hint: Run "node refresh.js" to extend, or "node login.js" for a fresh session.`
    );
  }

  const cookies = state.cookies
    .filter((c) => c.domain.includes("loom.com"))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return { cookies, sid };
}

// --- Formatting ---

function fmtDuration(secs) {
  if (!secs) return "0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h) return `${h}h ${m}m ${s}s`;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso) {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function parseId(input) {
  if (!input) return null;
  const m = input.match(/loom\.com\/(?:share|looms)\/([a-f0-9]{32})/);
  return m ? m[1] : input;
}

function needsId(id, command) {
  if (!id) usageError(
    `error: missing required argument\n  command: loom ${command}\n\n` +
    `  hint: ${COMMANDS[command]?.usage || `loom ${command} <ID>`}\n` +
    `        Accepts a video ID or full Loom URL.`
  );
}

// --- Help ---

function showHelp() {
  console.log(`Loom CLI — query Loom videos from the command line

USAGE
  loom <command> [args] [--json]

COMMANDS`);
  for (const [cmd, { desc }] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(14)} ${desc}`);
  }
  console.log(`
OPTIONS
  --json         Output raw JSON (pipe to jq)
  -n <COUNT>     Limit results (for list)
  --all          Show all results (for list)
  -h, --help     Show help
  -V, --version  Show version

EXAMPLES
  loom list -n 5
  loom video https://www.loom.com/share/abc123...
  loom search "onboarding walkthrough"
  loom transcript abc123 | pbcopy
  loom list --json | jq '.[].name'
  loom dump abc123 > meeting.json

ENVIRONMENT
  LOOM_COOKIE      connect.sid cookie value [from browser DevTools]
  LOOM_AUTH_FILE   path to auth.json [default: ${AUTH_FILE}]

LEARN MORE
  loom <command> --help`);
}

function showCommandHelp(command) {
  const cmd = COMMANDS[command];
  if (!cmd) return false;
  console.log(`${cmd.desc}

USAGE
  ${cmd.usage} [--json]`);
  return true;
}

// --- Shell completions ---

function generateCompletions(shell) {
  const cmds = Object.keys(COMMANDS);
  switch (shell) {
    case "bash":
      console.log(`# bash completion for loom
# Add to ~/.bashrc: eval "$(loom completions bash)"
_loom() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${cmds.join(" ")} help" -- "$cur") )
  fi
}
complete -F _loom loom`);
      break;
    case "zsh":
      console.log(`# zsh completion for loom
# Add to ~/.zshrc: eval "$(loom completions zsh)"
_loom() {
  local -a commands=(
${cmds.map((c) => `    '${c}:${COMMANDS[c].desc}'`).join("\n")}
    'help:Show help'
  )
  _describe 'command' commands
}
compdef _loom loom`);
      break;
    case "fish":
      console.log(`# fish completion for loom
# Save to ~/.config/fish/completions/loom.fish`);
      for (const [cmd, { desc }] of Object.entries(COMMANDS)) {
        console.log(`complete -c loom -n "__fish_use_subcommand" -a ${cmd} -d "${desc}"`);
      }
      console.log(`complete -c loom -n "__fish_use_subcommand" -a help -d "Show help"`);
      break;
    default:
      usageError(
        `error: unknown shell "${shell}"\n\n` +
        `  hint: loom completions <bash|zsh|fish>`
      );
  }
}

// --- Main ---

async function main() {
  // Handle SIGPIPE silently
  process.on("SIGPIPE", () => process.exit(0));

  const [command, ...args] = process.argv.slice(2);

  // Global flags
  if (!command || command === "help" || command === "--help" || command === "-h") {
    showHelp();
    return;
  }
  if (command === "--version" || command === "-V") {
    console.log(`loom ${VERSION}`);
    return;
  }
  if (command === "completions") {
    generateCompletions(args[0]);
    return;
  }

  // Per-command --help
  if (args.includes("--help") || args.includes("-h")) {
    if (showCommandHelp(command)) return;
  }

  const jsonMode = args.includes("--json");
  const filteredArgs = args.filter((a) => a !== "--json");

  const { cookies, sid } = resolveAuth();
  const client = new LoomClient(cookies);
  const videoId = parseId(filteredArgs[0]);

  try {
    switch (command) {
      case "whoami": {
        const { videos } = await client.listVideos({ limit: 1 });
        const video = videos[0];
        const v = await client.getVideo(video.id);
        const owner = v.owner || {};
        console.log(`Logged in as: ${owner.display_name || "unknown"} (user ${owner.id || "?"})`);
        if (sid?.expires) {
          const daysLeft = ((sid.expires * 1000 - Date.now()) / 86400000).toFixed(1);
          console.log(`Session expires in ${daysLeft} days`);
        } else {
          console.log(`Auth: LOOM_COOKIE`);
        }
        console.log(`Videos: ${(await client.getAllVideos()).length}`);
        break;
      }
      case "search": {
        const q = filteredArgs.join(" ");
        if (!q) usageError("error: missing search query\n\n  hint: loom search <query>");
        const results = await client.searchVideos(q);
        if (results.length === 0) return console.log("No results.");
        if (jsonMode) return console.log(JSON.stringify(results, null, 2));
        for (const v of results) {
          console.log(`  ${v.id}  ${v.name}`);
        }
        break;
      }
      case "list": {
        let limit = 20;
        const nIdx = filteredArgs.indexOf("-n");
        if (nIdx !== -1 && filteredArgs[nIdx + 1]) {
          limit = parseInt(filteredArgs[nIdx + 1], 10) || 20;
        }
        if (filteredArgs[0] === "all" || filteredArgs[0] === "--all") limit = Infinity;

        const videos = [];
        let cursor = null;
        while (videos.length < limit) {
          const batch = Math.min(50, limit - videos.length);
          const result = await client.listVideos({ limit: batch, cursor });
          videos.push(...result.videos);
          if (!result.hasNextPage) break;
          cursor = result.endCursor;
        }
        if (videos.length === 0) return console.log("No videos.");
        if (jsonMode) return console.log(JSON.stringify(videos, null, 2));
        for (const v of videos) {
          console.log(`  ${v.id}  ${v.name}`);
        }
        const suffix = limit !== Infinity ? '  (use "loom list --all" for everything)' : "";
        console.log(`\n${videos.length} videos${suffix}`);
        break;
      }
      case "video": {
        needsId(videoId, "video");
        const v = await client.getVideo(videoId);
        if (jsonMode) return console.log(JSON.stringify(v, null, 2));
        const owner = (v.owner || {}).display_name || "unknown";
        const views = (v.views || {}).total || 0;
        console.log(v.name);
        console.log(`  Duration:    ${fmtDuration(v.playable_duration)}`);
        console.log(`  Created:     ${fmtDate(v.createdAt)}`);
        console.log(`  Owner:       ${owner}`);
        console.log(`  Views:       ${views}`);
        console.log(`  Comments:    ${v.totalComments || 0}`);
        console.log(`  Reactions:   ${v.totalReactions || 0}`);
        if (v.tags?.length) console.log(`  Tags:        ${v.tags.join(", ")}`);
        console.log(`  URL:         https://www.loom.com/share/${v.id}`);
        break;
      }
      case "transcript": {
        needsId(videoId, "transcript");
        const text = await client.getTranscriptText(videoId);
        if (text) console.log(text);
        else console.log("No transcript available.");
        break;
      }
      case "captions": {
        needsId(videoId, "captions");
        const vtt = await client.getCaptions(videoId);
        if (vtt) console.log(vtt);
        else console.log("No captions available.");
        break;
      }
      case "download": {
        needsId(videoId, "download");
        const url = await client.getDownloadUrl(videoId);
        if (url) console.log(url);
        else console.log("No download URL available.");
        break;
      }
      case "chapters": {
        needsId(videoId, "chapters");
        const chapters = await client.getChapters(videoId);
        if (chapters?.content) console.log(chapters.content);
        else console.log("No chapters available.");
        break;
      }
      case "summary": {
        needsId(videoId, "summary");
        const summary = await client.getSummary(videoId);
        if (summary?.autoDescription) console.log(summary.autoDescription);
        else console.log("No summary available.");
        break;
      }
      case "description": case "desc": {
        needsId(videoId, "description");
        const desc = await client.getDescription(videoId);
        if (desc) console.log(desc);
        else console.log("No description available.");
        break;
      }
      case "comments": {
        needsId(videoId, "comments");
        const comments = await client.getComments(videoId);
        if (comments.length === 0) return console.log("No comments.");
        if (jsonMode) return console.log(JSON.stringify(comments, null, 2));
        for (const c of comments) {
          const ts = c.time_stamp != null ? ` @${fmtDuration(c.time_stamp)}` : "";
          console.log(`[${c.user_name}${ts}] ${c.content}`);
          for (const r of c.children_comments || []) {
            console.log(`  └─ [${r.user_name}] ${r.content}`);
          }
        }
        break;
      }
      case "tasks": {
        needsId(videoId, "tasks");
        const tasks = await client.getTasks(videoId);
        if (tasks.length === 0) return console.log("No action items.");
        if (jsonMode) return console.log(JSON.stringify(tasks, null, 2));
        for (const t of tasks) {
          const owner = t.owner?.display_name || "Unassigned";
          const ts = t.time_stamp != null ? ` @${fmtDuration(t.time_stamp)}` : "";
          const status = t.resolved_at ? "done" : "open";
          console.log(`[${status}] [${owner}${ts}] ${t.content}`);
        }
        break;
      }
      case "reactions": {
        needsId(videoId, "reactions");
        const reactions = await client.getReactions(videoId);
        if (reactions.length === 0) return console.log("No reactions.");
        if (jsonMode) return console.log(JSON.stringify(reactions, null, 2));
        for (const r of reactions) {
          const user = r.user?.display_name || r.anon_user_name || "Anonymous";
          const emoji = r.extended_reaction || r.reaction || "";
          const ts = r.time != null ? ` @${fmtDuration(r.time)}` : "";
          console.log(`[${user}${ts}] ${emoji}`);
        }
        break;
      }
      case "notes": {
        needsId(videoId, "notes");
        const notesUrl = await client.getMeetingNotesUrl(videoId);
        if (notesUrl) console.log(notesUrl);
        else console.log("No meeting notes linked.");
        break;
      }
      case "folders": {
        const allFolders = [];
        let folderCursor = null;
        while (true) {
          const r = await client.listFolders({ limit: 50, cursor: folderCursor });
          allFolders.push(...r.folders);
          if (!r.hasNextPage) break;
          folderCursor = r.endCursor;
        }
        if (allFolders.length === 0) return console.log("No folders.");
        if (jsonMode) return console.log(JSON.stringify(allFolders, null, 2));
        for (const f of allFolders) {
          console.log(`  ${f.id}  ${f.name}  (${f.visibility || "unknown"})`);
        }
        console.log(`\n${allFolders.length} folders`);
        break;
      }
      case "spaces": {
        const allSpaces = [];
        let spaceCursor = null;
        while (true) {
          const r = await client.listSpaces({ limit: 50, cursor: spaceCursor });
          allSpaces.push(...r.spaces);
          if (!r.hasNextPage) break;
          spaceCursor = r.endCursor;
        }
        if (allSpaces.length === 0) return console.log("No spaces.");
        if (jsonMode) return console.log(JSON.stringify(allSpaces, null, 2));
        for (const s of allSpaces) {
          const primary = s.is_primary ? " (primary)" : "";
          console.log(`  ${s.id}  ${s.name}  [${s.privacy || "unknown"}]${primary}`);
        }
        console.log(`\n${allSpaces.length} spaces`);
        break;
      }
      case "backlinks": {
        needsId(videoId, "backlinks");
        const backlinks = await client.getBacklinks(videoId);
        if (backlinks.length === 0) return console.log("No backlinks.");
        for (const b of backlinks) {
          console.log(`[${b.source}] ${b.title || "Untitled"} — ${b.sourceLink || ""}`);
        }
        break;
      }
      case "tags": {
        needsId(videoId, "tags");
        const tags = await client.getTags(videoId);
        if (!tags.length) return console.log("No tags.");
        console.log(tags.join(", "));
        break;
      }
      case "user": {
        needsId(videoId, "user");
        const user = await client.getUserById(videoId);
        if (!user) return console.log("User not found.");
        if (jsonMode) return console.log(JSON.stringify(user, null, 2));
        console.log(user.display_name);
        if (user.email) console.log(`  Email:    ${user.email}`);
        if (user.company_name) console.log(`  Company:  ${user.company_name}`);
        if (user.companyPosition) console.log(`  Role:     ${user.companyPosition}`);
        console.log(`  ID:       ${user.id}`);
        break;
      }
      case "open": {
        needsId(videoId, "open");
        const url = `https://www.loom.com/share/${videoId}`;
        const { exec } = await import("child_process");
        exec(`open "${url}"`);
        console.log(url);
        break;
      }
      case "dump": {
        needsId(videoId, "dump");
        const [video, transcript, chapters, summary, comments, tasks, description] = await Promise.all([
          client.getVideo(videoId),
          client.getTranscriptText(videoId).catch(() => null),
          client.getChapters(videoId).catch(() => null),
          client.getSummary(videoId).catch(() => null),
          client.getComments(videoId).catch(() => []),
          client.getTasks(videoId).catch(() => []),
          client.getDescription(videoId).catch(() => null),
        ]);
        console.log(JSON.stringify({
          video,
          description,
          chapters: chapters?.content || null,
          summary: summary?.autoDescription || null,
          transcript,
          tasks,
          comments,
        }, null, 2));
        break;
      }
      default: {
        const suggestion = suggest(command, Object.keys(COMMANDS));
        let msg = `error: unknown command "${command}"`;
        if (suggestion) msg += `\n\n  Did you mean "${suggestion}"?`;
        msg += `\n\n  hint: Run "loom help" for a list of commands.`;
        usageError(msg);
      }
    }
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("403") || msg.includes("401") || msg.includes("Unauthorized")) {
      die(
        `error: authentication failed\n\n` +
        `  hint: Session may have expired. Run "node refresh.js" or "node login.js".`
      );
    }
    die(`error: ${msg}`);
  }
}

main();
