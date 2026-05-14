def test_me_requires_auth(client):
    response = client.get("/me")
    assert response.status_code == 401


def test_me_returns_user_info(client, make_token):
    token = make_token(sub="user-xyz", email="user@example.com")

    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "user-xyz"
    # email is parsed from JWT claims for now; Plan 2 will fetch from auth.users
    assert body["email"] == "user@example.com"
    assert body["workspaces"] == []
