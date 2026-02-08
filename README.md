# Loom CLI

Command-line interface for Loom's internal GraphQL API. No public API exists — this uses cookie-based auth from a captured browser session.

## Setup

1. **Get `auth.json`** — run `node login.js` from the [parent repo](../) to open a browser, log in to Loom, and save the session cookies.

2. **Point to it** — the CLI looks for `../auth.json` by default. Override with:
   ```sh
   export LOOM_AUTH_FILE=/path/to/auth.json
   ```

## Usage

```sh
node cli.js help                              # show all commands
node cli.js list                              # list all videos
node cli.js search how to set up screening    # semantic search
node cli.js video <id>                        # video metadata
node cli.js transcript <id>                   # full transcript
node cli.js captions <id>                     # WebVTT captions
node cli.js download <id>                     # signed MP4 URL
node cli.js chapters <id>                     # AI chapters
node cli.js summary <id>                      # AI summary
node cli.js comments <id>                     # comments
node cli.js tasks <id>                        # action items
node cli.js reactions <id>                    # emoji reactions
node cli.js notes <id>                        # meeting notes URL
node cli.js folders                           # list folders
node cli.js spaces                            # list spaces
node cli.js backlinks <id>                    # external references
node cli.js user <userId>                     # user profile
node cli.js dump <id>                         # all data as JSON
```

## Auth errors

If you get auth errors, your session has expired (~30 days). Either:
- Run `node refresh.js` from the parent repo (headless, extends the session)
- Run `node login.js` from the parent repo (opens browser for fresh login)
