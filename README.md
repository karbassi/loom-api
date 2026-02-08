# Loom CLI

Command-line interface for Loom's internal GraphQL API. Zero dependencies — runs on Bun.

## Setup

### Option A: Cookie from browser (quickest)

1. Open Loom in your browser, open DevTools → Application → Cookies
2. Copy the `connect.sid` value
3. Export it:
   ```sh
   export LOOM_COOKIE="connect.sid=s%3A..."
   ```

### Option B: Auth file

1. Run `node login.js` from the [parent repo](../) to capture a browser session
2. The CLI looks for `../auth.json` by default. Override with:
   ```sh
   export LOOM_AUTH_FILE=/path/to/auth.json
   ```

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

Anywhere `<id>` is accepted, you can paste a full Loom URL instead:

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

## Auth errors

If you get auth errors, your session has expired (~30 days). Either:
- Run `node refresh.js` from the parent repo (headless, extends the session)
- Run `node login.js` from the parent repo (opens browser for fresh login)

## Requirements

- [Bun](https://bun.sh) runtime
- No npm dependencies
