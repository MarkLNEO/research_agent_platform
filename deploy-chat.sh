#!/bin/bash
FUNCTION_NAME="chat"
SUPABASE_PROJECT_REF=$(grep VITE_SUPABASE_URL .env | cut -d'/' -f3 | cut -d'.' -f1)
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN}"

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Error: SUPABASE_ACCESS_TOKEN not set"
  exit 1
fi

echo "Deploying $FUNCTION_NAME to project $SUPABASE_PROJECT_REF..."

curl -L -X POST \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/functions/$FUNCTION_NAME" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @supabase/functions/$FUNCTION_NAME/index.ts

echo ""
echo "Deployment complete"
