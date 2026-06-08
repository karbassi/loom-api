#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { LoomClient } from "./client.ts";
import { COMMANDS, KNOWN_FLAGS, READ_COMMANDS, WRITE_ONLY_FLAGS, generateCompletions, showCommandHelp, showHelp } from "./commands.ts";
import { c, confirm, die, info, page, spinner, usageError } from "./ui.ts";
import { checkUnknownFlags, dryRun, fmtDate, fmtDuration, needsId, parseId, parseWriteArgs, resolveAuth, suggest } from "./utils.ts";

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

async function main() {
  process.on("SIGPIPE", () => process.exit(0));
  process.on("SIGINT", () => process.exit(130));

  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }
  if (command === "help") {
    if (args[0] && showCommandHelp(args[0])) return;
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

  if (args.includes("--help") || args.includes("-h")) {
    if (showCommandHelp(command)) return;
  }

  checkUnknownFlags(args, KNOWN_FLAGS);

  if (READ_COMMANDS.has(command)) {
    for (const a of args) {
      if (a === "--") break;
      if (WRITE_ONLY_FLAGS.has(a)) {
        usageError(`error: flag "${a}" is only valid for write commands\n\n  hint: Run ${c.cyan(`"loom ${command} --help"`)} for usage.`);
      }
    }
  }

  const jsonMode = args.includes("--json");
  const filteredArgs = args.filter((a) => a === "-n" || !a.startsWith("-"));

  const { cookies, sid } = resolveAuth(AUTH_FILE);
  const client = new LoomClient(cookies);
  const videoId = parseId(filteredArgs[0]);

  const spin = spinner();
  try {
    switch (command) {
      case "whoami": {
        const { videos } = await client.listVideos({ limit: 1 });
        const video = videos[0];
        const v = await client.getVideo(video.id);
        const owner = v.owner || {} as any;
        console.log(`${c.dim("Logged in as:")} ${c.bold(owner.display_name || "unknown")} ${c.dim(`(user ${owner.id || "?"})`)}`);
        if (sid?.expires) {
          const daysLeft = ((sid.expires * 1000 - Date.now()) / 86400000).toFixed(1);
          const color = Number(daysLeft) < 5 ? c.yellow : c.green;
          console.log(`${c.dim("Session:")}     ${color(`expires in ${daysLeft} days`)}`);
        } else {
          console.log(`${c.dim("Auth:")}        LOOM_COOKIE`);
        }
        console.log(`${c.dim("Videos:")}      ${(await client.getAllVideos()).length}`);
        break;
      }
      case "search": {
        const q = filteredArgs.join(" ");
        if (!q) usageError("error: missing search query\n\n  hint: loom search <QUERY>");
        const results = await client.searchVideos(q);
        if (results.length === 0) { info("No results."); return; }
        if (jsonMode) return console.log(JSON.stringify(results, null, 2));
        for (const v of results) {
          console.log(`${c.dim(v.id)}  ${v.name}`);
        }
        break;
      }
      case "list": {
        let limit = 20;
        const nIdx = filteredArgs.indexOf("-n");
        if (nIdx !== -1 && filteredArgs[nIdx + 1]) {
          limit = parseInt(filteredArgs[nIdx + 1], 10) || 20;
        }
        if (args.includes("--all")) limit = Infinity;

        const videos = [];
        let cursor: string | null = null;
        while (videos.length < limit) {
          const batch = Math.min(50, limit - videos.length);
          const result = await client.listVideos({ limit: batch, cursor });
          videos.push(...result.videos);
          if (!result.hasNextPage) break;
          cursor = result.endCursor;
        }
        if (videos.length === 0) { info("No videos."); return; }
        if (jsonMode) return console.log(JSON.stringify(videos, null, 2));
        const lines = videos.map(v => `${c.dim(v.id)}  ${v.name}`);
        page(lines.join("\n") + "\n");
        info(`${c.dim(`${videos.length} videos`)}` + (limit !== Infinity ? c.dim('  (use "loom list --all" for everything)') : ""));
        break;
      }
      case "video": {
        needsId(videoId, "video");
        const v = await client.getVideo(videoId);
        if (jsonMode) return console.log(JSON.stringify(v, null, 2));
        const owner = (v.owner || {} as any).display_name || "unknown";
        const views = (v.views || {} as any).total || 0;
        console.log(c.bold(v.name));
        console.log(`  ${c.dim("Duration:")}    ${fmtDuration(v.playable_duration)}`);
        console.log(`  ${c.dim("Created:")}     ${fmtDate(v.createdAt)}`);
        console.log(`  ${c.dim("Owner:")}       ${owner}`);
        console.log(`  ${c.dim("Views:")}       ${views}`);
        console.log(`  ${c.dim("Comments:")}    ${v.totalComments || 0}`);
        console.log(`  ${c.dim("Reactions:")}   ${v.totalReactions || 0}`);
        if (v.tags?.length) console.log(`  ${c.dim("Tags:")}        ${v.tags.join(", ")}`);
        console.log(`  ${c.dim("URL:")}         ${c.cyan(`https://www.loom.com/share/${v.id}`)}`);
        break;
      }
      case "transcript": {
        needsId(videoId, "transcript");
        const text = await client.getTranscriptText(videoId);
        if (text) page(text + "\n");
        else info("No transcript available.");
        break;
      }
      case "captions": {
        needsId(videoId, "captions");
        const vtt = await client.getCaptions(videoId);
        if (vtt) page(vtt + "\n");
        else info("No captions available.");
        break;
      }
      case "download": {
        needsId(videoId, "download");
        const url = await client.getDownloadUrl(videoId);
        if (url) console.log(url);
        else info("No download URL available.");
        break;
      }
      case "chapters": {
        needsId(videoId, "chapters");
        const chapters = await client.getChapters(videoId);
        if (chapters?.content) console.log(chapters.content);
        else info("No chapters available.");
        break;
      }
      case "summary": {
        needsId(videoId, "summary");
        const summary = await client.getSummary(videoId);
        if (summary?.autoDescription) console.log(summary.autoDescription);
        else info("No summary available.");
        break;
      }
      case "description": case "desc": {
        needsId(videoId, "description");
        const desc = await client.getDescription(videoId);
        if (desc) console.log(desc);
        else info("No description available.");
        break;
      }
      case "comments": {
        needsId(videoId, "comments");
        const comments = await client.getComments(videoId);
        if (comments.length === 0) { info("No comments."); return; }
        if (jsonMode) return console.log(JSON.stringify(comments, null, 2));
        for (const cm of comments) {
          const ts = cm.time_stamp != null ? c.dim(` @${fmtDuration(cm.time_stamp)}`) : "";
          console.log(`[${c.bold(cm.user_name)}${ts}] ${cm.content}`);
          for (const r of cm.children_comments || []) {
            console.log(`  └─ [${c.bold(r.user_name)}] ${r.content}`);
          }
        }
        break;
      }
      case "tasks": {
        needsId(videoId, "tasks");
        const tasks = await client.getTasks(videoId);
        if (tasks.length === 0) { info("No action items."); return; }
        if (jsonMode) return console.log(JSON.stringify(tasks, null, 2));
        for (const t of tasks) {
          const owner = t.owner?.display_name || "Unassigned";
          const ts = t.time_stamp != null ? c.dim(` @${fmtDuration(t.time_stamp)}`) : "";
          const status = t.resolved_at ? c.green("done") : c.yellow("open");
          console.log(`[${status}] [${c.bold(owner)}${ts}] ${t.content}`);
        }
        break;
      }
      case "reactions": {
        needsId(videoId, "reactions");
        const reactions = await client.getReactions(videoId);
        if (reactions.length === 0) { info("No reactions."); return; }
        if (jsonMode) return console.log(JSON.stringify(reactions, null, 2));
        for (const r of reactions) {
          const user = r.user?.display_name || r.anon_user_name || "Anonymous";
          const emoji = r.extended_reaction || r.reaction || "";
          const ts = r.time != null ? c.dim(` @${fmtDuration(r.time)}`) : "";
          console.log(`[${c.bold(user)}${ts}] ${emoji}`);
        }
        break;
      }
      case "notes": {
        needsId(videoId, "notes");
        const notesUrl = await client.getMeetingNotesUrl(videoId);
        if (notesUrl) console.log(notesUrl);
        else info("No meeting notes linked.");
        break;
      }
      case "folders": {
        const allFolders = [];
        let folderCursor: string | null = null;
        while (true) {
          const r = await client.listFolders({ limit: 50, cursor: folderCursor });
          allFolders.push(...r.folders);
          if (!r.hasNextPage) break;
          folderCursor = r.endCursor;
        }
        if (allFolders.length === 0) { info("No folders."); return; }
        if (jsonMode) return console.log(JSON.stringify(allFolders, null, 2));
        for (const f of allFolders) {
          console.log(`${c.dim(f.id)}  ${f.name}  ${c.dim(`(${f.visibility || "unknown"})`)}`);
        }
        info(`\n${c.dim(`${allFolders.length} folders`)}`);
        break;
      }
      case "spaces": {
        const allSpaces = [];
        let spaceCursor: string | null = null;
        while (true) {
          const r = await client.listSpaces({ limit: 50, cursor: spaceCursor });
          allSpaces.push(...r.spaces);
          if (!r.hasNextPage) break;
          spaceCursor = r.endCursor;
        }
        if (allSpaces.length === 0) { info("No spaces."); return; }
        if (jsonMode) return console.log(JSON.stringify(allSpaces, null, 2));
        for (const s of allSpaces) {
          const primary = s.is_primary ? c.dim(" (primary)") : "";
          console.log(`${c.dim(s.id)}  ${s.name}  ${c.dim(`[${s.privacy || "unknown"}]`)}${primary}`);
        }
        info(`\n${c.dim(`${allSpaces.length} spaces`)}`);
        break;
      }
      case "backlinks": {
        needsId(videoId, "backlinks");
        const backlinks = await client.getBacklinks(videoId);
        if (backlinks.length === 0) { info("No backlinks."); return; }
        if (jsonMode) return console.log(JSON.stringify(backlinks, null, 2));
        for (const b of backlinks) {
          console.log(`${c.dim(`[${b.source}]`)} ${b.title || "Untitled"} — ${c.cyan(b.sourceLink || "")}`);
        }
        break;
      }
      case "tags": {
        needsId(videoId, "tags");
        const tags = await client.getTags(videoId);
        if (!tags.length) { info("No tags."); return; }
        if (jsonMode) return console.log(JSON.stringify(tags, null, 2));
        console.log(tags.join(", "));
        break;
      }
      case "user": {
        needsId(videoId, "user");
        const user = await client.getUserById(videoId);
        if (!user) { info("User not found."); return; }
        if (jsonMode) return console.log(JSON.stringify(user, null, 2));
        console.log(c.bold(user.display_name));
        if (user.email) console.log(`  ${c.dim("Email:")}    ${user.email}`);
        if (user.company_name) console.log(`  ${c.dim("Company:")}  ${user.company_name}`);
        if (user.companyPosition) console.log(`  ${c.dim("Role:")}     ${user.companyPosition}`);
        console.log(`  ${c.dim("ID:")}       ${c.dim(user.id)}`);
        break;
      }
      case "open": {
        needsId(videoId, "open");
        const url = `https://www.loom.com/share/${videoId}`;
        const { exec } = await import("child_process");
        exec(`open "${url}"`);
        console.log(c.cyan(url));
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
        page(JSON.stringify({
          video,
          description,
          chapters: chapters?.content || null,
          summary: summary?.autoDescription || null,
          transcript,
          tasks,
          comments,
        }, null, 2) + "\n");
        break;
      }
      case "takeaways": {
        needsId(videoId, "takeaways");
        const takeaways = await client.getKeyTakeaways(videoId);
        if (!takeaways.length) { info("No key takeaways available."); return; }
        if (jsonMode) return console.log(JSON.stringify(takeaways, null, 2));
        for (const t of takeaways) console.log(`- ${t}`);
        break;
      }
      case "confluence": {
        needsId(videoId, "confluence");
        const pages = await client.getConfluencePages(videoId);
        if (!pages.length) { info("No Confluence pages linked."); return; }
        if (jsonMode) return console.log(JSON.stringify(pages, null, 2));
        for (const p of pages) console.log(`${p.title || "Untitled"}  ${c.cyan(p.url || "")}`);
        break;
      }
      case "search-folders": {
        const q = filteredArgs.join(" ");
        if (!q) usageError("error: missing search query\n\n  hint: loom search-folders <QUERY>");
        const matchedFolders = await client.searchFolders(q);
        if (!matchedFolders.length) { info("No matching folders."); return; }
        if (jsonMode) return console.log(JSON.stringify(matchedFolders, null, 2));
        for (const f of matchedFolders) console.log(`${c.dim(f.id)}  ${f.name}`);
        break;
      }
      case "watch-time": {
        needsId(videoId, "watch-time");
        const time = await client.getLastWatchTime(videoId);
        if (time == null) { info("No watch history for this video."); return; }
        if (jsonMode) return console.log(JSON.stringify({ video_id: videoId, last_watch_time: time }, null, 2));
        console.log(`Last watched at ${fmtDuration(time)}`);
        break;
      }
      case "watch-later-count": {
        const count = await client.getWatchLaterCount();
        if (jsonMode) return console.log(JSON.stringify({ count }, null, 2));
        console.log(`Watch Later: ${count} video(s)`);
        break;
      }
      case "video-count": {
        needsId(videoId, "video-count");
        const count = await client.getTotalVideosCount(videoId);
        if (jsonMode) return console.log(JSON.stringify({ user_id: videoId, count }, null, 2));
        console.log(`${count} videos`);
        break;
      }
      case "frequent-reactions": {
        const freqReactions = await client.getFrequentReactions();
        if (!freqReactions.length) { info("No recent reactions."); return; }
        if (jsonMode) return console.log(JSON.stringify(freqReactions, null, 2));
        console.log(freqReactions.join(", "));
        break;
      }
      case "comment-reactions": {
        const commentId = filteredArgs[0];
        if (!commentId) usageError("error: missing required argument\n\n  hint: loom comment-reactions <COMMENT_ID> [--type COMMENT|REPLY]");
        const typeIdx = args.indexOf("--type");
        const commentType = typeIdx !== -1 && args[typeIdx + 1] ? args[typeIdx + 1] : "COMMENT";
        const cReactions = await client.getCommentReactions(commentId, commentType);
        if (!cReactions.length) { info("No reactions on this comment."); return; }
        if (jsonMode) return console.log(JSON.stringify(cReactions, null, 2));
        for (const r of cReactions) console.log(`[${c.bold(r.userName || "Unknown")}] ${r.extendedReaction || ""}`);
        break;
      }
      case "search-tags": {
        const q = filteredArgs.join(" ");
        if (!q) usageError("error: missing search query\n\n  hint: loom search-tags <QUERY>");
        const matchedTags = await client.searchWorkspaceTags(q);
        if (!matchedTags.length) { info("No matching tags."); return; }
        console.log(JSON.stringify(matchedTags, null, 2));
        break;
      }
      case "space": {
        needsId(videoId, "space");
        const spaceInfo = await client.getSpace(videoId);
        if (!spaceInfo) { info("Space not found."); return; }
        if (jsonMode) return console.log(JSON.stringify(spaceInfo, null, 2));
        console.log(c.bold(spaceInfo.name));
        console.log(`  ${c.dim("Privacy:")}   ${spaceInfo.privacy || "unknown"}`);
        if (spaceInfo.is_primary) console.log(`  ${c.dim("Primary:")}   yes`);
        console.log(`  ${c.dim("ID:")}        ${c.dim(spaceInfo.id)}`);
        break;
      }
      case "folder": {
        const folderId = filteredArgs[0];
        if (!folderId) usageError("error: missing required argument\n\n  hint: loom folder <FOLDER_ID>");
        const folderInfo = await client.getFolder(folderId);
        if (!folderInfo) { info("Folder not found."); return; }
        if (jsonMode) return console.log(JSON.stringify(folderInfo, null, 2));
        console.log(c.bold(folderInfo.name));
        console.log(`  ${c.dim("Visibility:")} ${folderInfo.visibility || "unknown"}`);
        if (folderInfo.created_by) console.log(`  ${c.dim("Created by:")} ${folderInfo.created_by.display_name}`);
        if (folderInfo.createdAt) console.log(`  ${c.dim("Created:")}    ${fmtDate(folderInfo.createdAt)}`);
        console.log(`  ${c.dim("ID:")}         ${c.dim(folderInfo.id)}`);
        break;
      }

      // --- Write commands ---

      case "rename": {
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        const name = positional.slice(1).join(" ");
        needsId(id, "rename");
        if (!name) usageError(`error: missing required argument\n  command: loom rename\n\n  hint: loom rename <ID> <NAME>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would rename ${c.dim(id)} to ${c.bold(name)}`, { action: "rename", id, name }); break; }
        const result = await client.updateVideoName(id, name);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Renamed ${c.dim(id)} → ${c.bold(result.name)}`);
        break;
      }

      case "edit-description": {
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        const text = positional.slice(1).join(" ");
        needsId(id, "edit-description");
        if (!text) usageError(`error: missing required argument\n  command: loom edit-description\n\n  hint: loom edit-description <ID> <TEXT>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would update description of ${c.dim(id)}`, { action: "edit-description", id, text }); break; }
        const result = await client.updateVideoDescription(id, text);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Updated description of ${c.dim(id)}`);
        break;
      }

      case "archive": case "unarchive": {
        const isArchive = command === "archive";
        const { flags, positional } = parseWriteArgs(args);
        const ids = positional.map(parseId).filter((id): id is string => id !== null);
        if (ids.length === 0) usageError(`error: missing required argument\n  command: loom ${command}\n\n  hint: loom ${command} <ID> [ID...]`);
        if (isArchive && ids.length > 1 && !flags.yes) {
          const ok = await confirm(`Archive ${ids.length} videos?`);
          if (!ok) { spin.stop(); info("Aborted."); break; }
        }
        if (flags.dryRun) { dryRun(spin, flags, `Would ${command} ${ids.length} video(s): ${ids.map(i => c.dim(i)).join(", ")}`, { action: command, ids }); break; }
        const result = await client.archiveVideos(ids, isArchive);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`${isArchive ? "Archived" : "Unarchived"} ${ids.length} video(s)`);
        break;
      }

      case "delete": {
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        needsId(id, "delete");
        if (!flags.force) usageError(`error: --force required for delete\n\n  hint: loom delete <ID> --force\n        This permanently deletes the video.`);
        if (!flags.yes) {
          const ok = await confirm(`Permanently delete ${c.dim(id)}?`);
          if (!ok) { spin.stop(); info("Aborted."); break; }
        }
        if (flags.dryRun) { dryRun(spin, flags, `Would delete ${c.dim(id)}`, { action: "delete", id }); break; }
        const result = await client.deleteVideo(id);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Deleted ${c.dim(id)}`);
        break;
      }

      case "recover": {
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        needsId(id, "recover");
        if (flags.dryRun) { dryRun(spin, flags, `Would recover ${c.dim(id)}`, { action: "recover", id }); break; }
        const result = await client.recoverVideo(id);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Recovered ${c.dim(id)}`);
        break;
      }

      case "duplicate": {
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        needsId(id, "duplicate");
        if (flags.dryRun) { dryRun(spin, flags, `Would duplicate ${c.dim(id)}`, { action: "duplicate", id }); break; }
        const result = await client.duplicateVideo(id);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Duplicated ${c.dim(id)}`);
        break;
      }

      case "pin": case "unpin": {
        const isPinning = command === "pin";
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        needsId(id, command);
        if (flags.dryRun) { dryRun(spin, flags, `Would ${command} ${c.dim(id)}`, { action: command, id }); break; }
        const result = await client.updateVideoPinStatus(id, isPinning);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`${isPinning ? "Pinned" : "Unpinned"} ${c.dim(id)}`);
        break;
      }

      case "comment": {
        const { flags, positional } = parseWriteArgs(args, ["--at"]);
        const id = parseId(positional[0]);
        const text = positional.slice(1).join(" ");
        needsId(id, "comment");
        if (!text) usageError(`error: missing required argument\n  command: loom comment\n\n  hint: loom comment <ID> <TEXT> [--at SEC]`);
        const timestamp = flags.at != null ? parseInt(flags.at as string, 10) : 0;
        if (flags.at != null && isNaN(timestamp)) usageError(`error: --at must be a number (seconds)\n\n  hint: loom comment <ID> <TEXT> --at 30`);
        if (flags.dryRun) { dryRun(spin, flags, `Would comment on ${c.dim(id)}: "${text}"${timestamp ? ` @${fmtDuration(timestamp)}` : ""}`, { action: "comment", id, content: text, timestamp }); break; }
        const result = await client.createComment(id, text, timestamp);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Comment added to ${c.dim(id)}${timestamp ? ` @${fmtDuration(timestamp)}` : ""}`);
        break;
      }

      case "delete-comment": {
        const { flags, positional } = parseWriteArgs(args);
        const commentId = positional[0];
        if (!commentId) usageError(`error: missing required argument\n  command: loom delete-comment\n\n  hint: loom delete-comment <COMMENT_ID> --force`);
        if (!flags.force) usageError(`error: --force required for delete-comment\n\n  hint: loom delete-comment <COMMENT_ID> --force`);
        if (!flags.yes) {
          const ok = await confirm(`Delete comment ${c.dim(commentId)}?`);
          if (!ok) { spin.stop(); info("Aborted."); break; }
        }
        if (flags.dryRun) { dryRun(spin, flags, `Would delete comment ${c.dim(commentId)}`, { action: "delete-comment", comment_id: commentId }); break; }
        const result = await client.deleteComment(commentId);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Deleted comment ${c.dim(commentId)}`);
        break;
      }

      case "add-task": {
        const { flags, positional } = parseWriteArgs(args, ["--at"]);
        const id = parseId(positional[0]);
        const text = positional.slice(1).join(" ");
        needsId(id, "add-task");
        if (!text) usageError(`error: missing required argument\n  command: loom add-task\n\n  hint: loom add-task <ID> <TEXT> [--at SEC]`);
        const timestamp = flags.at != null ? parseInt(flags.at as string, 10) : 0;
        if (flags.at != null && isNaN(timestamp)) usageError(`error: --at must be a number (seconds)\n\n  hint: loom add-task <ID> <TEXT> --at 45`);
        if (flags.dryRun) { dryRun(spin, flags, `Would add task to ${c.dim(id)}: "${text}"${timestamp ? ` @${fmtDuration(timestamp)}` : ""}`, { action: "add-task", id, content: text, timestamp }); break; }
        const result = await client.createTask(id, text, timestamp);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Task added to ${c.dim(id)}${timestamp ? ` @${fmtDuration(timestamp)}` : ""}`);
        break;
      }

      case "done": {
        const { flags, positional } = parseWriteArgs(args);
        const taskId = positional[0];
        if (!taskId) usageError(`error: missing required argument\n  command: loom done\n\n  hint: loom done <TASK_ID>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would mark task ${c.dim(taskId)} as done`, { action: "done", task_id: taskId }); break; }
        const result = await client.approveTask(taskId);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Marked task ${c.dim(taskId)} as ${c.green("done")}`);
        break;
      }

      case "delete-task": {
        const { flags, positional } = parseWriteArgs(args);
        const taskId = positional[0];
        if (!taskId) usageError(`error: missing required argument\n  command: loom delete-task\n\n  hint: loom delete-task <TASK_ID> --force`);
        if (!flags.force) usageError(`error: --force required for delete-task\n\n  hint: loom delete-task <TASK_ID> --force`);
        if (!flags.yes) {
          const ok = await confirm(`Delete task ${c.dim(taskId)}?`);
          if (!ok) { spin.stop(); info("Aborted."); break; }
        }
        if (flags.dryRun) { dryRun(spin, flags, `Would delete task ${c.dim(taskId)}`, { action: "delete-task", task_id: taskId }); break; }
        const result = await client.deleteTask(taskId);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Deleted task ${c.dim(taskId)}`);
        break;
      }

      case "create-folder": {
        const { flags, positional } = parseWriteArgs(args);
        const name = positional.join(" ");
        if (!name) usageError(`error: missing required argument\n  command: loom create-folder\n\n  hint: loom create-folder <NAME>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would create folder ${c.bold(name)}`, { action: "create-folder", name }); break; }
        const result = await client.createFolder(name);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Created folder ${c.bold(name)}`);
        break;
      }

      case "rename-folder": {
        const { flags, positional } = parseWriteArgs(args);
        const folderId = positional[0];
        const name = positional.slice(1).join(" ");
        if (!folderId) usageError(`error: missing required argument\n  command: loom rename-folder\n\n  hint: loom rename-folder <FOLDER_ID> <NAME>`);
        if (!name) usageError(`error: missing required argument\n  command: loom rename-folder\n\n  hint: loom rename-folder <FOLDER_ID> <NAME>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would rename folder ${c.dim(folderId)} to ${c.bold(name)}`, { action: "rename-folder", folder_id: folderId, name }); break; }
        const result = await client.renameFolder(folderId, name);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Renamed folder ${c.dim(folderId)} → ${c.bold(name)}`);
        break;
      }

      case "delete-folder": {
        const { flags, positional } = parseWriteArgs(args);
        const ids = positional.filter(Boolean);
        if (ids.length === 0) usageError(`error: missing required argument\n  command: loom delete-folder\n\n  hint: loom delete-folder <ID> [ID...] --force`);
        if (!flags.force) usageError(`error: --force required for delete-folder\n\n  hint: loom delete-folder <ID> [ID...] --force`);
        if (!flags.yes) {
          const ok = await confirm(`Delete ${ids.length} folder(s)?`);
          if (!ok) { spin.stop(); info("Aborted."); break; }
        }
        if (flags.dryRun) { dryRun(spin, flags, `Would delete ${ids.length} folder(s): ${ids.map(i => c.dim(i)).join(", ")}`, { action: "delete-folder", ids }); break; }
        const result = await client.deleteFolders(ids);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Deleted ${ids.length} folder(s)`);
        break;
      }

      case "move": {
        const { flags, positional } = parseWriteArgs(args, ["--to"]);
        const ids = positional.map(parseId).filter((id): id is string => id !== null);
        const toFolder = flags.to as string;
        if (ids.length === 0) usageError(`error: missing required argument\n  command: loom move\n\n  hint: loom move <ID> [ID...] --to <FOLDER_ID>`);
        if (!toFolder) usageError(`error: --to <FOLDER_ID> required\n\n  hint: loom move <ID> [ID...] --to <FOLDER_ID>`);
        if (ids.length > 1 && !flags.yes) {
          const ok = await confirm(`Move ${ids.length} videos to folder ${c.dim(toFolder)}?`);
          if (!ok) { spin.stop(); info("Aborted."); break; }
        }
        if (flags.dryRun) { dryRun(spin, flags, `Would move ${ids.length} video(s) to folder ${c.dim(toFolder)}`, { action: "move", ids, to: toFolder }); break; }
        const result = await client.bulkMoveVideos(ids, toFolder);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Moved ${ids.length} video(s) to folder ${c.dim(toFolder)}`);
        break;
      }

      case "follow": case "unfollow": {
        const isFollow = command === "follow";
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        needsId(id, command);
        if (flags.dryRun) { dryRun(spin, flags, `Would ${command} ${c.dim(id)}`, { action: command, id }); break; }
        const result = await client.toggleFollowing(id, isFollow);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`${isFollow ? "Following" : "Unfollowed"} ${c.dim(id)}`);
        break;
      }

      case "edit-settings": {
        const { flags, positional } = parseWriteArgs(args);
        const id = parseId(positional[0]);
        needsId(id, "edit-settings");
        const pairs = positional.slice(1);
        if (!pairs.length) usageError(`error: missing settings\n\n  hint: loom edit-settings <ID> <KEY=VALUE> [KEY=VALUE...]\n        Example: loom edit-settings abc123 download_enabled=true`);
        const settings: Record<string, unknown> = {};
        for (const p of pairs) {
          const [k, ...rest] = p.split("=");
          const v = rest.join("=");
          if (!k || v === "") usageError(`error: invalid setting "${p}"\n\n  hint: Use KEY=VALUE format, e.g. download_enabled=true`);
          settings[k] = v === "true" ? true : v === "false" ? false : isNaN(Number(v)) ? v : Number(v);
        }
        if (flags.dryRun) { dryRun(spin, flags, `Would update settings on ${c.dim(id)}: ${JSON.stringify(settings)}`, { action: "edit-settings", id, settings }); break; }
        const result = await client.updateVideoSettings(id, settings);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Updated settings on ${c.dim(id)}`);
        break;
      }

      case "edit-comment": {
        const { flags, positional } = parseWriteArgs(args);
        const commentId = positional[0];
        const vid = parseId(positional[1]);
        const text = positional.slice(2).join(" ");
        if (!commentId) usageError(`error: missing required argument\n  command: loom edit-comment\n\n  hint: loom edit-comment <COMMENT_ID> <VIDEO_ID> <TEXT>`);
        if (!vid) usageError(`error: missing video ID\n  command: loom edit-comment\n\n  hint: loom edit-comment <COMMENT_ID> <VIDEO_ID> <TEXT>`);
        if (!text) usageError(`error: missing comment text\n  command: loom edit-comment\n\n  hint: loom edit-comment <COMMENT_ID> <VIDEO_ID> <TEXT>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would edit comment ${c.dim(commentId)}: "${text}"`, { action: "edit-comment", comment_id: commentId, video_id: vid, content: text }); break; }
        const result = await client.editComment(commentId, vid, text);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Edited comment ${c.dim(commentId)}`);
        break;
      }

      case "edit-task": {
        const { flags, positional } = parseWriteArgs(args);
        const taskId = positional[0];
        const text = positional.slice(1).join(" ");
        if (!taskId) usageError(`error: missing required argument\n  command: loom edit-task\n\n  hint: loom edit-task <TASK_ID> <TEXT>`);
        if (!text) usageError(`error: missing task text\n  command: loom edit-task\n\n  hint: loom edit-task <TASK_ID> <TEXT>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would edit task ${c.dim(taskId)}: "${text}"`, { action: "edit-task", task_id: taskId, content: text }); break; }
        const result = await client.updateVideoTask(taskId, text);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Edited task ${c.dim(taskId)}`);
        break;
      }

      case "respond-task": {
        const { flags, positional } = parseWriteArgs(args);
        const taskId = positional[0];
        if (!taskId) usageError(`error: missing required argument\n  command: loom respond-task\n\n  hint: loom respond-task <TASK_ID>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would mark task ${c.dim(taskId)} as responded`, { action: "respond-task", task_id: taskId }); break; }
        const result = await client.respondToTask(taskId, true);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Responded to task ${c.dim(taskId)}`);
        break;
      }

      case "add-reaction": {
        const { flags, positional } = parseWriteArgs(args, ["--at"]);
        const id = parseId(positional[0]);
        const type = positional[1];
        needsId(id, "add-reaction");
        if (!type) usageError(`error: missing reaction type\n  command: loom add-reaction\n\n  hint: loom add-reaction <ID> <TYPE> --at <SEC>\n        Use ${c.cyan('"loom frequent-reactions"')} to see valid types.`);
        const timestamp = flags.at != null ? parseInt(flags.at as string, 10) : 0;
        if (flags.at != null && isNaN(timestamp)) usageError(`error: --at must be a number (seconds)\n\n  hint: loom add-reaction <ID> <TYPE> --at 30`);
        if (flags.dryRun) { dryRun(spin, flags, `Would add ${type} reaction to ${c.dim(id)} @${fmtDuration(timestamp)}`, { action: "add-reaction", id, type, timestamp }); break; }
        const result = await client.addReaction(id, timestamp, type);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Added ${type} reaction to ${c.dim(id)} @${fmtDuration(timestamp)}`);
        break;
      }

      case "delete-reaction": {
        const { flags, positional } = parseWriteArgs(args);
        const reactionId = positional[0];
        if (!reactionId) usageError(`error: missing required argument\n  command: loom delete-reaction\n\n  hint: loom delete-reaction <REACTION_ID> --force`);
        if (!flags.force) usageError(`error: --force required for delete-reaction\n\n  hint: loom delete-reaction <REACTION_ID> --force`);
        if (flags.dryRun) { dryRun(spin, flags, `Would delete reaction ${c.dim(reactionId)}`, { action: "delete-reaction", reaction_id: reactionId }); break; }
        const result = await client.deleteReaction(reactionId);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Deleted reaction ${c.dim(reactionId)}`);
        break;
      }

      case "react-comment": {
        const { flags, positional } = parseWriteArgs(args);
        const commentId = positional[0];
        const reaction = positional[1];
        if (!commentId) usageError(`error: missing required argument\n  command: loom react-comment\n\n  hint: loom react-comment <COMMENT_ID> <REACTION>`);
        if (!reaction) usageError(`error: missing reaction\n  command: loom react-comment\n\n  hint: loom react-comment <COMMENT_ID> <REACTION>`);
        if (flags.dryRun) { dryRun(spin, flags, `Would react to comment ${c.dim(commentId)} with ${reaction}`, { action: "react-comment", comment_id: commentId, reaction }); break; }
        const result = await client.addCommentReaction(commentId, reaction);
        spin.stop();
        if (flags.json) { console.log(JSON.stringify(result, null, 2)); break; }
        info(`Reacted to comment ${c.dim(commentId)} with ${reaction}`);
        break;
      }

      default: {
        const suggestion = suggest(command, Object.keys(COMMANDS));
        let msg = `error: unknown command "${command}"`;
        if (suggestion) msg += `\n\n  Did you mean ${c.cyan(`"${suggestion}"`)}?`;
        msg += `\n\n  hint: Run ${c.cyan('"loom help"')} for a list of commands.`;
        usageError(msg);
      }
    }
    spin.stop();
  } catch (err) {
    spin.stop();
    const msg = (err as Error).message || String(err);
    if (msg.includes("403") || msg.includes("401") || msg.includes("Unauthorized")) {
      die(
        `error: authentication failed\n\n` +
        `  hint: Session may have expired. Run ${c.cyan('"node refresh.js"')} or ${c.cyan('"node login.js"')}.`
      );
    }
    die(`error: ${msg}`);
  }
}

main();
