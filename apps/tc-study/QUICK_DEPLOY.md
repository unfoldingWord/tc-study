# Quick Deploy to Cloudflare Pages

## One-Command Deployment

```bash
# From the tc-study directory
cd apps/tc-study

# Build and deploy
bun run build && bunx wrangler pages deploy dist --project-name=tc-study
```

## Step-by-Step

### 1. First Time Setup (One-time)

```bash
# Login to Cloudflare (opens browser)
cd apps/tc-study
bunx wrangler login
```

This will:
- Open your browser
- Ask you to authorize Wrangler
- Save your credentials locally

### 2. Deploy

```bash
# From tc-study directory
bun run build              # Build the app
bunx wrangler pages deploy dist --project-name=tc-study  # Deploy
```

### 3. Your App is Live! 🎉

After deployment, you'll see:
- Production URL: `https://tc-study.pages.dev`
- Deployment dashboard: `https://dash.cloudflare.com/pages`

## Automatic Deployments (GitHub Actions)

Once you push to GitHub with the secrets configured:

```bash
git add .
git commit -m "Deploy tc-study"
git push origin main
```

Cloudflare will automatically build and deploy!

### Required GitHub Secrets

1. `CLOUDFLARE_API_TOKEN` - Get from: https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Cloudflare Pages" template
   - Or create custom with "Cloudflare Pages: Edit" permission

2. `CLOUDFLARE_ACCOUNT_ID` - Get from: https://dash.cloudflare.com
   - Go to Pages
   - Your account ID is in the URL

## Useful Commands

```bash
# Check login status
bunx wrangler whoami

# List deployments
bunx wrangler pages deployment list --project-name=tc-study

# View logs
bunx wrangler pages deployment tail

# Delete a deployment
bunx wrangler pages deployment delete <deployment-id> --project-name=tc-study
```

## Custom Domain

1. Go to https://dash.cloudflare.com/pages
2. Select your project
3. Click "Custom domains"
4. Add your domain
5. Follow DNS instructions

## Troubleshooting

**Login fails:**
- Make sure your browser allows popups
- Try: `bunx wrangler logout` then `bunx wrangler login`

**Build fails:**
- Run `bun run build` from root first to build all packages
- Check for TypeScript errors: `bun run type-check`

**Deployment succeeds but app doesn't work:**
- Check browser console for errors
- Verify `_redirects` file is in build output
- Check Cloudflare Pages logs

**Large bundle warning:**
- Normal for this app (~4.4MB main bundle)
- Consider code-splitting for future optimization
- Preloaded resources are cached separately

## Environment Variables

If you need environment variables (API keys, etc.):

```bash
# Add via Wrangler CLI
bunx wrangler pages secret put API_KEY --project-name=tc-study

# Or via dashboard
# https://dash.cloudflare.com/pages → Settings → Environment Variables
```

## Cost

- Cloudflare Pages is **FREE** for:
  - Unlimited requests
  - Unlimited bandwidth
  - 500 builds per month
  - 20,000 files per deployment

Perfect for this project! 🎉
