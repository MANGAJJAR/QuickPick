"""Repository for ``users/{uid}``."""

from __future__ import annotations

from app.shared.models import User
from app.shared.repository import BaseRepository


class UserRepository(BaseRepository[User]):
    """Firestore access for user profiles."""

    collection_name = "users"
    model = User
