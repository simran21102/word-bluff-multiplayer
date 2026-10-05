# Word Bluff

Word Bluff is a real-time multiplayer bluffing party game for 2–8 players. The Node/Express/Socket.IO server is authoritative for rooms, phases, submissions, votes, scoring, and disconnect handling. The React/Vite client receives only the state appropriate to the current player.

## Local development

Requirements: Node.js 18+ and npm 9+.

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173` in two or more browser windows/devices. Create a room in one, enter its six-character code in the others, then start with at least two players.

Useful commands:

```bash
npm test       # server game-engine tests
npm run build  # production client build
npm start      # production server (serves client/dist when present)
```

## Environment

- `PORT`: HTTP/Socket.IO port. Render provides this automatically; local development falls back to `3001`.
- `CLIENT_URL`: allowed frontend origin. Locally use `http://localhost:5173`; in production use the Render Static Site URL.
- `VITE_SERVER_URL`: backend URL baked into the Vite build. Locally use `http://localhost:3001`; for the Render Static Site use the backend Web Service HTTPS URL.

## Deploying to Render

Create two Render services from the same repository. Deploy the backend first so you have its public URL.

### 1. Backend Web Service

Create a **Web Service** with:

- Root Directory: leave blank (repository root)
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Set these environment variables in Render:

```text
CLIENT_URL=https://your-frontend.onrender.com
```

Render supplies `PORT` automatically. Do not hard-code it in Render; the server uses `3001` only as the local fallback. The server binds to `0.0.0.0` and Socket.IO remains available through the Web Service URL. Use a plan/configuration that supports WebSocket connections.

### 2. Frontend Static Site

Create a **Static Site** with:

- Root Directory: leave blank (repository root)
- Build Command: `npm install && npm run build`
- Publish Directory: `client/dist`

Set this environment variable before the build:

```text
VITE_SERVER_URL=https://your-backend.onrender.com
```

Add a rewrite rule so the client-side app fallback works:

```text
Source: /*
Destination: /index.html
Action: Rewrite
```

After the frontend has its final URL, update the backend `CLIENT_URL` value to that exact HTTPS origin and redeploy the backend. Do not include a trailing slash. The frontend does not use `localhost` when `VITE_SERVER_URL` is set; its `http://localhost:3001` fallback is for local development only.

### Local development after deployment configuration

Keep local development independent of Render by using the values in `.env.example`:

```bash
copy .env.example .env
npm run dev
```

If you use a separate frontend `.env` file, set `VITE_SERVER_URL=http://localhost:3001` there. Never commit production URLs or secrets.

## Rules and behavior

The first player is host and bluffer. The bluffer sees the secret word and submits the real definition; everyone else submits a fake. All players then vote anonymously, with self-voting rejected. Guessing the real definition earns 2 points, each vote for a fake gives its author 1 point, and the bluffer earns 1 point per fooled non-bluffer. Five rounds are played by default. A disconnected player is removed and the current phase is advanced/restarted as needed so a room cannot wait forever on them.
