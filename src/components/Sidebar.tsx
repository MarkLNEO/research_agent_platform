import { useState } from 'react';
import { LayoutGrid, Plus, MessageSquare, Building2, Settings, FileText, ChevronLeft } from 'lucide-react';
import { ProfileHealth } from './ProfileHealth';
import { AccountListWidget } from './AccountListWidget';
import { CreditDisplay } from './CreditDisplay';
import type { TrackedAccount } from '../services/accountService';

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface SidebarProps {
  onNewChat: () => void;
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
}

export function Sidebar({
  onNewChat,
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
  onAddAccount
}: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={`${isExpanded ? 'w-64' : 'w-12'} bg-white border-r border-gray-200 flex flex-col py-4 transition-all duration-300`}>
      <div className="px-2 mb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-2 mb-4">
        <button
          onClick={onNewChat}
          className={`${isExpanded ? 'w-full justify-center gap-2' : 'w-8 h-8 justify-center'} rounded-full bg-blue-500 hover:bg-blue-700 flex items-center text-white transition-colors shadow-sm py-2`}
        >
          <Plus className="w-5 h-5" />
          {isExpanded && <span className="text-sm font-medium">New Chat</span>}
        </button>
      </div>

      {isExpanded && <CreditDisplay />}

      {isExpanded && onCompanyProfile && (
        <div className="px-2 mb-2">
          <button
            onClick={onCompanyProfile}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Building2 className="w-4 h-4" />
            <span className="text-sm font-medium">Settings Agent</span>
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
        <div className="flex-1 overflow-y-auto border-t border-gray-200 mb-2">
          <AccountListWidget
            onAccountClick={onAccountClick}
            onAddAccount={onAddAccount}
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

      {isExpanded && onSettings && (
        <div className="px-2 mt-2 mb-2">
          <button
            onClick={onSettings}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm">Settings</span>
          </button>
        </div>
      )}

      <div className="px-2 mt-auto">
        <div className={`${isExpanded ? 'flex items-center gap-3 px-2' : 'flex justify-center'}`}>
          <button className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
            {userName}
          </button>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">Account</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
