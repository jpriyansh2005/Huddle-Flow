"""Handlers for the messages a browser sends over the meeting WebSocket.

Every message is JSON with a ``type`` field. ``EVENT_HANDLERS`` at the bottom
maps each type to the function that handles it. The agenda, notes and action
item messages live in their own modules (agenda_events, record_events).

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
"""

from app.models.chat_message import MAX_CHAT_LENGTH
from app.realtime import agenda_events, record_events
from app.realtime.context import EventContext, Handler, host_only
from app.realtime.rooms import CLOSE_MEETING_ENDED, CLOSE_REMOVED_BY_HOST, Connection
from app.schemas.meeting_record import ChatMessageOut
from app.services import meeting_service, participant_service, record_service

ALLOWED_REACTIONS = {"👏", "👍", "❤️", "😂", "😮", "🎉"}


async def handle_media_state(ctx: EventContext, payload: dict) -> None:
    """A participant switched their microphone, camera or screen share."""
    ctx.sender.audio = bool(payload.get("audio"))
    ctx.sender.video = bool(payload.get("video"))
    ctx.sender.screen = bool(payload.get("screen"))
    await _broadcast_update(ctx, ctx.sender)


async def handle_chat(ctx: EventContext, payload: dict) -> None:
    """Save a chat message and pass it to everyone, the sender included."""
    text = str(payload.get("text", "")).strip()[:MAX_CHAT_LENGTH]
    if not text:
        return
    with ctx.session_factory() as db:
        saved = record_service.add_chat_message(db, ctx.meeting_id, ctx.actor, text)
        message = ChatMessageOut.model_validate(saved).model_dump(mode="json")
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
    **agenda_events.HANDLERS,
    **record_events.HANDLERS,
}
