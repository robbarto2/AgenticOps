"""Prompt loader - reads system prompts from markdown files."""

from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parent


def load_prompt(name: str) -> str:
    """Load a system prompt from a markdown file.

    Args:
        name: The prompt file name without extension (e.g., "discovery").

    Returns:
        The prompt text content.
    """
    path = _PROMPTS_DIR / f"{name}.md"
    return path.read_text(encoding="utf-8")
