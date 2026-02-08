"""Loads skill files and injects relevant content into agent system prompts."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).parent

# Map agent types to their skill files
AGENT_SKILLS: dict[str, list[str]] = {
    "troubleshooting": [
        "wireless_troubleshooting.md",
        "wan_performance.md",
    ],
    "compliance": [
        "config_audit.md",
    ],
    "security": [
        "security_posture.md",
    ],
    "discovery": [
        "network_inventory.md",
    ],
}


def load_skills_for_agent(agent_type: str) -> str:
    """Load and concatenate skill files for a given agent type.

    Returns a formatted string to be injected into the agent's system prompt.
    """
    skill_files = AGENT_SKILLS.get(agent_type, [])
    if not skill_files:
        return ""

    sections = []
    for filename in skill_files:
        filepath = SKILLS_DIR / filename
        if filepath.exists():
            content = filepath.read_text(encoding="utf-8")
            sections.append(content)
            logger.debug("Loaded skill '%s' for agent '%s'", filename, agent_type)
        else:
            logger.warning("Skill file not found: %s", filepath)

    if not sections:
        return ""

    return "\n\n## Available Skills\n\n" + "\n\n---\n\n".join(sections)


def list_skills() -> list[dict[str, str]]:
    """List all available skills with their metadata."""
    skills = []
    for agent_type, skill_files in AGENT_SKILLS.items():
        for filename in skill_files:
            filepath = SKILLS_DIR / filename
            name = filename.replace(".md", "")
            description = ""
            if filepath.exists():
                # Read the first line after the title for a description
                lines = filepath.read_text(encoding="utf-8").strip().split("\n")
                for line in lines:
                    if line.startswith("## Trigger"):
                        # Next non-empty line is the trigger description
                        idx = lines.index(line)
                        if idx + 1 < len(lines):
                            description = lines[idx + 1].strip()
                        break
            skills.append({
                "name": name,
                "agent": agent_type,
                "file": filename,
                "description": description,
            })
    return skills
