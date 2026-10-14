# Architecture

How HuddleFlow is put together, and why. Read this alongside the code:
each section names the files it describes.

## The big picture

```mermaid
flowchart LR
    subgraph Browser
        UI[Next.js app<br/>React components]
        WS[RoomSocket]
        RTC[PeerMesh<br/>WebRTC]
    end
    subgraph Server[FastAPI process]
        REST[REST API<br/>/api/v1]
        RT[WebSocket<br/>/ws/meetings/code]
        ROOMS[(Rooms in memory)]
        DB[(SQLite)]
    end
    Other[Other participants'<br/>browsers]

    UI -- HTTP / JSON --> REST
    WS <-- JSON events --> RT
    REST --> DB
    RT --> DB
    RT --> ROOMS
    RTC <-- audio and video,<br/>directly --> Other
```

There are three kinds of traffic:

| Traffic | Carries | Why this transport |
|---|---|---|
| REST over HTTP | Creating, listing, scheduling, joining | Request and response; easy to test and cache |
| WebSocket | Who is in the room, chat, mute state, host actions, WebRTC handshakes | The server must push events to browsers at any moment |
| WebRTC (peer to peer) | Audio and video | Media goes straight between browsers, so the server never handles video |

## Backend

`backend/app` is split into layers. Each layer only calls the one below it.

```
api/routes/     HTTP endpoints. Read the request, call a service, shape the response.
realtime/       The WebSocket endpoint, its event handlers and the room registry.
services/       The rules: what makes a meeting upcoming, who may start it, and so on.
models/         SQLAlchemy tables.
schemas/        Pydantic request and response shapes (validation lives here).
db/             Engine, session, shared column types, migrations runner, seed data.
core/           Settings, domain errors, time helpers.
```

Decisions worth knowing:

- **Thin routes, rules in services.** `api/routes/meetings.py` has no `if`
  statements about business rules. `services/meeting_service.py` can be tested
  and reused (the WebSocket layer calls it too) without HTTP.
- **Domain errors carry their HTTP status.** Services raise errors such as
  `MeetingNotFoundError` from `core/exceptions.py`. One handler in `main.py`
  converts any of them to `{"detail": "..."}`, the same shape FastAPI uses for
  its own errors, so the frontend parses one format.
- **One place decides who the user is.** `api/deps.py::get_current_user`
  reads the session cookie and returns the signed-in user, or answers 401.
  Routes just declare `user: CurrentUser`; the join route uses
  `OptionalUser`, because guests have no account.
- **All times are UTC.** `db/base.py::UTCDateTime` converts on the way into
  the database and tags values as UTC on the way out. The API rejects
  timestamps that have no timezone. The browser converts to local time.
- **One schema, two databases.** Production runs on MySQL 8; development and
  tests use SQLite. `db/base.py` hides the differences: tokens use a binary
  collation on MySQL (it compares text case-insensitively by default), and
  datetimes keep microseconds. CI runs every test on both.
- **The schema is versioned.** Alembic migrations in `backend/migrations` are
  applied when the app starts (`db/migrate.py`). Migrations are written with
  plain SQLAlchemy types, so later changes to the app cannot break old ones.
  A test checks that the migrations build exactly what the models describe.
- **The demo is always ready.** When the database has no meetings, startup
  gives the demo account sample meetings, so a fresh deploy is never empty.

### Database schema

```mermaid
erDiagram
    USERS ||--o{ USER_SESSIONS : "signed in as"
    USERS ||--o{ MEETINGS : hosts
    MEETINGS ||--o{ PARTICIPANTS : has
    USERS |o--o{ PARTICIPANTS : "attends as (optional)"

    USERS {
        int id PK
        string name
        string email UK "lower case"
        string password_hash "Argon2"
        datetime created_at
    }
    USER_SESSIONS {
        int id PK
        int user_id FK
        string token_hash UK "SHA-256 of the cookie token"
        datetime created_at
        datetime expires_at
    }
    MEETINGS {
        int id PK
        string code UK "public 11-digit meeting ID"
        int host_id FK
        string title
        text description
        string kind "instant | scheduled"
        string status "scheduled | live | ended"
        datetime scheduled_start "scheduled meetings only"
        int duration_minutes "scheduled meetings only"
        datetime started_at
        datetime ended_at
        datetime created_at
        datetime updated_at
    }
    PARTICIPANTS {
        int id PK
        int meeting_id FK
        int user_id FK "null for guests"
        string display_name
        string role "host | participant"
        string session_token UK
        datetime joined_at
        datetime left_at
        datetime removed_at
    }
```

Why it is shaped this way:

- **`meetings.code` is separate from `meetings.id`.** The code is what people
  type and share. Keeping the numeric primary key out of links means row
  counts and neighbouring meetings cannot be guessed from a link. Codes are
  generated with `secrets`, not `random`, so they are not predictable.
