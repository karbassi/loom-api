import type { CommandDef } from "./types.ts";
import { c, usageError } from "./ui.ts";

export const COMMANDS: Record<string, CommandDef> = {
  list:        { desc: "List recent videos",          usage: "loom list [-n COUNT | --all]",
                 examples: ["loom list", "loom list -n 5", "loom list --all", "loom list --json | jq '.[].name'"] },
  search:      { desc: "Semantic search",             usage: "loom search <QUERY>",
                 examples: ["loom search onboarding", 'loom search "how to set up screening"'] },
  video:       { desc: "Get video details",           usage: "loom video <ID>",
                 examples: ["loom video abc123", "loom video https://www.loom.com/share/abc123", "loom video abc123 --json | jq '.views'"] },
  transcript:  { desc: "Get transcript as text",      usage: "loom transcript <ID>",
                 examples: ["loom transcript abc123", "loom transcript abc123 | pbcopy"] },
  captions:    { desc: "Get VTT captions",            usage: "loom captions <ID>",
                 examples: ["loom captions abc123", "loom captions abc123 > captions.vtt"] },
  download:    { desc: "Get download URL",            usage: "loom download <ID>",
                 examples: ["loom download abc123", "curl -o video.mp4 $(loom download abc123)"] },
  chapters:    { desc: "Get chapters",                usage: "loom chapters <ID>" },
  summary:     { desc: "Get AI summary",              usage: "loom summary <ID>" },
  description: { desc: "Get AI description",          usage: "loom description <ID>" },
  comments:    { desc: "Get comments and replies",    usage: "loom comments <ID>",
                 examples: ["loom comments abc123", "loom comments abc123 --json"] },
  tasks:       { desc: "Get action items",            usage: "loom tasks <ID>" },
  reactions:   { desc: "Get emoji reactions",          usage: "loom reactions <ID>" },
  notes:       { desc: "Get meeting notes URL",       usage: "loom notes <ID>" },
  folders:     { desc: "List your folders",            usage: "loom folders" },
  spaces:      { desc: "List your spaces",             usage: "loom spaces" },
  backlinks:   { desc: "Get backlinks",               usage: "loom backlinks <ID>" },
  tags:        { desc: "Get tags",                    usage: "loom tags <ID>" },
  user:        { desc: "Get user profile",            usage: "loom user <USER_ID>",
                 examples: ["loom user 12345", "loom user 12345 --json"] },
  open:        { desc: "Open video in browser",       usage: "loom open <ID>",
                 examples: ["loom open abc123", "loom open https://www.loom.com/share/abc123"] },
  whoami:      { desc: "Check auth status",           usage: "loom whoami" },
  dump:        { desc: "Dump all data as JSON",       usage: "loom dump <ID>",
                 examples: ["loom dump abc123", "loom dump abc123 > meeting.json", "loom dump abc123 | jq '.transcript'"] },
  completions: { desc: "Generate shell completions",  usage: "loom completions <bash|zsh|fish>",
                 examples: ['eval "$(loom completions zsh)"', "loom completions fish > ~/.config/fish/completions/loom.fish"] },
  takeaways:   { desc: "Get AI key takeaways",        usage: "loom takeaways <ID>" },
  confluence:  { desc: "Get linked Confluence pages",  usage: "loom confluence <ID>" },
  "search-folders": { desc: "Search folders by name",  usage: "loom search-folders <QUERY>",
                 examples: ['loom search-folders "Project"'] },
  "watch-time":     { desc: "Get last watch position", usage: "loom watch-time <ID>" },
  "watch-later-count": { desc: "Get Watch Later count", usage: "loom watch-later-count" },
  "video-count":    { desc: "Get total videos for a user", usage: "loom video-count <USER_ID>" },
  "frequent-reactions": { desc: "Get your frequent reactions", usage: "loom frequent-reactions" },
  "comment-reactions":  { desc: "Get reactions on a comment", usage: "loom comment-reactions <COMMENT_ID> [--type COMMENT|REPLY]" },
  "search-tags":   { desc: "Search workspace tags",    usage: "loom search-tags <QUERY>" },
  space:           { desc: "Get space details",         usage: "loom space <SPACE_ID>" },
  folder:          { desc: "Get folder details",        usage: "loom folder <FOLDER_ID>" },

  // --- Write commands ---
  rename:          { desc: "Rename a video",              usage: "loom rename <ID> <NAME>",
                     examples: ['loom rename abc123 "New Title"', 'loom rename abc123 "New Title" --dry-run'] },
  "edit-description": { desc: "Edit video description",  usage: "loom edit-description <ID> <TEXT>",
                     examples: ['loom edit-description abc123 "Updated description"'] },
  archive:         { desc: "Archive video(s)",            usage: "loom archive <ID> [ID...]",
                     examples: ["loom archive abc123", "loom archive abc123 def456 --yes"] },
  unarchive:       { desc: "Unarchive video(s)",          usage: "loom unarchive <ID> [ID...]" },
  delete:          { desc: "Delete a video",              usage: "loom delete <ID> --force",
                     examples: ["loom delete abc123 --force", "loom delete abc123 --force --dry-run"] },
  recover:         { desc: "Recover a deleted video",     usage: "loom recover <ID>" },
  duplicate:       { desc: "Duplicate a video",           usage: "loom duplicate <ID>" },
  pin:             { desc: "Pin a video",                 usage: "loom pin <ID>" },
  unpin:           { desc: "Unpin a video",               usage: "loom unpin <ID>" },
  comment:         { desc: "Add a comment",               usage: "loom comment <ID> <TEXT> [--at SEC]",
                     examples: ['loom comment abc123 "Great video!"', 'loom comment abc123 "See this part" --at 30'] },
  "delete-comment": { desc: "Delete a comment",           usage: "loom delete-comment <COMMENT_ID> --force" },
  "add-task":      { desc: "Add an action item",          usage: "loom add-task <ID> <TEXT> [--at SEC]",
                     examples: ['loom add-task abc123 "Follow up on this"', 'loom add-task abc123 "Review" --at 45'] },
  done:            { desc: "Mark a task as done",          usage: "loom done <TASK_ID>" },
  "delete-task":   { desc: "Delete a task",               usage: "loom delete-task <TASK_ID> --force" },
  "create-folder": { desc: "Create a folder",             usage: "loom create-folder <NAME>",
                     examples: ['loom create-folder "Project X"'] },
  "rename-folder": { desc: "Rename a folder",             usage: "loom rename-folder <FOLDER_ID> <NAME>",
                     examples: ['loom rename-folder abc123 "New Folder Name"'] },
  "delete-folder": { desc: "Delete folder(s)",            usage: "loom delete-folder <ID> [ID...] --force",
                     examples: ["loom delete-folder abc123 --force"] },
  move:            { desc: "Move video(s) to a folder",   usage: "loom move <ID> [ID...] --to <FOLDER_ID>",
                     examples: ["loom move abc123 --to folder456", "loom move abc123 def456 --to folder456 --yes"] },
  follow:          { desc: "Follow a video",              usage: "loom follow <ID>" },
  unfollow:        { desc: "Unfollow a video",            usage: "loom unfollow <ID>" },
  "edit-settings": { desc: "Update video settings",       usage: "loom edit-settings <ID> <KEY=VALUE> [KEY=VALUE...]",
                     examples: ['loom edit-settings abc123 download_enabled=true', 'loom edit-settings abc123 comments_enabled=false'] },
  "edit-comment":  { desc: "Edit a comment",              usage: "loom edit-comment <COMMENT_ID> <VIDEO_ID> <TEXT>",
                     examples: ['loom edit-comment cmt123 abc123 "Updated text"'] },
  "edit-task":     { desc: "Edit a task",                 usage: "loom edit-task <TASK_ID> <TEXT>",
                     examples: ['loom edit-task task123 "Updated task"'] },
  "respond-task":  { desc: "Mark a task as responded",    usage: "loom respond-task <TASK_ID>" },
  "add-reaction":  { desc: "Add a reaction to a video",   usage: "loom add-reaction <ID> <TYPE> --at <SEC>",
                     examples: ['loom add-reaction abc123 heart --at 30', "loom frequent-reactions  # to see valid types"] },
  "delete-reaction": { desc: "Delete a reaction",         usage: "loom delete-reaction <REACTION_ID> --force" },
  "react-comment": { desc: "React to a comment",          usage: "loom react-comment <COMMENT_ID> <REACTION>",
                     examples: ['loom react-comment cmt123 heart'] },
};

