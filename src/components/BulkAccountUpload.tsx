import { useState } from 'react';
import { Upload, AlertCircle, CheckCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ParsedAccount {
  company_name: string;
  company_url?: string;
  priority?: 'hot' | 'warm' | 'standard';
  notes?: string;
}

interface BulkAccountUploadProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export function BulkAccountUpload({ onClose, onSuccess }: BulkAccountUploadProps) {
  const { user } = useAuth();
  const [csvText, setCsvText] = useState('');
  // parsing state removed (unused); parsing happens inline
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedAccounts, setParsedAccounts] = useState<ParsedAccount[]>([]);
  const [uploadResult, setUploadResult] = useState<{ success: number; failed: number } | null>(null);

  const parseCSV = (text: string) => {
    setError(null);
    // parsing start

    try {
      const lines = text.split('\n').filter(line => line.trim());
      const accounts: ParsedAccount[] = [];

      // Check if first line is a header
      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes('company') || firstLine.includes('name') || firstLine.includes('url');
      const startIdx = hasHeader ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Support multiple CSV formats
        const parts = line.split(/[,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));

        if (parts.length === 0 || !parts[0]) continue;

        const account: ParsedAccount = {
          company_name: parts[0],
        };

        // Try to detect URLs
        if (parts[1]) {
          if (parts[1].includes('.') || parts[1].startsWith('http')) {
            account.company_url = parts[1].startsWith('http') ? parts[1] : `https://${parts[1]}`;
          } else if (parts[1] === 'hot' || parts[1] === 'warm' || parts[1] === 'standard') {
            account.priority = parts[1] as 'hot' | 'warm' | 'standard';
          } else {
            account.notes = parts[1];
          }
        }

        if (parts[2]) {
          if (parts[2] === 'hot' || parts[2] === 'warm' || parts[2] === 'standard') {
            account.priority = parts[2] as 'hot' | 'warm' | 'standard';
          } else if (!account.notes) {
            account.notes = parts[2];
          }
        }

        if (parts[3] && !account.notes) {
          account.notes = parts[3];
        }

        accounts.push(account);
      }

      if (accounts.length === 0) {
        throw new Error('No valid accounts found in CSV');
      }

      setParsedAccounts(accounts);
      // parsing done
    } catch (err: any) {
      setError(err.message || 'Failed to parse CSV');
      // parsing failed
    }
  };

  const uploadAccounts = async () => {
    if (!user || parsedAccounts.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const accountsToInsert = parsedAccounts.map(account => ({
        user_id: user.id,
        company_name: account.company_name,
        company_url: account.company_url,
        priority: account.priority || 'standard',
        notes: account.notes,
        monitoring_enabled: true,
      }));

      // Insert in batches of 10 to avoid overwhelming the database
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < accountsToInsert.length; i += 10) {
        const batch = accountsToInsert.slice(i, i + 10);
        const { error: insertError } = await supabase
          .from('tracked_accounts')
          .insert(batch);

        if (insertError) {
          console.error('Batch insert error:', insertError);
          failedCount += batch.length;
        } else {
          successCount += batch.length;
        }
      }

      setUploadResult({ success: successCount, failed: failedCount });

      if (successCount > 0) {
        // Trigger signal detection for new accounts
        await fetch(`/api/signals/trigger-detection`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }).catch(err => console.error('Failed to trigger signal detection:', err));

        onSuccess(successCount);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload accounts');
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Bulk Import Accounts</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {!uploadResult ? (
            <div className="space-y-6">
              {/* CSV Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paste CSV or upload file
                </label>
                <textarea
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value);
                    if (e.target.value) parseCSV(e.target.value);
                  }}
                  placeholder="Company Name, URL (optional), Priority (optional), Notes (optional)
Boeing, boeing.com, hot, Defense contractor
Lockheed Martin, lockheedmartin.com, warm
Raytheon Technologies"
                  className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />

                <div className="mt-3 flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm font-medium">Upload CSV</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <span className="text-xs text-gray-500">
                    Supports: company name, URL, priority (hot/warm/standard), notes
                  </span>
                </div>
              </div>

              {/* Parsed Preview */}
              {parsedAccounts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-700">
                      Preview ({parsedAccounts.length} accounts)
                    </h3>
                    {parsedAccounts.length > 5 && (
                      <span className="text-xs text-gray-500">Showing first 5</span>
                    )}
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {parsedAccounts.slice(0, 5).map((account, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2 text-sm text-gray-900">{account.company_name}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{account.company_url || '-'}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                account.priority === 'hot' ? 'bg-red-100 text-red-800' :
                                account.priority === 'warm' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {account.priority || 'standard'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={uploadAccounts}
                  disabled={parsedAccounts.length === 0 || uploading}
                  className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {uploading ? 'Uploading...' : `Import ${parsedAccounts.length} Accounts`}
                </button>
              </div>
            </div>
          ) : (
            // Success State
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Import Complete!</h3>
              <p className="text-sm text-gray-600 mb-1">
                Successfully imported {uploadResult.success} account{uploadResult.success !== 1 ? 's' : ''}
              </p>
              {uploadResult.failed > 0 && (
                <p className="text-sm text-red-600">
                  Failed to import {uploadResult.failed} account{uploadResult.failed !== 1 ? 's' : ''}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-4">
                Signal detection has been triggered for new accounts.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