- **`participants.user_id` is nullable.** Guests join from a link with only a
  display name and have no account. A participant row is one attendance: it
  records who came, as what role, and when they joined and left.
- **`participants.session_token`** is a random secret given to the browser on
  join. It is how the WebSocket knows who is connecting, since guests cannot
  log in.
- **`removed_at`** stops someone the host removed from reconnecting with the
  same session.
- **Planned and actual times are separate columns.** `scheduled_start` and
  `duration_minutes` are the plan; `started_at` and `ended_at` are what
  happened. The "Recent" list shows the real length of a meeting.
- **Microphone and camera state are not stored.** They change many times a
  minute and mean nothing after the meeting, so they live in memory.
- **Constraints back up the code.** Enums are `VARCHAR` with `CHECK`
  constraints, which both SQLite and MySQL 8 enforce; a `CHECK` makes sure a scheduled
  meeting has a start and a duration; deleting a meeting cascades to its
  participants; foreign keys are switched on for every connection because
  SQLite ignores them by default.
- **Indexes match the queries.** Unique indexes on `code`, `email` and
  `session_token` serve the lookups; `(host_id, status)` serves the dashboard
  lists.

### Meeting lifecycle

```mermaid
stateDiagram-v2
    [*] --> scheduled: schedule
    [*] --> live: new (instant) meeting
    scheduled --> live: host starts it
    live --> ended: host ends it for all
    live --> ended: instant meeting left empty
    scheduled --> [*]: deleted
    ended --> [*]: deleted
```

A scheduled meeting counts as **upcoming** until its planned end time passes
or the host ends it. Everything else is **recent**.

### Who is the host?

The entry point decides the role:

