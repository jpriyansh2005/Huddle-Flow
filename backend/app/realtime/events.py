"""Handlers for the messages a browser sends over the meeting WebSocket.

Every message is JSON with a ``type`` field. ``EVENT_HANDLERS`` at the bottom
maps each type to the function that handles it.

Client -> server            Server -> clients
--------------------------  ------------------------------------------
media_state                 participant_updated
chat                        chat
reaction                    reaction
signal (WebRTC, to one)     signal
mute_all          (host)    force_mute + participant_updated
mute_participant  (host)    force_mute + participant_updated
remove_participant (host)   removed + participant_left
end_meeting       (host)    meeting_ended
agenda_next       (host)    agenda_updated
agenda_back       (host)    agenda_updated
agenda_add        (host)    agenda_updated
"""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy.orm import Session, sessionmaker

from app.core.exceptions import DomainError
from app.core.time import utc_now
from app.models import Meeting
from app.realtime.rooms import (
    CLOSE_MEETING_ENDED,
    CLOSE_REMOVED_BY_HOST,
    Connection,
    RoomRegistry,
)
from app.schemas.meeting import AgendaItemOut
from app.services import agenda_service, meeting_service, participant_service

MAX_CHAT_LENGTH = 1000
ALLOWED_REACTIONS = {"👏", "👍", "❤️", "😂", "😮", "🎉"}


@dataclass
class EventContext:
    """Everything a handler needs to know about where a message came from."""

    code: str
    sender: Connection
    rooms: RoomRegistry
    session_factory: sessionmaker[Session]


Handler = Callable[[EventContext, dict], Awaitable[None]]


def host_only(handler: Handler) -> Handler:
    """Ignore the message unless it was sent by the meeting's host.

    The check runs on the server because a browser can send any message it
    likes; hiding the button in the UI is not a security measure.
    """

    async def guarded(ctx: EventContext, payload: dict) -> None:
        if not ctx.sender.is_host:
            await ctx.rooms.send(
                ctx.sender, {"type": "error", "message": "Only the host can do this."}
            )
            return
        await handler(ctx, payload)

    return guarded


async def handle_media_state(ctx: EventContext, payload: dict) -> None:
    """A participant switched their microphone, camera or screen share."""
    ctx.sender.audio = bool(payload.get("audio"))
    ctx.sender.video = bool(payload.get("video"))
    ctx.sender.screen = bool(payload.get("screen"))
    await _broadcast_update(ctx, ctx.sender)


async def handle_chat(ctx: EventContext, payload: dict) -> None:
    text = str(payload.get("text", "")).strip()[:MAX_CHAT_LENGTH]
    if not text:
        return
    message = {
        "id": uuid.uuid4().hex,
        "sender_id": ctx.sender.participant_id,
        "sender_name": ctx.sender.display_name,
        "text": text,
        "sent_at": utc_now().isoformat(),
    }
    await ctx.rooms.broadcast(ctx.code, {"type": "chat", "message": message})


async def handle_reaction(ctx: EventContext, payload: dict) -> None:
    emoji = payload.get("emoji")
    if emoji not in ALLOWED_REACTIONS:
        return
    await ctx.rooms.broadcast(
        ctx.code,
        {"type": "reaction", "participant_id": ctx.sender.participant_id, "emoji": emoji},
    )


async def handle_signal(ctx: EventContext, payload: dict) -> None:
    """Pass a WebRTC offer, answer or ICE candidate to one other participant.

    The server never looks inside ``data``. Audio and video travel directly
    between browsers; this relay only helps them find each other.
    """
    target = ctx.rooms.get(ctx.code, payload.get("to"))
    if target is None:
        return
    await ctx.rooms.send(
        target,
        {"type": "signal", "from": ctx.sender.participant_id, "data": payload.get("data")},
    )


@host_only
async def handle_mute_all(ctx: EventContext, payload: dict) -> None:
    for connection in ctx.rooms.connections(ctx.code):
        if connection is not ctx.sender:
            await _force_mute(ctx, connection)


@host_only
async def handle_mute_participant(ctx: EventContext, payload: dict) -> None:
    target = ctx.rooms.get(ctx.code, payload.get("participant_id"))
    if target is not None:
        await _force_mute(ctx, target)