export const WRITE_ONLY_FLAGS = new Set(["--dry-run", "--yes", "-y", "--force", "-f", "--at", "--to"]);

export const KNOWN_FLAGS = new Set([
  "--json", "--all", "--help", "--version", "--no-color", "--color", "-h", "-V", "-n", "--type",
  ...WRITE_ONLY_FLAGS,
]);

export const READ_COMMANDS = new Set([
  "list", "search", "video", "transcript", "captions", "download", "chapters",
  "summary", "description", "comments", "tasks", "reactions", "notes", "folders",
  "spaces", "backlinks", "tags", "user", "open", "whoami", "dump", "completions",
  "takeaways", "confluence", "search-folders", "watch-time", "watch-later-count",
  "video-count", "frequent-reactions", "comment-reactions", "search-tags", "space", "folder",
]);

export function showHelp(): void {
  console.log(`${c.bold("Loom CLI")} — query and manage Loom videos from the command line

${c.bold("USAGE")}
  loom <command> [args] [--json]

${c.bold("READ COMMANDS")}`);
  for (const [cmd, { desc }] of Object.entries(COMMANDS)) {
    if (READ_COMMANDS.has(cmd)) console.log(`  ${c.cyan(cmd.padEnd(18))} ${desc}`);
  }
  console.log(`\n${c.bold("WRITE COMMANDS")}`);
  for (const [cmd, { desc }] of Object.entries(COMMANDS)) {
    if (!READ_COMMANDS.has(cmd)) console.log(`  ${c.cyan(cmd.padEnd(18))} ${desc}`);
  }
  console.log(`
${c.bold("OPTIONS")}
  --json          Output raw JSON (pipe to jq)
  -n ${c.dim("<COUNT>")}      Limit results (for list) ${c.dim("[default: 20]")}
  --all           Show all results (for list)
  --dry-run       Preview without executing (write commands)
  --force, -f     Required for destructive commands
  --yes, -y       Skip confirmation prompts
  --color ${c.dim("<WHEN>")}   Color output: auto, always, never ${c.dim("[default: auto]")}
  --no-color      Alias for --color=never
  -h, --help      Show help
  -V, --version   Show version

${c.bold("EXAMPLES")}
  ${c.dim("$")} loom list -n 5
  ${c.dim("$")} loom video https://www.loom.com/share/abc123...
  ${c.dim("$")} loom search "onboarding walkthrough"
  ${c.dim("$")} loom transcript abc123 | pbcopy
  ${c.dim("$")} loom list --json | jq '.[].name'
  ${c.dim("$")} loom rename abc123 "New Title"
  ${c.dim("$")} loom delete abc123 --force
  ${c.dim("$")} loom move abc123 --to folder456

${c.bold("ENVIRONMENT")}
  LOOM_COOKIE      connect.sid cookie value ${c.dim("[from browser DevTools]")}
  LOOM_AUTH_FILE   path to auth.json ${c.dim("[default: ../auth.json]")}

${c.bold("LEARN MORE")}
  loom <command> --help`);
}

export function showCommandHelp(command: string): boolean {
  const cmd = COMMANDS[command];
  if (!cmd) return false;
  const isWrite = !READ_COMMANDS.has(command);
  console.log(`${cmd.desc}

${c.bold("USAGE")}
  ${cmd.usage} [--json]${isWrite ? " [--dry-run]" : ""}`);
  if (cmd.examples?.length) {
    console.log(`\n${c.bold("EXAMPLES")}`);
    for (const ex of cmd.examples) {
      console.log(`  ${c.dim("$")} ${ex}`);
    }
  }
  if (isWrite) {
    console.log(`\n${c.bold("FLAGS")}`);
    console.log(`  --dry-run       Preview without executing`);
    console.log(`  --json          Output raw JSON`);
    if (cmd.usage.includes("--force")) console.log(`  --force, -f     Required (safety guard)`);
    if (cmd.usage.includes("[ID...]")) console.log(`  --yes, -y       Skip confirmation for bulk operations`);
  }
  return true;
}

export function generateCompletions(shell: string): void {
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
${cmds.map((cmd) => `    '${cmd}:${COMMANDS[cmd].desc}'`).join("\n")}
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