- **Start** (the dashboard's New meeting or Start buttons) calls
  `POST /meetings/{code}/start`. It requires the signed-in user to own the
  meeting and creates a `host` participant.
- **Join** (an invite link, the Join dialog or the public `/join` page) calls
  `POST /meetings/{code}/join` and always creates an ordinary `participant`.
  No account is needed; if the visitor is signed in, the attendance is linked
  to their account.

The server checks the role again on every host-only WebSocket message
(`realtime/events.py::host_only`), because a browser can send anything.

### Accounts and sessions

- **Passwords** are hashed with Argon2 (`pwdlib`). A sign-in with an unknown
  email still checks a dummy hash, so the response time does not reveal which
  emails have accounts, and both cases return the same message.
- **Sessions are stored on the server.** Signing in creates a random token;
  the browser keeps it in an `HttpOnly`, `SameSite=Lax` cookie (and `Secure`
  in production) and the `user_sessions` table keeps only its SHA-256 hash and
  an expiry date. Signing out deletes the row, so a copied cookie stops
  working at once, which a self-contained token such as a JWT cannot do.
- **One site for the browser.** The frontend calls `/api/...` on its own
  address and Next.js forwards the request to the backend (a rewrite in
  `next.config.ts`). The cookie is therefore first-party; browsers increasingly
  block cookies set by a different site. The meeting WebSocket still connects
  to the backend directly and authenticates with the meeting token.
- **Guessing is slowed down.** `core/rate_limit.py` locks an email for 15
  minutes after 5 wrong passwords.
- **Redirects are checked.** After signing in the app returns to `?next=`,
  but only if that is a path on this site (`lib/auth.ts::safeNextPath`), so a
  crafted link cannot send people to another website.
- **Signed-out visitors** are sent to `/login` by `src/proxy.ts` before the
  dashboard renders. An expired cookie gets a 401 from the API, which also
  clears the cookie and leads to sign-in, so there is no redirect loop.

### The agenda

- **Progress lives in the database, not in memory.** Each `agenda_items` row
  has `started_at` and `ended_at`. The topic being discussed is the one that
  has started and not ended. A refresh, a reconnect or even a server restart
  keeps the agenda where it was, and the recap can compare planned and actual
  minutes.
- **Three host-only room messages** change it: `agenda_next` (start the
  first topic, move on, or finish on the last), `agenda_back` (undo the last
  Next) and `agenda_add`. Each is applied by `services/agenda_service.py` and
  answered with one `agenda_updated` broadcast holding the whole agenda, so
  every browser simply replaces its copy.
- **Timers agree across clocks.** `room_state` and `agenda_updated` carry the
  server's time. Each browser keeps the difference to its own clock
  (`lib/agenda.ts::clockOffset`) and counts down in server time.
- **Replacing an agenda** deletes the old rows before inserting the new ones;
  otherwise the new topic 1 would clash with the old topic 1 on the
  `(meeting_id, position)` unique constraint. A running meeting's agenda can
  only be extended from inside the meeting, so live progress is never wiped.

## Realtime layer

Files: `backend/app/realtime/`, `frontend/src/lib/realtime/`,
`frontend/src/hooks/useMeetingRoom.ts`.

Each browser in a meeting opens one WebSocket:
`/ws/meetings/{code}?token={session_token}`. Every message is JSON with a
`type`.

| Browser sends | Server sends | Purpose |
|---|---|---|
| (on connect) | `room_state` to the newcomer, `participant_joined` to the others | Presence |
| (on disconnect) | `participant_left` | Presence |
| `media_state` | `participant_updated` | Mute and camera icons |
| `chat` | `chat` | Meeting chat |
| `reaction` | `reaction` | Emoji reactions |
| `signal` (to one person) | `signal` | WebRTC handshake |
| `mute_all`, `mute_participant` (host) | `force_mute` to the target, `participant_updated` | Host controls |
| `remove_participant` (host) | `removed` to the target, `participant_left` | Host controls |
| `end_meeting` (host) | `meeting_ended` to everyone | Host controls |

The server closes a socket with a specific code when the session is over
(removed, meeting ended, replaced by another tab), and the browser shows the
matching full-page notice. Any other close is treated as a network drop and
the browser reconnects, up to five times.

Live rooms are a dictionary in the server process
(`realtime/rooms.py::RoomRegistry`). **This is why the backend runs as a single
process.** To scale beyond one process the registry would move to Redis
pub/sub so that processes can relay events to each other.

## Audio and video (WebRTC)

File: `frontend/src/lib/realtime/peerMesh.ts`.

Every participant holds a direct connection to every other participant (a
"mesh"). Connecting two browsers takes a short handshake, relayed by the
WebSocket:

```mermaid
sequenceDiagram
    participant B as B (joining)
    participant S as Server
    participant A as A (already in the room)
    B->>S: connect WebSocket
    S->>B: room_state (A is here)
    S->>A: participant_joined (B)
    B->>A: signal: offer (via server)
    A->>B: signal: answer (via server)
    B-->>A: signal: ICE candidates (both ways)
    Note over A,B: audio and video now flow directly
```

- **The newcomer always calls.** Two browsers therefore never call each other
  at the same moment, which avoids a whole class of handshake conflicts.
- **Audio and video channels are always created**, even with the camera off.
  Turning the camera on, or switching to screen share, then only swaps the
  track with `replaceTrack`; no second handshake is needed.
- **A public STUN server** lets browsers behind home routers find each other.

Trade-off: in a mesh each person uploads their video once per other
participant, so it suits small meetings. Large meetings need a media server
(an SFU), which is what large meeting products use.

## Frontend

```
src/app/                 Routes (Next.js App Router)
  (auth)/                Sign in and sign up
  (dashboard)/           Home and Meetings, sharing the navbar and data
  join/                  Join by meeting ID without an account
  j/[code]/              The invite link: pre-join screen
  meeting/[code]/        The meeting room
src/components/
  ui/                    Generic pieces: Button, Modal, Popover, Toast...
  layout/                The app frame: top bar and navigation rail
  dashboard/             Tiles, lists, dialogs
  meeting/               Room, toolbar, panels, video tiles
src/hooks/               Stateful logic shared by components
src/lib/                 Plain TypeScript with no React: API client, formatting, WebRTC
src/proxy.ts             Sends signed-out visitors from the dashboard to sign-in
```

- **One design system.** Every colour, shadow and animation is a token in
  `app/globals.css` (indigo brand, teal accent, navy rail, a dark meeting
  room), and Tailwind generates the utilities from those tokens, so a colour
  is changed in one place.
- **It behaves as a single page application.** Pages fetch from the API in the
  browser and move between routes without reloading. The meeting screens are
  loaded with `ssr: false` because they need the camera, `sessionStorage` and
  WebSockets, which only exist in a browser.
- **All HTTP calls go through `lib/api.ts`**, which turns every failure into an
  `ApiError` with a message that can be shown to the user.
- **Logic that is not about React is not in React.** `lib/` holds plain
  functions and classes (`PeerMesh`, `RoomSocket`, `LocalDevices`,
  `computeGridLayout`), which makes them unit-testable. Hooks connect them to
  components.
- **Devices are an external system.** `LocalDevices` owns the camera and
  microphone tracks; React subscribes with `useSyncExternalStore` rather than
  copying browser objects into state.
- **The dashboard shares one data source.** `DashboardProvider` loads the user
  and both meeting lists once and owns the dialogs, so Home and Meetings stay
  in sync after every change.
- **The session is per tab.** `lib/session.ts` keeps it in `sessionStorage`, so
  a refresh keeps your place in the meeting, and a second tab opened from the
  invite link is a separate participant.

## Testing

| Suite | Where | What it covers |
|---|---|---|
| Backend (pytest) | `backend/tests` | REST endpoints, validation, the WebSocket protocol including host controls, seed data |
| Frontend (Vitest) | `frontend/src/lib/*.test.ts` | Meeting ID parsing, date formatting, gallery layout |
| CI (GitHub Actions) | `.github/workflows/ci.yml` | Lint, type-check, tests and a production build on every push |

Backend tests run against an in-memory SQLite database, a fresh one per test.
