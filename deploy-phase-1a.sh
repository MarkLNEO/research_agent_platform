#!/bin/bash

# Deploy Phase 1A: Account Tracking Infrastructure
# This script deploys all backend components for the account tracking feature

set -e  # Exit on any error

echo "🚀 Starting Phase 1A Deployment..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Step 1: Run database migration
echo "📊 Step 1/4: Running database migration..."
echo "  - Creating tracked_accounts table"
echo "  - Creating account_signals table"
echo "  - Adding triggers and functions"
echo ""

supabase db push

if [ $? -eq 0 ]; then
    echo "✅ Database migration completed"
else
    echo "❌ Database migration failed"
    exit 1
fi
echo ""

# Step 2: Deploy edge functions
echo "🔧 Step 2/4: Deploying edge functions..."
echo ""

echo "  Deploying dashboard-greeting..."
supabase functions deploy dashboard-greeting --no-verify-jwt

echo "  Deploying manage-accounts..."
supabase functions deploy manage-accounts --no-verify-jwt

echo "  Deploying detect-signals..."
supabase functions deploy detect-signals --no-verify-jwt

if [ $? -eq 0 ]; then
    echo "✅ All edge functions deployed"
else
    echo "❌ Edge function deployment failed"
    exit 1
fi
echo ""

# Step 3: Check environment variables
echo "🔐 Step 3/4: Checking environment variables..."
echo ""

# Get current project
PROJECT_REF=$(supabase status | grep "API URL" | awk '{print $3}' | cut -d'/' -f3 | cut -d'.' -f1)

if [ -z "$PROJECT_REF" ]; then
    echo "⚠️  Could not detect project reference"
    echo "   Make sure you're linked to a Supabase project:"
    echo "   supabase link --project-ref <your-project-ref>"
else
    echo "✅ Project: $PROJECT_REF"
fi

echo ""
echo "Please verify these environment variables are set in Supabase:"
echo "  1. OPENAI_API_KEY - Required for GPT-5 signal detection"
echo "  2. SUPABASE_URL - Auto-configured"
echo "  3. SUPABASE_ANON_KEY - Auto-configured"
echo "  4. SUPABASE_SERVICE_ROLE_KEY - Required for cron jobs"
echo ""
echo "Set them at: https://supabase.com/dashboard/project/$PROJECT_REF/settings/functions"
echo ""

# Step 4: Test deployment
echo "🧪 Step 4/4: Testing deployment..."
echo ""

# Get the project URL
SUPABASE_URL=$(supabase status | grep "API URL" | awk '{print $3}')

if [ -z "$SUPABASE_URL" ]; then
    echo "⚠️  Could not detect Supabase URL"
    echo "   Skipping automated tests"
else
    echo "Testing dashboard-greeting endpoint..."
    
    # Note: This will fail without auth, but confirms the function exists
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/functions/v1/dashboard-greeting")
    
    if [ "$RESPONSE" = "401" ]; then
        echo "✅ dashboard-greeting is deployed (returns 401 without auth - expected)"
    elif [ "$RESPONSE" = "404" ]; then
        echo "❌ dashboard-greeting not found (404)"
    else
        echo "⚠️  dashboard-greeting returned status: $RESPONSE"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Phase 1A Deployment Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Start your dev server:"
echo "   npm run dev"
echo ""
echo "2. Open http://localhost:5173 and:"
echo "   - You should see the proactive dashboard"
echo "   - Try: 'Research Boeing'"
echo "   - Try: 'Add Boeing to my accounts'"
echo ""
echo "3. (Optional) Set up automated signal detection:"
echo "   - Go to Supabase Dashboard → Database → Cron Jobs"
echo "   - Create job to call detect-signals every 6 hours"
echo ""
echo "4. Test account tracking:"
echo "   - Add accounts via chat"
echo "   - View dashboard to see tracked accounts"
echo "   - Signal detection will run on schedule"
echo ""
echo "📖 See IMPLEMENTATION_STATUS.md for detailed testing guide"
echo ""
