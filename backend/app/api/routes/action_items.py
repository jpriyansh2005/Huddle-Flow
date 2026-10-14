"""The signed-in user's action items, across all their meetings."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.models import ActionItem, User
from app.schemas.meeting_record import ActionItemOut, DoneIn, MeetingRef, MyActionItemOut
from app.services import record_service

router = APIRouter(prefix="/action-items", tags=["action items"])


def _mine(item: ActionItem, user: User) -> MyActionItemOut:
    return MyActionItemOut(
        **ActionItemOut.model_validate(item).model_dump(),
        meeting=MeetingRef.model_validate(item.meeting),
        assigned_to_me=item.owner_user_id == user.id,
    )


@router.get("", response_model=list[MyActionItemOut])
def list_mine(db: DbSession, user: CurrentUser):
    """Items assigned to you, and every item from meetings you hosted."""
    return [_mine(item, user) for item in record_service.list_my_action_items(db, user)]


@router.patch("/{item_id}", response_model=MyActionItemOut)
def set_done(item_id: int, data: DoneIn, db: DbSession, user: CurrentUser):
    """Tick an item off, or reopen it. For its owner and the meeting's host."""
    item = record_service.set_done_for_user(db, user, item_id, data.done)
    return _mine(item, user)
