import { Clock, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function PendingApproval() {
  const { user, approvalStatus } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (approvalStatus === 'approved') {
      navigate('/');
    }
  }, [approvalStatus, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Account Pending Approval
          </h1>
          
          <p className="text-gray-600 mb-6">
            Thanks for signing up! Your account is currently awaiting approval from our team.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  What happens next?
                </p>
                <p className="text-sm text-blue-700">
                  We'll review your account and send you an email at <strong>{user?.email}</strong> once you're approved. This usually takes 1-2 business days.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Check Status
            </button>
            
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign Out
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-6">
            Questions? Contact us at mlerner@rebarhq.ai
          </p>
        </div>
      </div>
    </div>
  );
}
