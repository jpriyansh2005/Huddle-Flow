"""What every WebSocket message handler shares: its context and small helpers."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session, sessionmaker

from app.core.exceptions import DomainError
from app.models import Meeting
from app.realtime.rooms import Connection, RoomRegistry
from app.services import meeting_service
from app.services.record_service import Actor


@dataclass
class EventContext:
    """Everything a handler needs to know about where a message came from."""

    code: str
    meeting_id: int
    sender: Connection
    rooms: RoomRegistry
    session_factory: sessionmaker[Session]

    @property
    def actor(self) -> Actor:
        return Actor(
            participant_id=self.sender.participant_id,
            name=self.sender.display_name,
            is_host=self.sender.is_host,
        )


Handler = Callable[[EventContext, dict], Awaitable[None]]


def host_only(handler: Handler) -> Handler:
    """Ignore the message unless it was sent by the meeting's host.

    The check runs on the server because a browser can send any message it
    likes; hiding the button in the UI is not a security measure.
    """

    async def guarded(ctx: EventContext, payload: dict) -> None:
        if not ctx.sender.is_host:
            await send_error(ctx, "Only the host can do this.")
            return
        await handler(ctx, payload)

    return guarded


async def send_error(ctx: EventContext, message: str) -> None:
    """Tell only the sender that their message was refused, and why."""
    await ctx.rooms.send(ctx.sender, {"type": "error", "message": message})


Model = TypeVar("Model", bound=BaseModel)


def parse(model: type[Model], payload: dict) -> Model:
    """Validate a message with a Pydantic schema; problems become a DomainError."""
    try:
        return model.model_validate(payload)
    except ValidationError as error:
        first = error.errors()[0]
        field = ".".join(str(part) for part in first["loc"])
        raise DomainError(f"{field}: {first['msg']}") from None


async def change_meeting(
    ctx: EventContext, change: Callable[[Session, Meeting], dict | None]
) -> None:
    """Run ``change`` on this room's meeting in a short database session.

    The change returns the message to broadcast to the room (or None). A
    refused change is rolled back and only the sender hears why.
    """
    with ctx.session_factory() as db:
        meeting = meeting_service.get_meeting_by_code(db, ctx.code)
        try:
            message = change(db, meeting)
        except DomainError as error:
            db.rollback()
            await send_error(ctx, error.message)
            return
    if message is not None:
        await ctx.rooms.broadcast(ctx.code, message)
