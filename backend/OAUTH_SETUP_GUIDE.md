# OAuth Authentication Setup Guide

This guide explains how to set up and test Google and GitHub OAuth authentication.

## 🎯 What This Does

Users can sign in to the app using:
- ✅ Email & Password (local authentication)
- ✅ Google Account (OAuth)
- ✅ GitHub Account (OAuth)
- ✅ Guest Mode (no credentials needed)

## 🔧 Setup Instructions

### Prerequisites
- Node.js installed
- PostgreSQL/Supabase database running
- Google and GitHub accounts

### Step 1: Clone and Install

```bash
git clone <your-repo-url>
cd backend
npm install
```

### Step 2: Database Setup

1. Create a PostgreSQL database (or use Supabase)
2. Copy `.env.example` to `.env`
3. Update database credentials in `.env`:

```env
SUPABASE_URI=postgresql://user:password@host:port/database
PORT=5000
```

### Step 3: Get OAuth Credentials

#### **Google OAuth Setup**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen if prompted:
   - User Type: **External**
   - App name: `CodeMap` (or your app name)
   - User support email: your email
   - Developer contact: your email
6. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: `CodeMap Local Dev`
   - Authorized redirect URIs: `http://localhost:5000/auth/google/callback`
7. Copy **Client ID** and **Client Secret**

#### **GitHub OAuth Setup**

1. Go to [GitHub Settings → Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** `CodeMap Local Dev`
   - **Homepage URL:** `http://localhost:5000`
   - **Authorization callback URL:** `http://localhost:5000/auth/github/callback`
4. Click **Register application**
5. Copy **Client ID**
6. Click **Generate a new client secret** → Copy the secret

### Step 4: Update .env File

Add your OAuth credentials to `backend/.env`:

```env
# Database
SUPABASE_URI=your-database-connection-string
PORT=5000

# JWT Secrets (generate random strings)
JWT_SECRET=your-secure-jwt-secret-key-here
JWT_REFRESH_SECRET=your-secure-refresh-secret-key-here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth  
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**⚠️ Security Note:** Never commit the `.env` file with real credentials!

### Step 5: Start the Server

```bash
npm run dev
```

You should see:
```
Database connection initialized successfully
Server active at: http://localhost:5000
```

## 🧪 Testing Authentication

### Method 1: Using HTTP Client (REST Client/Postman)

Open `Req.http` file in VS Code and run tests 1-12 for email/password/guest authentication.

### Method 2: Using Browser (Required for OAuth)

#### Test Email/Password Registration:
```bash
# Using curl or Postman
POST http://localhost:5000/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "SecurePass123!"
}
```

#### Test Google OAuth:
1. Open browser
2. Navigate to: `http://localhost:5000/auth/google`
3. Choose a Google account
4. Grant permissions
5. You'll see JSON response with user and tokens

#### Test GitHub OAuth:
1. Open browser
2. Navigate to: `http://localhost:5000/auth/github`
3. Log in with GitHub
4. Click "Authorize"
5. You'll see JSON response with user and tokens

### Method 3: Complete Test Suite

Use the comprehensive tests in `Req.http`:
- Tests 1-12: Email/password/guest/token refresh
- Tests 13-14: OAuth (must use browser)

## 📊 Verify in Database

After testing, check your database to verify users were created:

```sql
SELECT id, username, email, "authProvider", "isGuest", "createdAt" 
FROM "User" 
ORDER BY "createdAt" DESC;
```

You should see users with:
- `authProvider: 'local'` for email/password
- `authProvider: 'google'` for Google OAuth
- `authProvider: 'github'` for GitHub OAuth
- `authProvider: 'guest'` for guest users

## 🔁 Testing OAuth Repeatedly

To test OAuth flow multiple times:

**Option 1: Revoke Access**
- Google: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → Remove app
- GitHub: [github.com/settings/applications](https://github.com/settings/applications) → Revoke app

**Option 2: Use Different Accounts**
- Test with different Google/GitHub accounts
- Each new account goes through full OAuth flow

**Option 3: Use Incognito/Private Window**
- Opens fresh session without cached authentication
- Still requires revoking if you want to see the full auth flow

## 🐛 Troubleshooting

### "Client ID not found" or "Invalid credentials"
- Double-check `.env` file has correct OAuth credentials
- Ensure no extra spaces or quotes around values
- Restart server after changing `.env`

### "Redirect URI mismatch"
- Ensure callback URLs in Google/GitHub match exactly:
  - Google: `http://localhost:5000/auth/google/callback`
  - GitHub: `http://localhost:5000/auth/github/callback`
- Check for trailing slashes or http vs https

### "No email provided by GitHub"
- GitHub user has email set to private
- App will create user with placeholder email
- This is normal behavior for very private accounts

### Database connection errors
- Verify `SUPABASE_URI` is correct
- Check if database is running
- Ensure user table exists (auto-created with TypeORM)

### Port already in use
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:5000 | xargs kill -9
```

## 🔒 Security Checklist

Before sharing with team:
- ✅ `.env` file in `.gitignore`
- ✅ `.env.example` provided without real credentials
- ✅ Passwords hashed (bcrypt) - already implemented
- ✅ JWT tokens properly signed
- ✅ HTTP-only cookies for refresh tokens
- ✅ No sensitive data in error messages

## 📦 What's Included

### Files to Review:
- `src/modules/auth/` - Authentication logic
- `src/utils/oauth.util.ts` - OAuth strategies
- `src/utils/jwt.util.ts` - JWT token handling
- `src/utils/password.util.ts` - Password hashing
- `Req.http` - Test requests

### Test Cases Covered:
- ✅ User registration with validation
- ✅ User login with credentials
- ✅ Guest user creation
- ✅ Token refresh mechanism
- ✅ User logout
- ✅ Google OAuth login
- ✅ GitHub OAuth login
- ✅ Email format validation
- ✅ Password strength validation
- ✅ Duplicate email prevention
- ✅ Invalid credentials handling

## 🚀 Next Steps

After successful setup:
1. Test all authentication methods
2. Verify users in database
3. Try protected routes (if implemented)
4. Check error handling with invalid data
5. Test token refresh and logout flows

## 📞 Need Help?

Common commands:
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests (if implemented)
npm test

# Build for production
npm run build
```

---

**Last Updated:** March 2026  
**Version:** 1.0.0  
**Maintained By:** Your Team Name
