"""Room messages for shared notes and action items. Anyone in the room may send them.

note_add            ->  note_added
note_delete         ->  note_deleted           (the author or the host)
action_add          ->  action_item_saved
action_update       ->  action_item_saved      (anyone: it is a shared list)
action_delete       ->  action_item_deleted    (whoever added it, or the host)
"""

from pydantic import BaseModel, ConfigDict

from app.models import Meeting
from app.realtime.context import EventContext, Handler, change_meeting, parse
from app.schemas.meeting_record import (
    ActionItemIn,
    ActionItemOut,
    ActionItemUpdate,
    NoteIn,
    NoteOut,
)
from app.services import record_service


class _ById(BaseModel):
    model_config = ConfigDict(strict=True)
    id: int


class _ActionUpdateIn(ActionItemUpdate):
    id: int


def notes_snapshot(meeting: Meeting) -> list[dict]:
    return [NoteOut.model_validate(note).model_dump(mode="json") for note in meeting.notes]


def action_items_snapshot(meeting: Meeting) -> list[dict]:
    return [
        ActionItemOut.model_validate(item).model_dump(mode="json") for item in meeting.action_items
    ]


async def handle_note_add(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        note = record_service.add_note(db, meeting, ctx.actor, parse(NoteIn, payload).text)
        return {"type": "note_added", "note": NoteOut.model_validate(note).model_dump(mode="json")}

    await change_meeting(ctx, change)


async def handle_note_delete(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        note_id = parse(_ById, payload).id
        record_service.delete_note(db, meeting, ctx.actor, note_id)
        return {"type": "note_deleted", "note_id": note_id}

    await change_meeting(ctx, change)


async def handle_action_add(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        item = record_service.add_action_item(db, meeting, ctx.actor, parse(ActionItemIn, payload))
        return _saved(item)

    await change_meeting(ctx, change)


async def handle_action_update(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        data = parse(_ActionUpdateIn, payload)
        # Only the fields the browser sent; "id" says which item.
        fields = data.model_dump(exclude_unset=True, exclude={"id"})
        update = ActionItemUpdate.model_validate(fields)
        item = record_service.update_action_item(db, meeting, data.id, update)
        return _saved(item)

    await change_meeting(ctx, change)


async def handle_action_delete(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        item_id = parse(_ById, payload).id
        record_service.delete_action_item(db, meeting, ctx.actor, item_id)
        return {"type": "action_item_deleted", "action_item_id": item_id}

    await change_meeting(ctx, change)


def _saved(item) -> dict:
    return {
        "type": "action_item_saved",
        "action_item": ActionItemOut.model_validate(item).model_dump(mode="json"),
    }


HANDLERS: dict[str, Handler] = {
    "note_add": handle_note_add,
    "note_delete": handle_note_delete,
    "action_add": handle_action_add,
    "action_update": handle_action_update,
    "action_delete": handle_action_delete,
}
