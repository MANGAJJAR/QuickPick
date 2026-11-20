"""Application settings.

All configuration comes from environment variables (12-factor). On Cloud Run,
secrets from Google Secret Manager are injected as environment variables
(``--set-secrets``), so this module never talks to Secret Manager directly and
no secret ever lives in the repository.
"""

from __future__ import annotations

import logging
import secrets
from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Typed runtime configuration (see ``.env.example`` for every variable)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # --- runtime -------------------------------------------------------
    environment: Literal["development", "test", "staging", "production"] = "development"
    app_name: str = "QuickPick API"
    port: int = 8080
    log_level: str = "INFO"
    cors_allow_origins: str = ""  # comma-separated; empty = CORS disabled

    # --- Google / Firebase --------------------------------------------
    gcp_project_id: str | None = None
    firestore_database: str = "(default)"

    # --- pickup verification ------------------------------------------
    pickup_token_secret: SecretStr | None = None
    pickup_token_ttl_seconds: int = 600
    pickup_otp_length: int = 6
    pickup_max_verify_attempts: int = 5

    # --- discount engine (illustrative, see docs/ORDER_LIFECYCLE.md) ---
    rider_cost_saved: Decimal = Decimal("35.00")
    pickup_discount_ratio: Decimal = Decimal("0.70")
    max_pickup_discount: Decimal = Decimal("25.00")
    quickpick_fee: Decimal = Decimal("4.00")

    # --- inventory ------------------------------------------------------
    low_stock_threshold: int = 5

    # --- Gemini (reserved for the AI module; not wired yet) -----------
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.0-flash"

    @model_validator(mode="after")
    def _ensure_pickup_secret(self) -> "Settings":
        """Require a real signing secret outside dev/test; generate an ephemeral one inside."""
        if self.pickup_token_secret is None or not self.pickup_token_secret.get_secret_value():
            if self.environment in ("staging", "production"):
                raise ValueError("PICKUP_TOKEN_SECRET must be set in staging/production")
            logger.warning("PICKUP_TOKEN_SECRET not set: using an ephemeral dev secret")
            self.pickup_token_secret = SecretStr(secrets.token_urlsafe(32))
        return self

    @property
    def cors_origins(self) -> list[str]:
        """Parsed CORS origins."""
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the cached process-wide settings."""
    return Settings()
