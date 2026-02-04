# TC-Study Deployment Guide

## Cloudflare Pages Deployment

TC-Study is configured for deployment to Cloudflare Pages with automatic builds and deployments.

### Prerequisites

1. **Cloudflare Account**: Create a free account at [cloudflare.com](https://www.cloudflare.com)
2. **Wrangler CLI**: Install globally
   ```bash
   npm install -g wrangler
   ```
3. **Authentication**: Login to Cloudflare
   ```bash
   wrangler login
   ```

### Manual Deployment

#### From the tc-study directory:

```bash
cd apps/tc-study

# Build the app
bun run build

# Deploy to Cloudflare Pages
bun run deploy
```

#### From the root directory:

```bash
# Build all packages first
bun run build

# Deploy tc-study
cd apps/tc-study
bun run deploy
```

### Automatic Deployment (GitHub Actions)

The app is configured to automatically deploy on every push to `main`/`master` branch.

#### Setup GitHub Secrets:

1. Go to your GitHub repository settings
2. Navigate to **Secrets and variables** > **Actions**
3. Add the following secrets:

   - `CLOUDFLARE_API_TOKEN`:
     - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
     - Create a token with **Cloudflare Pages** edit permissions
     - Copy and paste the token
   
   - `CLOUDFLARE_ACCOUNT_ID`:
     - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
     - Click on Pages
     - Your Account ID is in the URL: `dash.cloudflare.com/<ACCOUNT_ID>/pages`
     - Copy and paste the Account ID

4. Push to main branch - deployment will happen automatically!

### First-Time Cloudflare Pages Setup

If the project doesn't exist yet in Cloudflare:

1. **Via Dashboard** (Recommended for first deployment):
   ```bash
   # Build first
   cd apps/tc-study
   bun run build
   
   # Deploy
   wrangler pages deploy dist --project-name=tc-study
   ```
   
   Follow the prompts to create a new project.

2. **Via Cloudflare Dashboard**:
   - Go to [Cloudflare Pages](https://dash.cloudflare.com/pages)
   - Click "Create a project"
   - Connect your GitHub repository
   - Configure build settings:
     - **Build command**: `cd apps/tc-study && bun run build`
     - **Build output directory**: `apps/tc-study/dist`
     - **Root directory**: `/`

### Build Configuration

The app uses:
- **Framework**: Vite + React
- **Build command**: `bun run build`
- **Output directory**: `dist/`
- **Node version**: 20

### Custom Domain (Optional)

1. Go to your Cloudflare Pages project
2. Navigate to **Custom domains**
3. Click **Set up a custom domain**
4. Follow the instructions to add your domain

### Environment Variables

If your app needs environment variables:

1. Go to Cloudflare Pages project
2. Navigate to **Settings** > **Environment variables**
3. Add variables for Production and Preview environments

### Caching Strategy

The deployment includes optimized caching headers:

- **Static assets**: Cached for 1 year (immutable)
- **Preloaded resources**: Cached for 24 hours with revalidation
- **HTML files**: Always revalidate
- **Service Worker**: Revalidate on every request

### SPA Routing

The `_redirects` file ensures all routes are handled by the React app for client-side routing.

### Monitoring

View deployment status and logs:
```bash
wrangler pages deployment list --project-name=tc-study
```

Or visit your [Cloudflare Dashboard](https://dash.cloudflare.com/pages).

### Troubleshooting

**Build fails:**
- Ensure all monorepo packages build successfully first: `bun run build` from root
- Check that all dependencies are listed in package.json
- Review build logs in Cloudflare Dashboard

**404 errors on routes:**
- Verify `_redirects` file is in `/public` folder
- Check that the file is included in the build output

**Slow initial load:**
- Use the bundle scripts to preload resources:
  ```bash
  bun run bundle:minimal  # Includes essential resources
  bun run bundle:full     # Includes all resources (large)
  ```

**Assets not loading:**
- Check browser console for CORS or CSP errors
- Verify `_headers` file configuration
- Check Cloudflare Page Rules

### Development vs Production

- **Development**: `bun run dev` (runs on localhost:3000)
- **Preview**: Automatic preview deployments for pull requests
- **Production**: Deploys from main/master branch

### Rollback

To rollback to a previous deployment:
1. Go to Cloudflare Pages dashboard
2. Navigate to your project
3. Click on **Deployments**
4. Find the previous successful deployment
5. Click **...** > **Rollback to this deployment**

### Support

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub Actions for Cloudflare Pages](https://github.com/cloudflare/pages-action)
