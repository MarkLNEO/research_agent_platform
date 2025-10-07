#!/bin/bash

echo "🔧 Setting up local environment for Vercel development..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found. Creating from .env.example..."
    cp .env.example .env.local
fi

# Check for required variables
echo ""
echo "📋 Checking required environment variables..."

check_var() {
    if grep -q "^$1=" .env.local; then
        echo "✅ $1 is set"
        return 0
    else
        echo "❌ $1 is missing"
        return 1
    fi
}

# Check each required variable
check_var "VITE_SUPABASE_URL"
check_var "VITE_SUPABASE_ANON_KEY"
check_var "SUPABASE_URL"
check_var "SUPABASE_ANON_KEY"
check_var "SUPABASE_SERVICE_ROLE_KEY"
check_var "OPENAI_API_KEY"

# Check if service role key is missing
if ! grep -q "^SUPABASE_SERVICE_ROLE_KEY=" .env.local; then
    echo ""
    echo "⚠️  SUPABASE_SERVICE_ROLE_KEY is missing!"
    echo ""
    echo "To get your service role key:"
    echo "1. Go to https://supabase.com/dashboard"
    echo "2. Select your project"
    echo "3. Go to Settings → API"
    echo "4. Copy the 'service_role' key (under 'Project API keys')"
    echo ""
    echo "Then add it to .env.local:"
    echo "SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here"
    echo ""
    read -p "Would you like to add it now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your SUPABASE_SERVICE_ROLE_KEY: " service_key
        echo "SUPABASE_SERVICE_ROLE_KEY=$service_key" >> .env.local
        echo "✅ Added SUPABASE_SERVICE_ROLE_KEY to .env.local"
    fi
fi

echo ""
echo "📝 Current environment status:"
echo "--------------------------------"
if [ -f .env.local ]; then
    echo "Variables in .env.local:"
    grep -E "^[A-Z_]+=" .env.local | sed 's/=.*/=***/' | sed 's/^/  /'
fi

echo ""
echo "🚀 Ready to test locally!"
echo ""
echo "Run: vercel dev"
echo "This will start the development server at http://localhost:3000"