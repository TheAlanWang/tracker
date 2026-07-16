import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Which dotenv file to load. Defaults to .env.dev for local development;
# set APP_ENV=prd to point at hosted Supabase via .env.prd. In Railway /
# Vercel / other PaaS, vars are injected directly into the process so
# the file lookup just no-ops (BaseSettings reads env vars first).
APP_ENV = os.getenv("APP_ENV", "dev")


class Settings(BaseSettings):
    supabase_url: str
    supabase_publishable_key: str
    supabase_service_key: str
    supabase_jwt_secret: str

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # Optional — when unset, transactional emails (urgent task assignments)
    # are silently skipped so local dev / CI works without a real Resend
    # account. Set in .env.prd to enable real delivery.
    resend_api_key: str | None = None
    # Matches the Sender details configured in Supabase Auth's custom SMTP
    # (Trackly <noreply@gettrackly.dev>). Sender domain must equal the
    # product domain the email links point at — sending from a different
    # domain (the old thealanwang.xyz) pattern-matched phishing and landed
    # everything in spam. gettrackly.dev is verified in Resend (DKIM +
    # send-subdomain SPF live).
    email_sender: str = "Trackly <noreply@gettrackly.dev>"

    # Frontend origin — used for billing Checkout success/cancel redirects.
    frontend_url: str = "http://localhost:5173"

    # ---- Stripe (billing) ----
    # Optional — when unset the /billing routes return 503, so the app still
    # boots in local/CI without a Stripe account. Test-mode keys are fine:
    #   stripe_secret_key   sk_test_…   (Stripe Dashboard → Developers → API keys)
    #   stripe_webhook_secret whsec_…   (`stripe listen` output, or a dashboard endpoint)
    #   stripe_pro_price_id price_…     (the recurring "Trackly Pro" price — must be ACTIVE;
    #                                    archived prices are rejected by Checkout. Changing the
    #                                    displayed price means a NEW price id — update this too.)
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_pro_price_id: str | None = None

    # ---- Anthropic (in-app AI agent) ----
    # Optional — when unset the /agent route returns 503, so the app still
    # boots in local/CI without an Anthropic account. Set in .env.dev to
    # enable the in-project AI assistant.
    #   anthropic_api_key  sk-ant-…  (console.anthropic.com → API keys)
    anthropic_api_key: str | None = None
    # Default model for the agent loop. Sonnet 4.6 balances cost and quality
    # for tool-use; override to claude-haiku-4-5 for a cheaper option or an
    # Opus model for higher quality.
    agent_model: str = "claude-sonnet-4-6"

    model_config = SettingsConfigDict(
        env_file=f".env.{APP_ENV}",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
