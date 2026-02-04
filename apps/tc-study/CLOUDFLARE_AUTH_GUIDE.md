# Cloudflare Authentication Guide

The OAuth login is timing out. Let's use an API token instead (more reliable).

## Method 1: API Token (Recommended)

### Step 1: Create an API Token

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **"Create Token"**
3. Click **"Use template"** next to **"Edit Cloudflare Workers"** OR **"Cloudflare Pages"**
4. Scroll down and click **"Continue to summary"**
5. Click **"Create Token"**
6. **COPY THE TOKEN** (you'll only see it once!)

### Step 2: Set the Token

**Option A: Environment Variable (Temporary - for this session)**
```bash
# Windows (PowerShell)
$env:CLOUDFLARE_API_TOKEN="your-token-here"

# Windows (CMD)
set CLOUDFLARE_API_TOKEN=your-token-here

# Linux/Mac/Git Bash
export CLOUDFLARE_API_TOKEN="your-token-here"
```

**Option B: Save in Wrangler Config (Permanent)**
```bash
cd apps/tc-study
echo "your-token-here" > .cloudflare-token
```

Then add to `.gitignore`:
```
.cloudflare-token
```

### Step 3: Get Your Account ID

1. Go to: https://dash.cloudflare.com/
2. Click on any domain or go to **Pages**
3. Your Account ID is in the URL: `dash.cloudflare.com/YOUR_ACCOUNT_ID/...`
4. Copy the Account ID (it looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

### Step 4: Deploy!

```bash
cd apps/tc-study

# Set your token (choose one method above)
export CLOUDFLARE_API_TOKEN="your-token-here"

# Deploy
bunx wrangler pages deploy dist --project-name=tc-study
```

## Method 2: Manual OAuth (If localhost works)

### If the browser didn't open:

1. **Manually open this URL in your browser:**
   ```
   https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=RANDOM&code_challenge=RANDOM&code_challenge_method=S256
   ```

2. **Click "Allow"** when prompted

3. **Retry the command quickly:**
   ```bash
   bunx wrangler login
   ```

### Troubleshooting OAuth:
- Make sure localhost:8976 isn't blocked by firewall
- Try disabling antivirus temporarily
- Check if another process is using port 8976

## Method 3: Via Cloudflare Dashboard (No CLI needed)

### One-time manual deployment:

1. Build locally:
   ```bash
   cd apps/tc-study
   bun run build
   ```

2. Go to: https://dash.cloudflare.com/pages
3. Click **"Create a project"**
4. Choose **"Direct upload"**
5. Upload the `dist` folder
6. Done! ✅

### For continuous deployment:

1. Go to: https://dash.cloudflare.com/pages
2. Click **"Create a project"**
3. Click **"Connect to Git"**
4. Select your GitHub repository
5. Configure:
   - **Build command**: `cd apps/tc-study && bun run build`
   - **Build output directory**: `apps/tc-study/dist`
   - **Root directory**: `/`
6. Click **"Save and Deploy"**

## Quick Deploy Command (Once Authenticated)

```bash
cd apps/tc-study
bun run build && bunx wrangler pages deploy dist --project-name=tc-study
```

## Verify Authentication

```bash
bunx wrangler whoami
```

Should show your account details if authenticated successfully.

## Need Help?

- **Cloudflare Docs**: https://developers.cloudflare.com/pages/
- **API Token Docs**: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- **Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/
