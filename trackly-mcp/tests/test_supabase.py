"""Supabase OAuth wrapper — exchange code, refresh token, build authorize URLs."""

import httpx
import pytest
import respx

from trackly_mcp.oauth.supabase import (
    SupabaseAuthClient,
    SupabaseAuthError,
)


@pytest.fixture
def client():
    return SupabaseAuthClient(
        supabase_url="https://test.supabase.co",
        anon_key="anon-xxx",
    )


def test_build_authorize_url_github(client):
    url = client.build_authorize_url(
        provider="github",
        redirect_to="https://mcp.test/callback",
        code_challenge="chal-abc",
        state="state-xyz",
    )
    assert url.startswith("https://test.supabase.co/auth/v1/authorize")
    assert "provider=github" in url
    assert "redirect_to=https%3A%2F%2Fmcp.test%2Fcallback" in url
    assert "code_challenge=chal-abc" in url
    assert "code_challenge_method=S256" in url
    assert "state=state-xyz" in url


def test_build_authorize_url_google(client):
    url = client.build_authorize_url(
        provider="google",
        redirect_to="https://mcp.test/callback",
        code_challenge="c",
        state="s",
    )
    assert "provider=google" in url


def test_build_authorize_url_rejects_unknown_provider(client):
    with pytest.raises(ValueError, match="provider"):
        client.build_authorize_url(
            provider="microsoft",
            redirect_to="https://mcp.test/callback",
            code_challenge="c",
            state="s",
        )


@respx.mock
async def test_exchange_code_success(client):
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(
            200,
            json={"access_token": "at", "refresh_token": "rt", "expires_in": 3600},
        )
    )
    tokens = await client.exchange_code(
        code="sb-code", code_verifier="verif-abc"
    )
    assert tokens["access_token"] == "at"
    assert tokens["refresh_token"] == "rt"


@respx.mock
async def test_exchange_code_failure_raises(client):
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(400, json={"error": "invalid_grant"})
    )
    with pytest.raises(SupabaseAuthError, match="invalid_grant"):
        await client.exchange_code(code="bad", code_verifier="v")


@respx.mock
async def test_refresh_success(client):
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(
            200, json={"access_token": "at2", "refresh_token": "rt2"}
        )
    )
    tokens = await client.refresh(refresh_token="old-rt")
    assert tokens["access_token"] == "at2"
    assert tokens["refresh_token"] == "rt2"
