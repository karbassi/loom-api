# Loom CLI

Command-line interface for Loom's internal GraphQL API. Zero dependencies — runs on Bun.

## Setup

### Option A: Cookie from browser (quickest)

1. Open Loom in your browser, open DevTools → Application → Cookies
2. Copy the `connect.sid` value
3. Add to `../.env`:
   ```sh
   LOOM_COOKIE=connect.sid=s%3A...
   ```
   Or export directly:
   ```sh
   export LOOM_COOKIE="connect.sid=s%3A..."
   ```

### Option B: Auth file

1. Run `node login.js` from the [parent repo](../) to capture a browser session
2. The CLI looks for `../auth.json` by default. Override with:
   ```sh
   export LOOM_AUTH_FILE=/path/to/auth.json
   ```

Auth resolution: `.env` → `LOOM_COOKIE` → `LOOM_AUTH_FILE` → `../auth.json`

## Usage

```sh
loom list                        # recent 20 videos
loom list --all                  # all videos
loom list -n 5                   # last 5 videos
loom search onboarding           # semantic search
loom video <id>                  # video details
loom transcript <id>             # full transcript
loom captions <id>               # WebVTT captions
loom download <id>               # signed MP4 URL
loom chapters <id>               # AI chapters
loom summary <id>                # AI summary
loom description <id>            # AI description
loom comments <id>               # comments + replies
loom tasks <id>                  # action items
loom reactions <id>              # emoji reactions
loom notes <id>                  # meeting notes URL
loom folders                     # list folders
loom spaces                      # list spaces
loom backlinks <id>              # external references
loom tags <id>                   # video tags
loom user <userId>               # user profile
loom open <id>                   # open in browser
loom whoami                      # check auth status
loom dump <id>                   # all data as JSON
```

Anywhere `<id>` is accepted, you can paste a full Loom URL:

```sh
loom video https://www.loom.com/share/abc123def456...
```

### JSON output

Append `--json` to any command for structured output:

```sh
loom list --json | jq '.[].name'
loom video <id> --json | jq '.views'
loom comments <id> --json
```

### Shell completions

```sh
# bash — add to ~/.bashrc
eval "$(loom completions bash)"

# zsh — add to ~/.zshrc
eval "$(loom completions zsh)"

# fish — save to completions dir
loom completions fish > ~/.config/fish/completions/loom.fish
```

### Color output

Output is colorized when stdout is a terminal (dim IDs, bold titles, colored status). Color is automatically disabled when piping.

To disable color explicitly:

```sh
loom list --no-color
# or
NO_COLOR=1 loom list
```

To force color when piping (e.g. to `less -R`):

```sh
FORCE_COLOR=1 loom list | less -R
```

### Per-command help

```sh
loom video --help
loom list --help
```

## Error handling

Errors include context and hints:

```
error: unknown command "vdieo"

  Did you mean "video"?

  hint: Run "loom help" for a list of commands.
```

```
error: missing required argument
  command: loom video

  hint: loom video <ID>
        Accepts a video ID or full Loom URL.
```

Exit codes: `0` success, `1` runtime error, `2` usage error.

## Auth errors

If you get auth errors, your session has expired (~30 days). Either:
- Run `node refresh.js` from the parent repo (headless, extends the session)
- Run `node login.js` from the parent repo (opens browser for fresh login)

## Requirements

- [Bun](https://bun.sh) runtime
- No npm dependencies
