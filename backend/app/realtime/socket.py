"""The WebSocket endpoint each browser keeps open while it is in a meeting."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, sessionmaker
from starlette.websockets import WebSocketState

from app.core.config import get_settings
from app.core.exceptions import MeetingNotFoundError
from app.core.time import utc_now
from app.db.session import get_session_factory
from app.models import MeetingKind, MeetingStatus
from app.realtime.events import EVENT_HANDLERS, EventContext, agenda_snapshot
from app.realtime.rooms import CLOSE_INVALID_SESSION, CLOSE_REPLACED, Connection, rooms
from app.services import meeting_service, participant_service

router = APIRouter()

# asyncio only keeps weak references to tasks, so running ones are held here.
_background_tasks: set[asyncio.Task] = set()


@router.websocket("/ws/meetings/{code}")
async def meeting_socket(
    websocket: WebSocket,
    code: str,
    token: Annotated[str, Query()],
    session_factory: Annotated[sessionmaker[Session], Depends(get_session_factory)],
) -> None:
    await websocket.accept()

    with session_factory() as db:
        participant = participant_service.get_active_session(db, code, token)
        if participant is not None:
            participant_service.mark_connected(db, participant.id)
            agenda = agenda_snapshot(participant.meeting)
    if participant is None:
        await websocket.close(code=CLOSE_INVALID_SESSION, reason="Invalid or expired session")
        return

    connection = Connection(
        websocket=websocket,
        participant_id=participant.id,
        display_name=participant.display_name,
        role=participant.role,
    )
    replaced = rooms.add(code, connection)
    if replaced is not None:
        await rooms.close(replaced, CLOSE_REPLACED, "Connected from another tab")

    # The newcomer gets the full room; everyone else hears about the newcomer.
    await rooms.send(
        connection,
        {
            "type": "room_state",
            "self_id": connection.participant_id,
            "participants": [member.to_public() for member in rooms.connections(code)],
            "agenda": agenda,
            "server_time": utc_now().isoformat(),
        },
    )
    await rooms.broadcast(
        code,
        {"type": "participant_joined", "participant": connection.to_public()},
        exclude=connection.participant_id,
    )

    context = EventContext(
        code=code, sender=connection, rooms=rooms, session_factory=session_factory
    )
    try:
        # A handler can close this socket itself (the host ending the meeting),
        # so the state is checked before each read.
        while websocket.application_state == WebSocketState.CONNECTED:
            try:
                message = await websocket.receive_json()
            except ValueError:
                continue  # not valid JSON: ignore it and keep the connection
            handler = EVENT_HANDLERS.get(message.get("type")) if isinstance(message, dict) else None
            if handler is not None:
                await handler(context, message)
    except WebSocketDisconnect:
        pass
    finally:
        await _on_disconnect(code, connection, session_factory)


async def _on_disconnect(
    code: str, connection: Connection, session_factory: sessionmaker[Session]
) -> None:
    # False means this socket was already replaced, removed or the meeting
    # ended, and whoever did that has announced it.
    if not rooms.remove(code, connection):
        return
    with session_factory() as db:
        participant_service.mark_left(db, connection.participant_id)
    await rooms.broadcast(
        code, {"type": "participant_left", "participant_id": connection.participant_id}
    )
    if rooms.is_empty(code):
        task = asyncio.create_task(_end_if_abandoned(code, session_factory))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)


async def _end_if_abandoned(code: str, session_factory: sessionmaker[Session]) -> None:
    """End an instant meeting once everyone has left.

    The wait gives someone who is only refreshing the page time to reconnect.
    Scheduled meetings are left alone so they can be started again until
    their planned end time.
    """
    await asyncio.sleep(get_settings().empty_room_grace_seconds)
    if not rooms.is_empty(code):
        return
    with session_factory() as db:
        try:
            meeting = meeting_service.get_meeting_by_code(db, code)
        except MeetingNotFoundError:
            return
        if meeting.kind == MeetingKind.INSTANT and meeting.status == MeetingStatus.LIVE:
            meeting_service.end_meeting(db, meeting)
