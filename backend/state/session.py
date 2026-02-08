"""In-memory session store for chat history and card state."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Session:
    """A chat session with message history and card state."""

    session_id: str
    messages: list[dict] = field(default_factory=list)
    cards: list[dict] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def add_message(self, role: str, content: str) -> None:
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
        })

    def add_card(self, card: dict) -> None:
        self.cards.append(card)

    def remove_card(self, card_id: str) -> None:
        self.cards = [c for c in self.cards if c.get("id") != card_id]


class SessionStore:
    """In-memory store for all active sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def get_or_create(self, session_id: str) -> Session:
        if session_id not in self._sessions:
            self._sessions[session_id] = Session(session_id=session_id)
        return self._sessions[session_id]

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


# Global singleton
session_store = SessionStore()
