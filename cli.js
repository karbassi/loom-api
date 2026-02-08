#!/usr/bin/env node
const { LoomClient } = require("./loom");

const COMMANDS = {
  search: "Semantic search <query>",
  list: "List all your videos",
  video: "Get video details <videoId>",
  transcript: "Get transcript as text <videoId>",
  captions: "Get VTT captions <videoId>",
  download: "Get download URL <videoId>",
  chapters: "Get chapters <videoId>",
  summary: "Get AI summary <videoId>",
  comments: "Get comments <videoId>",
  tasks: "Get AI action items <videoId>",
  reactions: "Get emoji reactions <videoId>",
  notes: "Get meeting notes URL <videoId>",
  folders: "List your folders",
  spaces: "List your spaces",
  backlinks: "Get backlinks <videoId>",
  user: "Get user profile <userId>",
  dump: "Dump all data for a video <videoId>",
};

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help") {
    console.log("Usage: node cli.js <command> [args]\n");
    console.log("Commands:");
    for (const [cmd, desc] of Object.entries(COMMANDS)) {
      console.log(`  ${cmd.padEnd(12)} ${desc}`);
    }
    return;
  }

  const client = new LoomClient();
  const videoId = args[0];

  switch (command) {
    case "search": {
      const q = args.join(" ");
      if (!q) return console.error("Usage: node cli.js search <query>");
      const results = await client.searchVideos(q);
      if (results.length === 0) return console.log("No results");
      console.log(`Found ${results.length} results:\n`);
      for (const v of results) {
        console.log(`  ${v.id}  ${v.name}`);
      }
      break;
    }
    case "list": {
      const videos = await client.getAllVideos();
      console.log(`Found ${videos.length} videos:\n`);
      for (const v of videos) {
        console.log(`  ${v.id}  ${v.name}`);
      }
      break;
    }
    case "video": {
      if (!videoId) return console.error("Usage: node cli.js video <videoId>");
      const video = await client.getVideo(videoId);
      console.log(JSON.stringify(video, null, 2));
      break;
    }
    case "transcript": {
      if (!videoId) return console.error("Usage: node cli.js transcript <videoId>");
      const text = await client.getTranscriptText(videoId);
      if (text) console.log(text);
      else console.error("No transcript available");
      break;
    }
    case "captions": {
      if (!videoId) return console.error("Usage: node cli.js captions <videoId>");
      const vtt = await client.getCaptions(videoId);
      if (vtt) console.log(vtt);
      else console.error("No captions available");
      break;
    }
    case "download": {
      if (!videoId) return console.error("Usage: node cli.js download <videoId>");
      const url = await client.getDownloadUrl(videoId);
      if (url) console.log(url);
      else console.error("No download URL available");
      break;
    }
    case "chapters": {
      if (!videoId) return console.error("Usage: node cli.js chapters <videoId>");
      const chapters = await client.getChapters(videoId);
      if (chapters?.content) console.log(chapters.content);
      else console.log("No chapters available");
      break;
    }
    case "summary": {
      if (!videoId) return console.error("Usage: node cli.js summary <videoId>");
      const summary = await client.getSummary(videoId);
      if (summary?.autoDescription) console.log(summary.autoDescription);
      else console.log("No summary available");
      break;
    }
    case "comments": {
      if (!videoId) return console.error("Usage: node cli.js comments <videoId>");
      const comments = await client.getComments(videoId);
      if (comments.length === 0) return console.log("No comments");
      for (const c of comments) {
        const ts = c.time_stamp !== null ? ` @${c.time_stamp}s` : "";
        console.log(`[${c.user_name}${ts}] ${c.content}`);
        for (const r of c.children_comments || []) {
          console.log(`  └─ [${r.user_name}] ${r.content}`);
        }
      }
      break;
    }
    case "tasks": {
      if (!videoId) return console.error("Usage: node cli.js tasks <videoId>");
      const tasks = await client.getTasks(videoId);
      if (tasks.length === 0) return console.log("No action items");
      for (const t of tasks) {
        const owner = t.owner?.display_name || "Unassigned";
        const ts = t.time_stamp !== null ? ` @${t.time_stamp}s` : "";
        const status = t.resolved_at ? "resolved" : "open";
        console.log(`[${status}] [${owner}${ts}] ${t.content}`);
      }
      break;
    }
    case "reactions": {
      if (!videoId) return console.error("Usage: node cli.js reactions <videoId>");
      const reactions = await client.getReactions(videoId);
      if (reactions.length === 0) return console.log("No reactions");
      for (const r of reactions) {
        const user = r.user?.display_name || r.anon_user_name || "Anonymous";
        const emoji = r.extended_reaction || r.reaction || "";
        const ts = r.time !== null ? ` @${r.time}s` : "";
        console.log(`[${user}${ts}] ${emoji}`);
      }
      break;
    }
    case "notes": {
      if (!videoId) return console.error("Usage: node cli.js notes <videoId>");
      const notesUrl = await client.getMeetingNotesUrl(videoId);
      if (notesUrl) console.log(notesUrl);
      else console.log("No meeting notes linked");
      break;
    }
    case "folders": {
      const allFolders = [];
      let folderCursor = null;
      while (true) {
        const { folders, endCursor, hasNextPage } = await client.listFolders({ limit: 50, cursor: folderCursor });
        allFolders.push(...folders);
        if (!hasNextPage) break;
        folderCursor = endCursor;
      }
      if (allFolders.length === 0) return console.log("No folders");
      console.log(`Found ${allFolders.length} folders:\n`);
      for (const f of allFolders) {
        console.log(`  ${f.id}  ${f.name}  (${f.visibility || "unknown"})`);
      }
      break;
    }
    case "spaces": {
      const allSpaces = [];
      let spaceCursor = null;
      while (true) {
        const { spaces, endCursor, hasNextPage } = await client.listSpaces({ limit: 50, cursor: spaceCursor });
        allSpaces.push(...spaces);
        if (!hasNextPage) break;
        spaceCursor = endCursor;
      }
      if (allSpaces.length === 0) return console.log("No spaces");
      console.log(`Found ${allSpaces.length} spaces:\n`);
      for (const s of allSpaces) {
        const primary = s.is_primary ? " (primary)" : "";
        console.log(`  ${s.id}  ${s.name}  [${s.privacy || "unknown"}]${primary}`);
      }
      break;
    }
    case "backlinks": {
      if (!videoId) return console.error("Usage: node cli.js backlinks <videoId>");
      const backlinks = await client.getBacklinks(videoId);
      if (backlinks.length === 0) return console.log("No backlinks");
      for (const b of backlinks) {
        console.log(`[${b.source}] ${b.title || "Untitled"} — ${b.sourceLink || ""}`);
      }
      break;
    }
    case "user": {
      if (!videoId) return console.error("Usage: node cli.js user <userId>");
      const user = await client.getUserById(videoId);
      if (user) console.log(JSON.stringify(user, null, 2));
      else console.log("User not found");
      break;
    }
    case "dump": {
      if (!videoId) return console.error("Usage: node cli.js dump <videoId>");
      const [video, transcript, chapters, summary, comments] = await Promise.all([
        client.getVideo(videoId),
        client.getTranscriptText(videoId).catch(() => null),
        client.getChapters(videoId).catch(() => null),
        client.getSummary(videoId).catch(() => null),
        client.getComments(videoId).catch(() => []),
      ]);
      const result = {
        video,
        chapters: chapters?.content || null,
        summary: summary?.autoDescription || null,
        transcript,
        comments,
      };
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "node cli.js help" for usage');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
