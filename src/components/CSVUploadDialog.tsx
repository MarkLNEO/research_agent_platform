import { useState, useRef } from 'react';
import { Upload, X, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { bulkAddAccounts, parseAccountsCSV } from '../services/accountService';
import { useToast } from './ToastProvider';
import { supabase } from '../lib/supabase';

interface CSVUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (addedCount: number) => void;
}

export function CSVUploadDialog({ isOpen, onClose, onSuccess }: CSVUploadDialogProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    added: number;
    skipped: number;
    errors: number;
    details: { added: string[]; skipped: string[]; errors: string[] };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (uploadedFile: File) => {
    setError(null);
    setResult(null);

    // Validate file type
    if (!uploadedFile.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setFile(uploadedFile);

    // Read and parse the file
    try {
      const text = await uploadedFile.text();
      const parsed = parseAccountsCSV(text);
      setPreview(parsed.slice(0, 10)); // Show first 10 rows
    } catch (err: any) {
      setError(`Failed to parse CSV: ${err.message}`);
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file || preview.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const response = await bulkAddAccounts(preview);
      setResult({
        added: response.summary.added,
        skipped: response.summary.skipped,
        errors: response.summary.errors,
        details: {
          added: response.added.map(a => a.company_name),
          skipped: response.skipped,
          errors: response.errors
        }
      });

      if (onSuccess && response.summary.added > 0) {
        onSuccess(response.summary.added);
      }

      // Kick off refresh for newly added accounts and alert when completed
      try {
        addToast({ type: 'info', title: 'Starting research', description: 'Refreshing newly added accounts…' });
        const { data: { session } } = await supabase.auth.getSession();
        const authHeader = session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {} as any;
        const refreshRes = await fetch(`/api/accounts/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          const processed = Number(data?.processed ?? 0);
          addToast({ type: 'success', title: 'Research complete', description: `Processed ${processed} account${processed === 1 ? '' : 's'}.` });
          // Trigger sidebar refresh
          window.dispatchEvent(new CustomEvent('accounts-updated'));
        } else {
          addToast({ type: 'error', title: 'Refresh failed', description: 'Could not start research refresh for accounts.' });
        }
      } catch (_) {
        addToast({ type: 'error', title: 'Refresh error', description: 'There was a problem refreshing accounts.' });
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const template = `company_name,company_url,industry,employee_count
Boeing,https://boeing.com,Aerospace & Defense,170000
Lockheed Martin,https://lockheedmartin.com,Aerospace & Defense,114000
Raytheon,https://rtx.com,Aerospace & Defense,181000`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'accounts-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Upload Account List</h2>
            <p className="text-sm text-gray-600 mt-1">Import multiple accounts from a CSV file</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!file && !result && (
            <>
              {/* Download Template */}
              <div className="mb-4">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download CSV template
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  Required columns: company_name. Optional: company_url, industry, employee_count
                </p>
              </div>

              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">
                  Drag and drop your CSV file here
                </p>
                <p className="text-sm text-gray-600 mb-4">or</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            </>
          )}

          {file && preview.length > 0 && !result && (
            <>
              {/* File Info */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                <FileText className="w-5 h-5 text-gray-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-600">{preview.length} accounts found</p>
                </div>
                <button
                  onClick={handleReset}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Remove
                </button>
              </div>

              {/* Preview Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-semibold text-gray-900">Preview (first 10 rows)</p>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Industry</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employees</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.map((account, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900">{account.company_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{account.industry || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{account.employee_count?.toLocaleString() || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              {/* Success Summary */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900">Upload Complete!</h3>
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="text-green-800">✓ {result.added} accounts added successfully</p>
                      {result.skipped > 0 && (
                        <p className="text-yellow-700">⚠ {result.skipped} accounts skipped (duplicates)</p>
                      )}
                      {result.errors > 0 && (
                        <p className="text-red-700">✗ {result.errors} accounts failed</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details */}
              {(result.details.skipped.length > 0 || result.details.errors.length > 0) && (
                <div className="space-y-3">
                  {result.details.skipped.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">Skipped (already tracked):</p>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {result.details.skipped.map((name, idx) => (
                          <li key={idx}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.details.errors.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-2">Errors:</p>
                      <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                        {result.details.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || preview.length === 0 || uploading}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Uploading...' : `Upload ${preview.length} Account${preview.length !== 1 ? 's' : ''}`}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                Upload Another
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
