"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """AgenticOps backend settings, loaded from .env file."""

    # Anthropic
    anthropic_api_key: str = ""

    # Meraki MCP (stdio)
    meraki_mcp_script: str = ""
    meraki_mcp_venv_fastmcp: str = ""

    # Meraki env vars passed to the subprocess
    meraki_api_key: str = ""
    meraki_org_id: str = ""
    meraki_active_profile: str = "caladan"
    enable_caching: bool = True
    cache_ttl_seconds: int = 300
    read_only_mode: bool = False
    enable_file_caching: bool = True
    max_response_tokens: int = 5000
    max_per_page: int = 100
    response_cache_dir: str = ""

    # Meraki multi-org profile vars (passed through to subprocess)
    meraki_profile_caladan_api_key: str = ""
    meraki_profile_caladan_org_id: str = ""
    meraki_profile_caladan_name: str = ""
    meraki_profile_launchpad_api_key: str = ""
    meraki_profile_launchpad_org_id: str = ""
    meraki_profile_launchpad_name: str = ""

    # ThousandEyes MCP (SSE)
    te_mcp_url: str = ""
    te_token: str = ""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # LLM
    model_name: str = "claude-sonnet-4-20250514"

    model_config = {
        "env_file": str(Path(__file__).resolve().parent.parent / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    def meraki_subprocess_env(self) -> dict[str, str]:
        """Environment variables to pass to the Meraki MCP subprocess."""
        env: dict[str, str] = {}
        # Pass through all MERAKI_ and caching vars
        for field_name in self.model_fields:
            value = getattr(self, field_name)
            if value and field_name.upper().startswith(("MERAKI_", "ENABLE_", "CACHE_", "READ_ONLY", "MAX_", "RESPONSE_")):
                env[field_name.upper()] = str(value)
        return env


settings = Settings()
