import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, Clock, User } from 'lucide-react';

interface PendingUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
  approval_status: string;
}

export function AdminApprovals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    // Only mlerner@rebarhq.ai can access this page
    if (!user || user.email !== 'mlerner@rebarhq.ai') {
      navigate('/');
      return;
    }

    loadPendingUsers();
  }, [user, navigate]);

  const loadPendingUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, created_at, approval_status')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingUsers(data || []);
    } catch (error) {
      console.error('Error loading pending users:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (userId: string, userEmail: string) => {
    setProcessing(userId);
    try {
      const { error } = await supabase.rpc('approve_user', {
        user_id_to_approve: userId,
        admin_email: user?.email,
        notes: 'Approved via admin dashboard'
      });

      if (error) throw error;

      // Send approval confirmation email to user
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', userId)
          .single();

        if (userData) {
          await fetch(`/api/approvals/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: { email: userData.email, name: userData.name } }),
          });
        }
      } catch (emailError) {
        console.warn('Failed to send approval confirmation email:', emailError);
        // Don't fail the approval if email fails
      }

      alert(`✅ Approved ${userEmail}! They now have 1,000 credits.`);
      await loadPendingUsers();
    } catch (error: any) {
      console.error('Error approving user:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const rejectUser = async (userId: string, userEmail: string) => {
    const reason = prompt(`Why are you rejecting ${userEmail}?`);
    if (!reason) return;

    setProcessing(userId);
    try {
      const { error } = await supabase.rpc('reject_user', {
        user_id_to_reject: userId,
        admin_email: user?.email,
        notes: reason
      });

      if (error) throw error;

      alert(`❌ Rejected ${userEmail}`);
      await loadPendingUsers();
    } catch (error: any) {
      console.error('Error rejecting user:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">User Approvals</h1>
            <p className="text-sm text-gray-600 mt-1">
              Review and approve new user signups
            </p>
          </div>

          <div className="p-6">
            {pendingUsers.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No pending approvals</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((pendingUser) => (
                  <div
                    key={pendingUser.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {pendingUser.name}
                          </h3>
                          <p className="text-sm text-gray-600">{pendingUser.email}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Signed up: {new Date(pendingUser.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => approveUser(pendingUser.id, pendingUser.email)}
                          disabled={processing === pendingUser.id}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectUser(pendingUser.id, pendingUser.email)}
                          disabled={processing === pendingUser.id}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
