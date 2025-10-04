import { AlertCircle, CheckCircle, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface ProfileHealthBannerProps {
  completionPercentage: number;
  isComplete: boolean;
  missingFields?: string[];
  onDismiss?: () => void;
  showDismiss?: boolean;
}

export function ProfileHealthBanner({
  completionPercentage,
  isComplete,
  missingFields = [],
  onDismiss,
  showDismiss = true
}: ProfileHealthBannerProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isComplete) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const handleGoToProfile = () => {
    navigate('/company-profile');
  };

  const getSeverityColor = () => {
    if (completionPercentage >= 70) return 'yellow';
    if (completionPercentage >= 40) return 'orange';
    return 'red';
  };

  const getSeverityMessage = () => {
    if (completionPercentage >= 70) {
      return 'Almost there! Complete your profile for best results.';
    }
    if (completionPercentage >= 40) {
      return 'Your profile needs attention. Complete it to unlock better research quality.';
    }
    return 'Your profile is incomplete. This will significantly limit research quality.';
  };

  const color = getSeverityColor();

  const colorClasses = {
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-900',
      iconColor: 'text-yellow-600',
      buttonBg: 'bg-yellow-600',
      buttonHover: 'hover:bg-yellow-700',
      progressBg: 'bg-yellow-200',
      progressFill: 'bg-yellow-600'
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-900',
      iconColor: 'text-orange-600',
      buttonBg: 'bg-orange-600',
      buttonHover: 'hover:bg-orange-700',
      progressBg: 'bg-orange-200',
      progressFill: 'bg-orange-600'
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-900',
      iconColor: 'text-red-600',
      buttonBg: 'bg-red-600',
      buttonHover: 'hover:bg-red-700',
      progressBg: 'bg-red-200',
      progressFill: 'bg-red-600'
    }
  };

  const classes = colorClasses[color];

  return (
    <div className={`${classes.bg} border ${classes.border} rounded-xl p-4 shadow-sm mb-6 animate-fadeIn`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`w-5 h-5 ${classes.iconColor} flex-shrink-0 mt-0.5`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className={`text-sm font-semibold ${classes.text}`}>
                Profile {completionPercentage}% Complete
              </h3>
              <p className={`text-xs ${classes.text} opacity-90 mt-0.5`}>
                {getSeverityMessage()}
              </p>
            </div>

            {showDismiss && (
              <button
                onClick={handleDismiss}
                className={`${classes.text} opacity-60 hover:opacity-100 transition-opacity`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className={`w-full h-2 ${classes.progressBg} rounded-full overflow-hidden mb-3`}>
            <div
              className={`h-full ${classes.progressFill} transition-all duration-500 ease-out`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          {missingFields.length > 0 && (
            <div className={`text-xs ${classes.text} opacity-80 mb-3`}>
              <span className="font-medium">Missing:</span>{' '}
              {missingFields.slice(0, 3).join(', ')}
              {missingFields.length > 3 && ` +${missingFields.length - 3} more`}
            </div>
          )}

          <button
            onClick={handleGoToProfile}
            className={`${classes.buttonBg} ${classes.buttonHover} text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2`}
          >
            Complete Your Profile
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfileCompleteBanner({ onDismiss }: { onDismiss?: () => void }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm mb-6 animate-fadeIn">
      <div className="flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />

        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-green-900">
                Profile Complete!
              </h3>
              <p className="text-xs text-green-800 opacity-90 mt-0.5">
                Your research results will be highly personalized and accurate.
              </p>
            </div>

            <button
              onClick={handleDismiss}
              className="text-green-900 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
