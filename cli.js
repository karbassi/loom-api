#!/usr/bin/env bun
const fs = require("fs");
const path = require("path");

const AUTH_FILE = process.env.LOOM_AUTH_FILE || path.join(__dirname, "..", "auth.json");

const COMMANDS = {
  list: "List recent videos (default 20, or -n COUNT)",
  search: "Semantic search <query>",
  video: "Get video details <videoId>",
  transcript: "Get transcript as text <videoId>",
  captions: "Get VTT captions <videoId>",
  download: "Get download URL <videoId>",
  chapters: "Get chapters <videoId>",
  summary: "Get AI summary <videoId>",
  description: "Get AI description <videoId>",
  comments: "Get comments <videoId>",
  tasks: "Get AI action items <videoId>",
  reactions: "Get emoji reactions <videoId>",
  notes: "Get meeting notes URL <videoId>",
  folders: "List your folders",
  spaces: "List your spaces",
  backlinks: "Get backlinks <videoId>",
  tags: "Get tags <videoId>",
  user: "Get user profile <userId>",
  whoami: "Check auth status",
  dump: "Dump all data for a video <videoId>",
};

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function checkAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    die(
      `No auth.json found at ${AUTH_FILE}\n\n` +
      `Run "node login.js" to authenticate, or set LOOM_AUTH_FILE.`
    );
  }
  const state = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
  const sid = state.cookies?.find((c) => c.name === "connect.sid");
  if (!sid) {
    die(`No connect.sid cookie in ${AUTH_FILE}. Re-run "node login.js".`);
  }
  if (sid.expires && sid.expires * 1000 < Date.now()) {
    die(
      `Session expired (${new Date(sid.expires * 1000).toLocaleDateString()}).\n\n` +
      `Run "node refresh.js" to extend, or "node login.js" for a fresh session.`
    );
  }
  return sid;
}

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

function needsId(id, command) {
  if (!id) die(`Usage: loom ${command} <videoId>`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log("Usage: loom <command> [args]\n");
    console.log("Commands:");
    for (const [cmd, desc] of Object.entries(COMMANDS)) {
      console.log(`  ${cmd.padEnd(14)} ${desc}`);
    }
    console.log(`\nAuth: ${AUTH_FILE}`);
    return;
  }

  const sid = checkAuth();
  const { LoomClient } = require("./loom");

  let client;
  try {
    client = new LoomClient(AUTH_FILE);
  } catch (err) {
    die(`Failed to load auth: ${err.message}`);
  }

  const videoId = args[0];

  try {
    switch (command) {
      case "whoami": {
        const daysLeft = sid.expires
          ? ((sid.expires * 1000 - Date.now()) / 86400000).toFixed(1)
          : "unknown";
        const { videos } = await client.listVideos({ limit: 1 });
        const video = videos[0];
        const v = await client.getVideo(video.id);
        const owner = v.owner || {};
        console.log(`Logged in as: ${owner.display_name || "unknown"} (user ${owner.id || "?"})`);
        console.log(`Session expires in ${daysLeft} days`);
        console.log(`Videos: ${(await client.getAllVideos()).length}`);
        break;
      }
      case "search": {
        const q = args.join(" ");
        if (!q) die("Usage: loom search <query>");
        const results = await client.searchVideos(q);
        if (results.length === 0) return console.log("No results.");
        for (const v of results) {
          console.log(`  ${v.id}  ${v.name}`);
        }
        break;
      }
      case "list": {
        let limit = 20;
        const nIdx = args.indexOf("-n");
        if (nIdx !== -1 && args[nIdx + 1]) {
          limit = parseInt(args[nIdx + 1], 10) || 20;
        }
        if (args[0] === "all" || args[0] === "--all") limit = Infinity;

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
        console.log(`  ID:          ${v.id}`);
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
        console.log(user.display_name);
        if (user.email) console.log(`  Email:    ${user.email}`);
        if (user.company_name) console.log(`  Company:  ${user.company_name}`);
        if (user.companyPosition) console.log(`  Role:     ${user.companyPosition}`);
        console.log(`  ID:       ${user.id}`);
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
      default:
        die(`Unknown command: ${command}\nRun "loom help" for usage.`);
    }
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes("403") || msg.includes("401") || msg.includes("Unauthorized")) {
      die(`Auth error: session may have expired.\nRun "node refresh.js" or "node login.js".`);
    }
    die(msg);
  }
}

main();
