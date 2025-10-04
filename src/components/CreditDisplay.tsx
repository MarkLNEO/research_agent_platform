import { Coins, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function CreditDisplay() {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCredits();
    
    // Listen for credit updates
    const handleCreditsUpdated = () => {
      loadCredits();
    };
    
    window.addEventListener('credits-updated', handleCreditsUpdated);
    return () => window.removeEventListener('credits-updated', handleCreditsUpdated);
  }, []);

  const loadCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('credits_remaining')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[CreditDisplay] Error loading credits:', error);
        return;
      }

      setCredits(data?.credits_remaining ?? null);
    } catch (err) {
      console.error('[CreditDisplay] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || credits === null) {
    return null;
  }

  const isLow = credits < 100;
  const isVeryLow = credits < 20;

  return (
    <div className={`px-4 py-3 border-b ${isVeryLow ? 'bg-red-50 border-red-200' : isLow ? 'bg-orange-50 border-orange-200' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className={`w-4 h-4 ${isVeryLow ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-gray-600'}`} />
          <span className={`text-sm font-medium ${isVeryLow ? 'text-red-900' : isLow ? 'text-orange-900' : 'text-gray-700'}`}>
            {credits.toLocaleString()} credits
          </span>
        </div>
        {isLow && (
          <AlertTriangle className={`w-4 h-4 ${isVeryLow ? 'text-red-600' : 'text-orange-600'}`} />
        )}
      </div>
      
      {isVeryLow && (
        <div className="mt-2 text-xs text-red-700">
          Running low! Contact{' '}
          <a 
            href="mailto:mlerner@rebarhq.ai?subject=Credit Request" 
            className="underline font-medium hover:text-red-800"
          >
            mlerner@rebarhq.ai
          </a>
          {' '}to request more.
        </div>
      )}
      
      {isLow && !isVeryLow && (
        <div className="mt-1 text-xs text-orange-700">
          You have {credits} credits remaining
        </div>
      )}
    </div>
  );
}
