# Canvas LMS MCP Server (with Automatic OAuth Authentication)

A [Model Context Protocol](https://modelcontextprotocol.io/) server for Canvas LMS that authenticates automatically using the Canvas mobile app's OAuth flow. No manual API token management required.

Fork of [DMontgomery40/mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms) (MIT) with an added authentication layer.

## How It Works

Canvas's mobile apps use an OAuth2 flow that issues **permanent refresh tokens** — tokens that never expire unless manually revoked. This server uses that same flow to authenticate, then silently refreshes access tokens in the background. You log in once and it works indefinitely.

### Authentication

1. A Chromium browser opens, emulating a **Pixel 7 Android device** — this registers as a mobile device on your Canvas account.
2. You log in through your university's **Microsoft SSO** and approve the **Duo MFA push** on your phone.
3. The server captures the OAuth tokens and stores them locally. The refresh token is permanent.
4. From then on, access tokens are refreshed automatically. No browser or interaction needed.

You should only have to authenticate once. If you have any issues, go to Settings > Access Tokens in Canvas, revoke the Pixel 7 token, and re-authenticate.

### Requirements

- **Duo Mobile** — You must have your phone available during the initial authentication to approve the push notification.
- **A display** — The browser needs a screen. On headless/SSH environments, it falls back to `xvfb-run`.
- **Python 3** — The browser login runs via a Python Playwright script. The server installs dependencies automatically on first run.

## Quick Start

Add to your Claude Code or Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "canvas-lms": {
      "command": "node",
      "args": ["/path/to/mcp-canvas-lms/build/index.js"],
      "env": {
        "CANVAS_DOMAIN": "canvas.youruniversity.ac.uk",
        "CANVAS_EMAIL": "your.email@university.ac.uk",
        "CANVAS_PASSWORD": "your-password"
      }
    }
  }
}
```

Then call `canvas_authenticate` once to log in. After that, all Canvas tools work automatically.

### Manual API Token (Alternative)

If you prefer not to use the OAuth flow, set `CANVAS_API_TOKEN` instead. Generate one at your Canvas instance under Settings > Access Tokens.

## Building from Source

```bash
git clone https://github.com/Drastixs/mcp-canvas-lms.git
cd mcp-canvas-lms
npm install
npm run build
```

## Available Tools

Over 50 tools covering courses, assignments, grades, modules, discussions, quizzes, files, calendar, messaging, user profiles, rubrics, and account administration. Call `canvas_check_auth` to verify your authentication status.

### Toolsets

To keep the tool list (and your model's context) small, only the **student** toolset is exposed by default. Enable more with `CANVAS_TOOLSETS` (comma-separated):

| Toolset | Tools |
|---|---|
| `student` (default) | Read courses, assignments, grades, modules, discussions, quizzes, files, pages, calendar, messages; submit work, post to discussions |
| `instructor` | Create/update courses, assignments and quizzes; submit grades; enroll users |
| `admin` | Account info, account courses/users, sub-accounts, create users, account reports |

Example: `"CANVAS_TOOLSETS": "student,instructor"`, or `"all"` for everything.

List tools return the first 5 items with null fields omitted; pass `include_raw: true` to get every item in full.

## Credits

- Original MCP server: [DMontgomery40/mcp-canvas-lms](https://github.com/DMontgomery40/mcp-canvas-lms) (MIT License)

## License

MIT
