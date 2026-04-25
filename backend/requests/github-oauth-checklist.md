# GitHub OAuth Setup and Manual Test Checklist

Use this checklist whenever GitHub OAuth app settings change.

## 1) GitHub OAuth App Setup (Developer Settings)

- Create/update OAuth App in GitHub Developer Settings.
- Set Homepage URL to frontend URL (example: http://localhost:5173).
- Set Authorization callback URL to backend callback endpoint:
  - http://localhost:5000/auth/github/callback
- Copy Client ID and Client Secret into backend `.env`:
  - GITHUB_CLIENT_ID
  - GITHUB_CLIENT_SECRET

## 2) Scope Verification

Backend authorization request should include:

- repo
- read:user
- user:email

Current implementation builds GitHub auth URL from:

- GET /auth/github

## 3) Manual Browser Flow Test

1. Start backend and frontend.
2. Open login/signup page and click "GitHub".
3. Confirm consent page requests repository and user scopes.
4. Complete login and verify redirect to frontend callback route.
5. Confirm access token is saved in browser storage and user reaches dashboard.
6. Verify backend does not return OAuth state mismatch errors.

## 4) Quick Debug Checks

- If redirect fails: verify callback URL exactly matches GitHub app settings.
- If invalid_client: verify client ID/secret values and restart backend.
- If scope missing: inspect `/auth/github` redirect URL query `scope` value.
