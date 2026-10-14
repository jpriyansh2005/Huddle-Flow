# HuddleFlow

**Meetings that end with a plan.** HuddleFlow is a video meeting app: start a
meeting instantly, join one by meeting ID or invite link, schedule meetings,
and meet with live audio and video, screen sharing, chat, reactions and host
controls.

It began as a Zoom clone for the Scaler SDE Fullstack assignment and is being
grown into its own product, built around what a meeting leaves behind: an
agenda, shared notes, action items and a recap. See the [roadmap](#roadmap).

| | |
|---|---|
| **Live app** | https://zoom-clone-eight-sigma.vercel.app |
| **API** | https://zoom-clone-api-k4vk.onrender.com ([docs](https://zoom-clone-api-k4vk.onrender.com/docs)) |

![Dashboard](docs/screenshots/dashboard.png)

| Meeting room with the people panel | Joining from an invite link |
|---|---|
| ![Meeting room](docs/screenshots/host-controls.png) | ![Pre-join](docs/screenshots/pre-join.png) |

## Features

**Dashboard**
- Greeting, clock and four quick actions: New meeting, Join, Schedule, Share screen
- Upcoming meetings grouped by day, with Today / previous / next day controls
- Recent meetings with their real duration
- A Meetings page with Upcoming and Previous tabs
- Copy the invitation or the meeting ID, edit or delete a scheduled meeting

**Meetings**
- Instant meetings with a unique 11-digit meeting ID and an invite link (`/j/{id}`)
- Join by ID or link; a display name is required, and unknown or ended meetings are refused
- Scheduling with topic, description, date, time and duration; the link is generated when you save
- Live audio and video between participants (WebRTC), in a gallery that resizes to fit
- Mute, camera, screen sharing, chat with an unread badge, emoji reactions
- Host controls: mute everyone, mute one person, remove a person, end the meeting for all
- Reconnects automatically after a network drop; a refresh keeps your place

**Everywhere**
- Responsive: phone, tablet and desktop
- Loading, empty and error states; a notice while the free server wakes up

## Roadmap

| Step | Feature | Status |
|---|---|---|
| 0 | HuddleFlow brand: name, logo, colours, layout | Done |
| 1 | Accounts: sign up, log in, MySQL in production, database migrations | Next |
| 2 | Agenda with timers | Planned |
| 3 | Shared notes, action items and saved chat | Planned |
| 4 | Meeting recap page | Planned |
| 5 | Live captions and an AI summary | Planned |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Pydantic 2 |
| Database | SQLite |
| Realtime | WebSockets (presence, chat, signalling) and WebRTC (audio, video) |
| Tests | pytest, Vitest |
| Tooling | Ruff, ESLint, GitHub Actions |

## Run it locally

You need **Python 3.11 or newer** and **Node.js 20 or newer**. Use two
terminals, one for each app.

### 1. Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
```

```bash
# macOS or Linux
source .venv/bin/activate
```

Install the dependencies and start the server:

```bash
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

The API is now at http://localhost:8000 and its interactive documentation at
http://localhost:8000/docs. On first start it creates `backend/huddleflow.db`
and fills it with sample meetings.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

### Configuration

Both apps work locally without any configuration. To change something, copy
the example file and edit it.

| File | Variable | Default | Purpose |
|---|---|---|---|
| `backend/.env` | `FRONTEND_URL` | `http://localhost:3000` | Allowed browser origin (CORS) and the base of invite links |
| | `EXTRA_CORS_ORIGINS` | empty | More allowed origins, comma separated |
| | `CORS_ORIGIN_REGEX` | empty | Allowed origins by pattern, e.g. preview deployments |
| | `DATABASE_URL` | `backend/huddleflow.db` | Where the database is |
| | `SEED_ON_STARTUP` | `true` | Insert sample data when the database is empty |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Where the backend is |

### Try a meeting with two people

1. On the dashboard, click **New meeting**. You are in the room as the host.
2. Click the info button at the top left and copy the invite link.
3. Open the link in a **second browser window** (a private window works
   well). Enter a name and join.
4. You now see each other's video. Try chat, reactions, and the **People**
   panel, where the host can mute or remove people.

Two tabs on one computer share one microphone and speakers, so keep at least
one of them muted to avoid an echo.

### Reset the sample data

Stop the backend, delete `backend/huddleflow.db` and start it again.

## Tests and checks

```bash
cd backend
pytest
ruff check .
ruff format --check .
```

```bash
cd frontend
npm test
npm run lint
npm run typecheck
npm run build
```

The same checks run in GitHub Actions on every push
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## API

Base path: `/api/v1`. Full interactive documentation is at `/docs` on the
running backend.

| Method | Path | What it does |
|---|---|---|
| GET | `/users/me` | The signed-in user |
| GET | `/meetings/upcoming` | Scheduled meetings that have not finished |
| GET | `/meetings/recent` | Past and instant meetings |
| POST | `/meetings/instant` | Create a meeting that starts now |
| POST | `/meetings` | Schedule a meeting |
| GET | `/meetings/{id}` | Look a meeting up; used to validate an ID |
| PATCH | `/meetings/{id}` | Edit a scheduled meeting |
| DELETE | `/meetings/{id}` | Delete a meeting |
| POST | `/meetings/{id}/start` | Enter as the host |
| POST | `/meetings/{id}/join` | Enter as a guest with a display name |
| WS | `/ws/meetings/{id}?token=...` | The live room |

`{id}` is the 11-digit meeting ID. It may be sent with or without spaces.

## Database

Three tables: `users`, `meetings` and `participants`.

```mermaid
erDiagram
    USERS ||--o{ MEETINGS : hosts
    MEETINGS ||--o{ PARTICIPANTS : has
    USERS |o--o{ PARTICIPANTS : "attends as (optional)"
```

- A **user** hosts many meetings.
- A **meeting** has a public 11-digit `code`, a `kind` (instant or scheduled),
  a `status` (scheduled, live or ended), its planned time and its actual start
  and end.
- A **participant** is one person's attendance in one meeting. `user_id` is
  empty for guests, who join with only a display name.

The full schema, the reasons behind it, and how the realtime and video parts
work are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project structure

```
backend/
  app/
    api/         REST routes and shared dependencies
    realtime/    WebSocket endpoint, event handlers, in-memory rooms
    services/    Business rules
    models/      Database tables
    schemas/     Request and response validation
    db/          Engine, sessions, seed data
    core/        Settings, errors, time helpers
  tests/
frontend/
  src/
    app/         Routes: dashboard, invite link, meeting room
    components/  ui, layout, dashboard, meeting
    hooks/       Stateful logic shared by components
    lib/         API client, formatting, WebSocket and WebRTC code
docs/            Architecture notes and screenshots
render.yaml      Backend deployment blueprint
```

## Deployment

The frontend goes to **Vercel** and the backend to **Render**. Deploy the
backend first, because the frontend needs its address.

### Backend on Render

1. In Render choose **New > Blueprint** and select this repository. Render
   reads [`render.yaml`](render.yaml).
2. When asked for `FRONTEND_URL`, enter a placeholder such as
   `http://localhost:3000`. You will correct it in step 5.
3. Wait for the deploy, then copy the service address.

### Frontend on Vercel

4. In Vercel choose **Add New > Project**, import this repository, and set:
   - **Root Directory**: `frontend`
   - **Environment variable** `NEXT_PUBLIC_API_URL`: the Render address from
     step 3, with no slash at the end

   Deploy, then copy the Vercel address.
5. Back in Render, open the service's **Environment** tab, set `FRONTEND_URL`
   to the Vercel address (no slash at the end) and save. Render redeploys.

### Things to know about the free tiers

- Render's free service **sleeps after 15 minutes without traffic**. The next
  visit takes up to a minute while it wakes; the dashboard shows a notice.
- Render's free disk is **wiped on every deploy and restart**. The app
  recreates the database and sample data on startup, so meetings you created
  earlier are gone after a restart. Step 1 of the roadmap moves production to
  a hosted MySQL database.

## Assumptions

- **One default user is signed in** (Alex Morgan) until accounts arrive in
  step 1 of the roadmap.
- **Host or guest is decided by how you enter.** Starting a meeting from the
  dashboard makes you its host. Joining through the Join dialog or an invite
  link makes you a guest, even in the same browser.
- **Guests need no account**, only a display name.
- **People can join a scheduled meeting before the host** starts it, as long
  as it has not ended.
- **An instant meeting ends** one minute after the last person leaves. A
  scheduled meeting stays open until its host ends it.
- **Times are stored in UTC** and shown in each viewer's own timezone.
- **Chat and reactions are not saved yet**; they last as long as the meeting.
- **Meeting passcodes and waiting rooms are out of scope.**

## Known limitations

- **Video is peer to peer.** That suits small meetings; it has been tested
  with three participants. Large meetings would need a media server (an SFU).
- **No TURN server.** A public STUN server is enough for most home and office
  networks, but two people who are both behind strict corporate firewalls may
  not see each other's video. Presence, chat and host controls still work.
- **The backend runs as one process**, because live rooms are held in memory.
  Running several would need a shared message broker such as Redis.
- **The session token travels in the WebSocket URL**, because browsers cannot
  set headers on WebSocket connections. It is a random, single-meeting token,
  not a password, but URLs can end up in server logs.

## Use of AI tools

This project was built with Claude Code, with the commits co-authored
accordingly. The design decisions are explained in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
