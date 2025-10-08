# Bulk Research Feature Implementation

## Overview
Created a comprehensive bulk research system that allows users to upload CSV files and automatically run research (quick or deep) on multiple companies in the background, with progress tracking and results download.

## New Components Created

### 1. BulkResearchDialog.tsx
**Purpose**: Upload CSV and configure bulk research jobs
**Key Features**:
- CSV file upload with drag & drop
- Research type selection (Quick Brief vs Deep Intelligence)
- Preview of companies to be researched
- Integration with Edge Function for job submission
- Progress feedback and error handling

**Usage**: 
```tsx
<BulkResearchDialog 
  isOpen={bulkResearchOpen}
  onClose={() => setBulkResearchOpen(false)}
  onSuccess={(jobId, count) => console.log(`Started job ${jobId} for ${count} companies`)}
/>
```

### 2. BulkResearchStatus.tsx
**Purpose**: Display and track bulk research job progress
**Key Features**:
- Real-time job status updates (pending, running, completed, failed)
- Progress bars for running jobs
- Download results as CSV when complete
- Automatic notifications when jobs finish
- Polling for status updates every 10 seconds

**Usage**:
```tsx
<BulkResearchStatus onJobComplete={(jobId) => handleJobComplete(jobId)} />
```

### 3. Edge Function: bulk-research/index.ts
**Purpose**: Handle bulk research job creation and processing
**Key Features**:
- Creates job records in database
- Processes companies sequentially using existing chat function
- Updates progress in real-time
- Handles errors and retries
- Background processing without blocking UI

**API Endpoint**: `POST /functions/v1/bulk-research`
**Request Body**:
```json
{
  "companies": ["Boeing", "Raytheon", "Lockheed Martin"],
  "research_type": "deep"
}
```

## Database Schema Required

```sql
-- Bulk research jobs table
CREATE TABLE bulk_research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  companies TEXT[] NOT NULL,
  research_type TEXT NOT NULL CHECK (research_type IN ('quick', 'deep')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_count INTEGER NOT NULL,
  completed_count INTEGER DEFAULT 0,
  results JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE bulk_research_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bulk research jobs" ON bulk_research_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bulk research jobs" ON bulk_research_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update bulk research jobs" ON bulk_research_jobs
  FOR UPDATE USING (true);
```

## Integration Points

### Research Chat Page
Add to `src/pages/ResearchChat.tsx`:
```tsx
// State
const [bulkResearchOpen, setBulkResearchOpen] = useState(false);

// In the sidebar or main area
<BulkResearchStatus />

// Dialog
<BulkResearchDialog 
  isOpen={bulkResearchOpen}
  onClose={() => setBulkResearchOpen(false)}
  onSuccess={handleBulkResearchSuccess}
/>
```

### Dashboard Integration
Add to dashboard for easy access:
```tsx
<button onClick={() => setBulkResearchOpen(true)}>
  <Upload size={16} />
  Bulk Research
</button>
```

## User Flow

1. **Upload CSV**: User clicks "Bulk Research" and uploads CSV with company names
2. **Configure**: User selects research type (Quick Brief or Deep Intelligence)
3. **Submit**: System creates job and starts background processing
4. **Monitor**: User sees real-time progress in BulkResearchStatus component
5. **Complete**: User gets notification and can download results as CSV
6. **Results**: CSV contains company name, research output, status, and completion time

## Benefits

- **Scalable**: Processes companies sequentially to avoid overwhelming the system
- **User-friendly**: Clear progress tracking and notifications
- **Flexible**: Supports both quick and deep research modes
- **Persistent**: Jobs survive page refreshes and browser sessions
- **Downloadable**: Results exported as CSV for further analysis

## Technical Notes

- Uses existing chat Edge Function for consistency
- Non-streaming mode for bulk processing to avoid complexity
- 1-second delay between companies to prevent rate limiting
- Proper error handling and job status tracking
- Integrates with existing authentication and credit system

## Next Steps

1. Deploy the Edge Function: `supabase functions deploy bulk-research`
2. Create the database table and policies
3. Add UI integration points in ResearchChat and Dashboard
4. Test with sample CSV files
5. Monitor performance and adjust delays if needed
