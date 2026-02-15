"""Utility for safe StreamWriter usage across LangGraph/LangChain versions."""

from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


def safe_writer(writer: Callable | None) -> Callable:
    """Wrap a LangGraph StreamWriter to handle context loss gracefully.

    LangGraph 1.0.x StreamWriter uses get_config() internally which can
    raise RuntimeError if the contextvar is lost after an async LLM call.
    This wrapper catches that error so the agent loop continues.
    """
    def _write(data: Any) -> None:
        if writer is None:
            return
        try:
            writer(data)
        except RuntimeError as e:
            if "outside of a runnable context" in str(e):
                logger.debug("StreamWriter context lost, skipping event: %s", data.get("type", "unknown"))
            else:
                raise
    return _write
