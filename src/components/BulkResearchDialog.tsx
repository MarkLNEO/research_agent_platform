import { useState, useRef } from 'react';
import { Upload, X, FileText, AlertCircle, Download, Search, Clock } from 'lucide-react';
import { parseAccountsCSV } from '../services/accountService';
import { useToast } from './ToastProvider';
import { supabase } from '../lib/supabase';

interface BulkResearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (jobId: string, companyCount: number) => void;
}


export function BulkResearchDialog({ isOpen, onClose, onSuccess }: BulkResearchDialogProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [researchType, setResearchType] = useState<'quick' | 'deep'>('quick');
  const [uploading, setUploading] = useState(false);
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

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setFile(selectedFile);
    setError(null);

    try {
      const csvText = await selectedFile.text();
      const accounts = parseAccountsCSV(csvText);
      setPreview(accounts.slice(0, 10)); // Show first 10 for preview
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      setFile(null);
      setPreview([]);
    }
  };

  const handleSubmit = async () => {
    if (!file || preview.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      // Parse full CSV for submission
      const csvText = await file.text();
      const allAccounts = parseAccountsCSV(csvText);
      const companies = allAccounts.map(account => account.company_name);

      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Submit bulk research job to Edge Function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-research`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          companies,
          research_type: researchType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start bulk research: ${errorText}`);
      }

      const result = await response.json();
      
      addToast({
        type: 'success',
        title: 'Bulk research started',
        description: `${companies.length} companies queued for ${researchType} research. You'll be notified when complete.`,
      });

      if (onSuccess) {
        onSuccess(result.job_id, companies.length);
      }

      // Reset form
      setFile(null);
      setPreview([]);
      setResearchType('quick');
      onClose();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start bulk research';
      setError(errorMessage);
      addToast({
        type: 'error',
        title: 'Bulk research failed',
        description: errorMessage,
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = 'company_name,industry,employee_count\nBoeing,Aerospace & Defense,170000\nRaytheon,Aerospace & Defense,181000\nLockheed Martin,Aerospace & Defense,116000';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_research_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const removeFile = () => {
    setFile(null);
    setPreview([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Bulk Company Research</h2>
            <p className="text-sm text-gray-600 mt-1">Upload a CSV to research multiple companies</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Research Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Research Depth</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setResearchType('quick')}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  researchType === 'quick'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Search size={16} />
                  <span className="font-medium">Quick Brief</span>
                </div>
                <p className="text-xs text-gray-600">2-3 min per company</p>
                <p className="text-xs text-gray-600">Key leadership, signals, ICP fit</p>
              </button>
              <button
                onClick={() => setResearchType('deep')}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  researchType === 'deep'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={16} />
                  <span className="font-medium">Deep Intelligence</span>
                </div>
                <p className="text-xs text-gray-600">5-10 min per company</p>
                <p className="text-xs text-gray-600">Full analysis, tech stack, signals</p>
              </button>
            </div>
          </div>

          {/* CSV Template Download */}
          <div className="bg-gray-50 rounded-lg p-4">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Download size={16} />
              <span className="text-sm font-medium">Download CSV template</span>
            </button>
            <p className="text-xs text-gray-600 mt-1">
              Required columns: company_name. Optional: industry, employee_count
            </p>
          </div>

          {/* File Upload Area */}
          {!file ? (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">
                Drag and drop your CSV file here
              </p>
              <p className="text-sm text-gray-600 mb-4">or</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
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
          ) : (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-600">{preview.length} companies found</p>
                  </div>
                </div>
                <button
                  onClick={removeFile}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Remove
                </button>
              </div>

              {preview.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview (first 10 rows)</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Company
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Industry
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Employees
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {preview.map((account, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-sm text-gray-900">
                              {account.company_name}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600">
                              {account.industry || '-'}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600">
                              {account.employee_count || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || preview.length === 0 || uploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Starting Research...
              </>
            ) : (
              <>
                <Search size={16} />
                Research {preview.length} Companies
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
