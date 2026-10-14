"""What a meeting produces: shared notes, action items and the chat.

Notes and action items are written by people in the room over the WebSocket;
action items can also be ticked off later, from the Action items page.
"""

from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import DomainError
from app.models import ActionItem, ChatMessage, Meeting, Note, Participant, User
from app.models.action_item import MAX_ACTION_ITEMS_PER_MEETING
from app.models.note import MAX_NOTES_PER_MEETING
from app.schemas.meeting_record import ActionItemIn, ActionItemUpdate

# How much chat a browser gets when it joins or reconnects.
CHAT_HISTORY_LIMIT = 200


class NotAllowedError(DomainError):
    status_code = 403
    message = "Only the person who added this, or the host, can remove it."


class RecordNotFoundError(DomainError):
    status_code = 404
    message = "That item no longer exists."


@dataclass(frozen=True)
class Actor:
    """Who is acting in the room: their attendance record and whether they host."""

    participant_id: int
    name: str
    is_host: bool


# --- notes -------------------------------------------------------------------------------


def add_note(db: Session, meeting: Meeting, actor: Actor, text: str) -> Note:
    count = db.scalar(select(func.count()).where(Note.meeting_id == meeting.id))
    if count >= MAX_NOTES_PER_MEETING:
        raise DomainError(f"A meeting can have at most {MAX_NOTES_PER_MEETING} notes.")
    note = Note(
        meeting_id=meeting.id,
        author_participant_id=actor.participant_id,
        author_name=actor.name,
        text=text,
    )
    db.add(note)
    db.commit()
    return note


def delete_note(db: Session, meeting: Meeting, actor: Actor, note_id: int) -> None:
    note = db.get(Note, note_id)
    if note is None or note.meeting_id != meeting.id:
        raise RecordNotFoundError()
    if not actor.is_host and note.author_participant_id != actor.participant_id:
        raise NotAllowedError()
    db.delete(note)
    db.commit()


# --- action items ------------------------------------------------------------------------


def add_action_item(db: Session, meeting: Meeting, actor: Actor, data: ActionItemIn) -> ActionItem:
    count = db.scalar(select(func.count()).where(ActionItem.meeting_id == meeting.id))
    if count >= MAX_ACTION_ITEMS_PER_MEETING:
        raise DomainError(
            f"A meeting can have at most {MAX_ACTION_ITEMS_PER_MEETING} action items."
        )
    item = ActionItem(
        meeting_id=meeting.id,
        text=data.text,
        due_date=data.due_date,
        created_by_participant_id=actor.participant_id,
    )
    _set_owner(db, meeting, item, data.owner_participant_id, data.owner_name)
    db.add(item)
    db.commit()
    return item


def update_action_item(
    db: Session, meeting: Meeting, item_id: int, data: ActionItemUpdate
) -> ActionItem:
    """Anyone in the meeting may edit or tick off an action item, like a shared document."""
    item = _item_in_meeting(db, meeting, item_id)
    changes = data.model_dump(exclude_unset=True)
    if "text" in changes and changes["text"] is not None:
        item.text = changes["text"]
    if "done" in changes and changes["done"] is not None:
        item.done = changes["done"]
    if "due_date" in changes:
        item.due_date = changes["due_date"]
    if "owner_participant_id" in changes or "owner_name" in changes:
        _set_owner(db, meeting, item, data.owner_participant_id, data.owner_name)
    db.commit()
    return item


def delete_action_item(db: Session, meeting: Meeting, actor: Actor, item_id: int) -> None:
    item = _item_in_meeting(db, meeting, item_id)
    if not actor.is_host and item.created_by_participant_id != actor.participant_id:
        raise NotAllowedError()
    db.delete(item)
    db.commit()


def list_my_action_items(db: Session, user: User) -> list[ActionItem]:
    """Items assigned to the user, and items from meetings the user hosted.

    Open items come first, the soonest due first; finished ones after.
    """
    items = db.scalars(
        select(ActionItem)
        .join(ActionItem.meeting)
        .where(or_(ActionItem.owner_user_id == user.id, Meeting.host_id == user.id))
        .options(selectinload(ActionItem.meeting))
    ).all()
    return sorted(
        items,
        key=lambda item: (
            item.done,
            item.due_date is None,
            item.due_date or item.created_at.date(),
            -item.id,
        ),
    )


def set_done_for_user(db: Session, user: User, item_id: int, done: bool) -> ActionItem:
    """Tick an item off after the meeting: allowed for its owner and the meeting's host."""
    item = db.get(ActionItem, item_id)
    if item is None or (item.owner_user_id != user.id and item.meeting.host_id != user.id):
        # The same answer whether it does not exist or is someone else's.
        raise RecordNotFoundError()
    item.done = done
    db.commit()
    return item


def _item_in_meeting(db: Session, meeting: Meeting, item_id: int) -> ActionItem:
    item = db.get(ActionItem, item_id)
    if item is None or item.meeting_id != meeting.id:
        raise RecordNotFoundError()
    return item


def _set_owner(
    db: Session,
    meeting: Meeting,
    item: ActionItem,
    participant_id: int | None,
    name: str | None,
) -> None:
    """Owner from someone in the meeting (linked to their account), a plain name, or nobody."""
    if participant_id is not None:
        participant = db.get(Participant, participant_id)
        if participant is None or participant.meeting_id != meeting.id:
            raise DomainError("The owner must be someone in this meeting.")
        item.owner_name = participant.display_name
        item.owner_user_id = participant.user_id
    else:
        item.owner_name = name
        item.owner_user_id = None


# --- chat ----------------------------------------------------------------------------------


def add_chat_message(db: Session, meeting_id: int, actor: Actor, text: str) -> ChatMessage:
    message = ChatMessage(
        meeting_id=meeting_id,
        participant_id=actor.participant_id,
        sender_name=actor.name,
        text=text,
    )
    db.add(message)
    db.commit()
    return message


def recent_chat(db: Session, meeting_id: int) -> list[ChatMessage]:
    """The latest messages, oldest first."""
    newest = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.meeting_id == meeting_id)
        .order_by(ChatMessage.id.desc())
        .limit(CHAT_HISTORY_LIMIT)
    ).all()
    return list(reversed(newest))
