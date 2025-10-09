import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: any };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    try {
      console.error('[ErrorBoundary]', error, info);
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 w-full max-w-md text-center">
            <div className="text-base font-semibold text-gray-900">Something went wrong</div>
            <div className="text-xs text-gray-600 mt-1">The page hit a snag. You can reload or head back to the dashboard.</div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg" onClick={() => window.location.reload()}>Reload</button>
              <button className="px-3 py-1.5 text-xs text-gray-700" onClick={() => (window.location.href = '/')}>Open dashboard</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

