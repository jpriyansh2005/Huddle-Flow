"""Room messages that move the agenda. All are host only.

agenda_next  ->  agenda_updated     start the first topic, move on, or finish
agenda_back  ->  agenda_updated     undo the last "next"
agenda_add   ->  agenda_updated     add a topic at the end
"""

from pydantic import BaseModel

from app.core.time import utc_now
from app.models import Meeting
from app.realtime.context import EventContext, Handler, change_meeting, host_only, parse
from app.schemas.meeting import AgendaItemOut, AgendaMinutes
from app.services import agenda_service


class AgendaAddIn(BaseModel):
    # Strict: "10" or true are refused rather than read as numbers.
    title: str
    duration_minutes: AgendaMinutes

    model_config = {"strict": True}


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


@host_only
async def handle_agenda_next(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        agenda_service.advance(db, meeting)
        return agenda_message(meeting)

    await change_meeting(ctx, change)


@host_only
async def handle_agenda_back(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        agenda_service.go_back(db, meeting)
        return agenda_message(meeting)

    await change_meeting(ctx, change)


@host_only
async def handle_agenda_add(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        data = parse(AgendaAddIn, payload)
        agenda_service.add_item(db, meeting, data.title, data.duration_minutes)
        return agenda_message(meeting)

    await change_meeting(ctx, change)


HANDLERS: dict[str, Handler] = {
    "agenda_next": handle_agenda_next,
    "agenda_back": handle_agenda_back,
    "agenda_add": handle_agenda_add,
}
