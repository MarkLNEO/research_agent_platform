import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Plus, MessageSquare, Settings, FileText, ChevronLeft, LogOut, Home, UserCircle2, Loader2 } from 'lucide-react';
import { ProfileHealth } from './ProfileHealth';
import { AccountListWidget } from './AccountListWidget';
import { CreditDisplay } from './CreditDisplay';
import type { TrackedAccount } from '../services/accountService';
import { useAuth } from '../contexts/AuthContext';

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface SidebarProps {
  onNewChat: () => void;
  creatingNewChat?: boolean;
  userName?: string;
  chats?: Chat[];
  currentChatId?: string | null;
  onChatSelect?: (chatId: string) => void;
  onCompanyProfile?: () => void;
  onResearchHistory?: () => void;
  onSettings?: () => void;
  profile?: Record<string, unknown> | null;
  customCriteriaCount?: number;
  signalPreferencesCount?: number;
  onAccountClick?: (account: TrackedAccount) => void;
  onAddAccount?: () => void;
  onHome?: () => void;
  onResearchAccount?: (account: TrackedAccount) => void;
}

export function Sidebar({
  onNewChat,
  creatingNewChat = false,
  userName = 'Y',
  chats = [],
  currentChatId,
  onChatSelect,
  onCompanyProfile,
  onResearchHistory,
  onSettings,
  profile,
  customCriteriaCount = 0,
  signalPreferencesCount = 0,
  onAccountClick,
  onAddAccount,
  onHome,
  onResearchAccount
}: SidebarProps) {
  const { signOut } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const accountSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleShowAccounts = () => {
      setIsExpanded(true);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          accountSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const firstAccountButton = accountSectionRef.current?.querySelector<HTMLButtonElement>('button[data-testid="account-list-item"]');
          firstAccountButton?.focus?.();
        });
      });
    };

    window.addEventListener('show-tracked-accounts', handleShowAccounts);
    return () => window.removeEventListener('show-tracked-accounts', handleShowAccounts);
  }, []);

  return (
    <div
      className={`${isExpanded ? 'w-64' : 'w-12'} bg-white border-r border-gray-200 flex flex-col py-4 transition-all duration-300`}
      data-testid="sidebar"
      data-state={isExpanded ? 'expanded' : 'collapsed'}
    >
      <div className="px-2 mb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
          aria-label="Toggle sidebar"
          data-testid="sidebar-toggle"
        >
          {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-2 mb-4 space-y-2">
        {onHome && (
          <button
            onClick={onHome}
            className={`${isExpanded ? 'w-full justify-start gap-3 px-3 py-2' : 'w-8 h-8 justify-center'} flex items-center rounded-lg text-gray-700 hover:bg-gray-50 transition-colors`}
          >
            <Home className="w-4 h-4" />
            {isExpanded && <span className="text-sm font-medium">Home</span>}
          </button>
        )}
        <button
          onClick={onNewChat}
          disabled={creatingNewChat}
          className={`${isExpanded ? 'w-full justify-center gap-2' : 'w-8 h-8 justify-center'} rounded-full bg-blue-500 hover:bg-blue-700 flex items-center text-white transition-colors shadow-sm py-2 disabled:opacity-60 disabled:cursor-progress`}
        >
          {creatingNewChat ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isExpanded && <span className="text-sm font-medium">Creating...</span>}
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              {isExpanded && <span className="text-sm font-medium">New Chat</span>}
            </>
          )}
        </button>
      </div>

      {isExpanded && <CreditDisplay />}

      {isExpanded && onCompanyProfile && (
        <div className="px-2 mb-2">
          <button
            onClick={onCompanyProfile}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <UserCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">Profile Coach</span>
          </button>
        </div>
      )}

      {isExpanded && onResearchHistory && (
        <div className="px-2 mb-2">
          <button
            onClick={onResearchHistory}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm font-medium">Research History</span>
          </button>
        </div>
      )}

      {isExpanded && profile && onCompanyProfile && (
        <div className="px-2 mb-2">
          <ProfileHealth
            profile={profile}
            customCriteriaCount={customCriteriaCount}
            signalPreferencesCount={signalPreferencesCount}
            onNavigateToProfile={onCompanyProfile}
          />
        </div>
      )}

      {isExpanded && onAccountClick && onAddAccount && (
        <div
          ref={accountSectionRef}
          id="tracked-accounts-panel"
          className="flex-1 overflow-y-auto border-t border-gray-200 mb-2"
        >
          <AccountListWidget
            onAccountClick={onAccountClick}
            onAddAccount={onAddAccount}
            onResearchAccount={onResearchAccount}
          />
        </div>
      )}

      {isExpanded && chats.length > 0 && (
        <div className="flex-1 overflow-y-auto px-2">
          <div className="mb-2 px-3 py-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Chats</span>
          </div>
          <div className="space-y-1">
            {chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => onChatSelect?.(chat.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                  currentChatId === chat.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm truncate">{chat.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isExpanded && <div className="flex-1"></div>}

      {!isExpanded && (
        <div className="px-2 mb-2">
          <button
            onClick={() => {
              try { void signOut(); } catch {}
            }}
            className="w-full flex items-center justify-center p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="px-2 mt-2 mb-2 space-y-2">
          {onSettings && (
            <button
              onClick={onSettings}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
            </button>
          )}
          <button
            onClick={() => {
              try { void signOut(); } catch {}
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Sign out</span>
          </button>
        </div>
      )}

      <div className="px-2 mt-auto">
        <div className={`${isExpanded ? 'flex items-center gap-3 px-2 py-3 border-t border-gray-200' : 'flex flex-col items-center gap-2 py-3 border-t border-gray-200'}`}>
          <button className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white text-sm font-medium flex-shrink-0" aria-label="Account menu">
            {userName}
          </button>
          {isExpanded ? (
            <div className="flex-1 min-w-0 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <img src="/logo_black.png" alt="RebarHQ" className="h-6 w-auto" />
                <span className="text-sm font-semibold text-gray-900">Powered by RebarHQ</span>
              </div>
              <p className="mt-1">Intelligence for every strategic meeting.</p>
            </div>
          ) : (
            <span className="sr-only">Powered by RebarHQ</span>
          )}
        </div>
      </div>
    </div>
  );
}
