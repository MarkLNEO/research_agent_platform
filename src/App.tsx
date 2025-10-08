import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { OnboardingEnhanced as Onboarding } from './pages/OnboardingEnhanced';
import { HomeGate } from './components/HomeGate';
import { CompanyProfile } from './pages/CompanyProfile';
import { ResearchHistory } from './pages/ResearchHistory';
import { Settings } from './pages/Settings';
import { SignalSettings } from './pages/SignalSettings';
import { AdminApprovals } from './pages/AdminApprovals';
import { PendingApproval } from './pages/PendingApproval';
import { AllSignals } from './pages/AllSignals';
import { StreamdownRenderTest } from './pages/StreamdownRenderTest';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomeGate />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile-coach"
            element={
              <ProtectedRoute>
                <CompanyProfile />
              </ProtectedRoute>
            }
          />
          <Route path="/settings-agent" element={<Navigate to="/profile-coach" replace />} />
          <Route
            path="/research"
            element={
              <ProtectedRoute>
                <ResearchHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/signals"
            element={
              <ProtectedRoute>
                <SignalSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/signals"
            element={
              <ProtectedRoute>
                <AllSignals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/render-test"
            element={
              <ProtectedRoute>
                <StreamdownRenderTest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <ProtectedRoute>
                <AdminApprovals />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