@host_only
async def handle_remove_participant(ctx: EventContext, payload: dict) -> None:
    target = ctx.rooms.get(ctx.code, payload.get("participant_id"))
    if target is None or target.is_host:
        return
    with ctx.session_factory() as db:
        participant_service.remove_participant(db, target.participant_id)
    # Unregister first so the target's own disconnect does not announce a
    # second "left" event.
    ctx.rooms.remove(ctx.code, target)
    await ctx.rooms.send(target, {"type": "removed"})
    await ctx.rooms.close(target, CLOSE_REMOVED_BY_HOST, "Removed by the host")
    await ctx.rooms.broadcast(
        ctx.code,
        {"type": "participant_left", "participant_id": target.participant_id, "reason": "removed"},
    )


@host_only
async def handle_end_meeting(ctx: EventContext, payload: dict) -> None:
    with ctx.session_factory() as db:
        meeting = meeting_service.get_meeting_by_code(db, ctx.code)
        meeting_service.end_meeting(db, meeting)
    for connection in ctx.rooms.clear(ctx.code):
        await ctx.rooms.send(connection, {"type": "meeting_ended"})
        await ctx.rooms.close(connection, CLOSE_MEETING_ENDED, "Meeting ended")


@host_only
async def handle_agenda_next(ctx: EventContext, payload: dict) -> None:
    await _change_agenda(ctx, agenda_service.advance)


@host_only
async def handle_agenda_back(ctx: EventContext, payload: dict) -> None:
    await _change_agenda(ctx, agenda_service.go_back)


@host_only
async def handle_agenda_add(ctx: EventContext, payload: dict) -> None:
    minutes = payload.get("duration_minutes")
    # bool is a subclass of int in Python; True must not count as 1 minute.
    if not isinstance(minutes, int) or isinstance(minutes, bool):
        await _send_error(ctx, "Give the agenda item a number of minutes.")
        return
    title = str(payload.get("title", ""))
    await _change_agenda(
        ctx, lambda db, meeting: agenda_service.add_item(db, meeting, title, minutes)
    )


def agenda_snapshot(meeting: Meeting) -> list[dict]:
    """The agenda as JSON-ready dictionaries, in order."""
    return [
        AgendaItemOut.model_validate(item).model_dump(mode="json") for item in meeting.agenda_items
    ]


def agenda_message(meeting: Meeting) -> dict:
    # server_time lets each browser correct for its own clock being off, so
    # every timer in the room shows the same remaining time.
    return {
        "type": "agenda_updated",
        "agenda": agenda_snapshot(meeting),
        "server_time": utc_now().isoformat(),
    }


async def _change_agenda(ctx: EventContext, change: Callable[[Session, Meeting], None]) -> None:
    with ctx.session_factory() as db:
        meeting = meeting_service.get_meeting_by_code(db, ctx.code)
        try:
            change(db, meeting)
        except DomainError as error:
            db.rollback()
            await _send_error(ctx, error.message)
            return
        message = agenda_message(meeting)
    await ctx.rooms.broadcast(ctx.code, message)


async def _send_error(ctx: EventContext, message: str) -> None:
    await ctx.rooms.send(ctx.sender, {"type": "error", "message": message})


async def _force_mute(ctx: EventContext, target: Connection) -> None:
    if not target.audio:
        return
    target.audio = False
    # Tell the target's browser to switch its microphone off...
    await ctx.rooms.send(target, {"type": "force_mute"})
    # ...and tell everyone that this participant is now muted.
    await _broadcast_update(ctx, target)


async def _broadcast_update(ctx: EventContext, connection: Connection) -> None:
    await ctx.rooms.broadcast(
        ctx.code, {"type": "participant_updated", "participant": connection.to_public()}
    )


EVENT_HANDLERS: dict[str, Handler] = {
    "media_state": handle_media_state,
    "chat": handle_chat,
    "reaction": handle_reaction,
    "signal": handle_signal,
    "mute_all": handle_mute_all,
    "mute_participant": handle_mute_participant,
    "remove_participant": handle_remove_participant,
    "end_meeting": handle_end_meeting,
    "agenda_next": handle_agenda_next,
    "agenda_back": handle_agenda_back,
    "agenda_add": handle_agenda_add,
}
