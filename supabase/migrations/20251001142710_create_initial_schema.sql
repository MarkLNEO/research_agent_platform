/*
  # Initial Database Schema for Research Agent Platform

  ## Overview
  Creates the complete database schema for a multi-agent AI research platform with:
  - User authentication and multi-tenancy support
  - Company profile management
  - Chat history and message storage
  - Research output tracking
  - Usage logging and credit system

  ## Tables Created

  ### 1. `users`
  Stores user accounts with support for individual, reseller, and client account types.
  - Hierarchical account structure (resellers can have sub-accounts)
  - Credit-based usage tracking
  - 2FA support
  
  ### 2. `company_profiles`
  Stores company configuration collected during onboarding.
  - One profile per user
  - Tracks onboarding progress
  - Stores research focus areas and data sources

  ### 3. `chats`
  Conversation threads between users and agents.
  - Can be starred for quick access
  - Linked to user account

  ### 4. `messages`
  Individual messages within chat threads.
  - Tracks tokens used per message
  - Supports user and assistant roles

  ### 5. `research_outputs`
  Completed research artifacts.
  - Typed by research category
  - Stores structured data and sources
  - Tracks token usage

  ### 6. `usage_logs`
  Audit log of all token-consuming operations.
  - Tracks tool usage
  - Supports billing and analytics

  ## Security
  - Row Level Security enabled on all tables
  - Users can only access their own data
  - Resellers can view sub-account data
  - Authentication required for all operations

  ## Notes
  - Uses UUID primary keys for security
  - JSONB for flexible metadata storage
  - Timestamps for audit trail
  - Cascading deletes to maintain referential integrity
*/

-- Users table with multi-tenancy support
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  account_type TEXT CHECK (account_type IN ('individual', 'reseller', 'client')) DEFAULT 'individual',
  parent_account_id UUID REFERENCES users(id) ON DELETE CASCADE,
  credits_remaining INTEGER DEFAULT 100,
  credits_total INTEGER DEFAULT 100,
  subscription_tier TEXT DEFAULT 'free',
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company profiles for onboarding data
CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_url TEXT,
  linkedin_url TEXT,
  youtube_channel TEXT,
  additional_sources TEXT[],
  competitors TEXT[],
  research_focus TEXT[],
  metadata JSONB DEFAULT '{}',
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 1,
  onboarding_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Chat conversations
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starred BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages within chats
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Research outputs
CREATE TABLE IF NOT EXISTS research_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  research_type TEXT CHECK (research_type IN ('company', 'prospect', 'competitive', 'market')) NOT NULL,
  subject TEXT NOT NULL,
  data JSONB NOT NULL,
  sources JSONB DEFAULT '[]',
  tokens_used INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage logs for billing and analytics
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  tokens_used INTEGER NOT NULL,
  tool_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_company_profiles_user ON company_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_research_user ON research_outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at);

-- Row Level Security Policies

-- Users: Can only see own account and sub-accounts (for resellers)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own account" ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own account" ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Resellers can view client accounts" ON users
  FOR SELECT
  TO authenticated
  USING (parent_account_id = auth.uid());

-- Company profiles: Users can only access their own
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON company_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON company_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON company_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Chats: Users can only access their own
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chats" ON chats
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own chats" ON chats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own chats" ON chats
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own chats" ON chats
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Messages: Users can only access messages in their chats
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT
  TO authenticated
  USING (
    chat_id IN (
      SELECT id FROM chats WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    chat_id IN (
      SELECT id FROM chats WHERE user_id = auth.uid()
    )
  );

-- Research outputs: Users can only access their own
ALTER TABLE research_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own research" ON research_outputs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own research" ON research_outputs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Usage logs: Users can only view their own
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON usage_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own usage" ON usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());