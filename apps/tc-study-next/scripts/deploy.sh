#!/bin/bash

# TC-Study Next Cloudflare Pages Deployment Script
# Deploys the experimental fork — never the production tc-study project.

set -e  # Exit on error

echo "🚀 TC-Study Next Deployment to Cloudflare Pages"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the apps/tc-study-next directory${NC}"
    exit 1
fi

# Step 1: Quality gates (must pass — local deploy is not a skip-check path)
echo -e "${BLUE}🧪 Step 1: Running check (test + type-check + lint)...${NC}"
bun run check

# Step 2: Build the app
echo -e "${BLUE}📦 Step 2: Building the application...${NC}"
bun run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build failed - dist directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"
echo ""

# Match CI/Pages post-process (same strip as e2e + GitHub deploy)
echo -e "${BLUE}🧹 Stripping dist/preloaded JSON (deploy parity)...${NC}"
node scripts/strip-preloaded-from-dist.cjs

# Step 3: Check authentication
echo -e "${BLUE}🔐 Step 3: Checking Cloudflare authentication...${NC}"

if bunx wrangler whoami > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Already logged in to Cloudflare${NC}"
else
    echo -e "${BLUE}🔑 Please login to Cloudflare...${NC}"
    bunx wrangler login
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Login failed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Login successful!${NC}"
fi

echo ""

# Step 4: Deploy
echo -e "${BLUE}🌐 Step 4: Deploying to Cloudflare Pages...${NC}"

# Default must NOT be tc-study — that is the production Pages project.
PROJECT_NAME="${1:-tc-study-next}"

bunx wrangler pages deploy dist --project-name="$PROJECT_NAME" --branch=master

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "🔗 Your app will be available at:"
    echo -e "   ${BLUE}https://$PROJECT_NAME.pages.dev${NC}"
    echo ""
    echo -e "📊 View deployment details:"
    echo -e "   ${BLUE}https://dash.cloudflare.com/pages/${NC}"
    echo ""
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi
