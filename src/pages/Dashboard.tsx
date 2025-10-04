import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Search, Send, Plus, Star, Menu, LogOut, Settings, Coins, MessageSquare } from 'lucide-react';

interface Chat {
  id: string;
  title: string;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens_used: number;
  created_at: string;
}

export function Dashboard() {
  const { user, signOut, credits, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChats();
  }, [user]);

  useEffect(() => {
    if (currentChatId) {
      loadMessages(currentChatId);
    }
  }, [currentChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false });

    if (data) {
      setChats(data);
      if (data.length > 0 && !currentChatId) {
        setCurrentChatId(data[0].id);
      }
    }
  };

  const loadMessages = async (chatId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }
  };

  const createNewChat = async () => {
    const { data } = await supabase
      .from('chats')
      .insert({
        user_id: user!.id,
        title: 'New Research',
      })
      .select()
      .single();

    if (data) {
      setChats([data, ...chats]);
      setCurrentChatId(data.id);
      setMessages([]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !currentChatId || loading) return;

    const userMessage = inputMessage;
    setInputMessage('');
    setLoading(true);

    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      tokens_used: 0,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const { data: savedUserMsg } = await supabase
        .from('messages')
        .insert({
          chat_id: currentChatId,
          role: 'user',
          content: userMessage,
        })
        .select()
        .single();

      const assistantResponse = await generateResponse(userMessage);

      const { data: savedAssistantMsg } = await supabase
        .from('messages')
        .insert({
          chat_id: currentChatId,
          role: 'assistant',
          content: assistantResponse.content,
          tokens_used: assistantResponse.tokens,
        })
        .select()
        .single();

      await supabase
        .from('chats')
        .update({
          updated_at: new Date().toISOString(),
          title: messages.length === 0 ? userMessage.slice(0, 50) : undefined
        })
        .eq('id', currentChatId);

      await supabase.from('usage_logs').insert({
        user_id: user!.id,
        action_type: 'chat_message',
        tokens_used: assistantResponse.tokens,
        metadata: { chat_id: currentChatId },
      });

      await supabase
        .from('users')
        .update({
          credits_remaining: credits - Math.ceil(assistantResponse.tokens / 1000)
        })
        .eq('id', user!.id);

      setMessages(prev =>
        prev.filter(m => m.id !== tempUserMessage.id)
          .concat([savedUserMsg, savedAssistantMsg])
      );

      await refreshCredits();
      loadChats();
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.filter(m => m.id !== tempUserMessage.id));
    } finally {
      setLoading(false);
    }
  };

  const generateResponse = async (userMessage: string): Promise<{ content: string; tokens: number }> => {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const lowerMsg = userMessage.toLowerCase();

    if (lowerMsg.includes('research') && lowerMsg.includes('company')) {
      return {
        content: `I'll help you research that company. Here's what I'll do:

**Company Research Overview**

I'll gather the following information:

1. **Leadership & Key Contacts**: Identifying decision-makers and their backgrounds
2. **Company Overview**: Size, location, and business model
3. **Recent Activity**: Latest news, announcements, and developments
4. **Technology Stack**: Tools and platforms they use
5. **Personalization Points**: Specific insights for outreach

Please provide the company name or website URL you'd like me to research.

Note: In a production environment, I would use web scraping tools and APIs to gather real-time data from LinkedIn, news sources, and the company's website.`,
        tokens: 1200,
      };
    }

    if (lowerMsg.includes('find') && lowerMsg.includes('prospect')) {
      return {
        content: `I can help you find qualified prospects. Here's my approach:

**Prospect Discovery Process**

To find the best matches, I'll need:

1. **Target Industry**: What industry or vertical?
2. **Company Size**: Employee count or revenue range?
3. **Location**: Any geographic preferences?
4. **Decision Maker Titles**: Who should I target (e.g., VP Sales, CRO)?
5. **Count**: How many prospects do you need?

I'll then provide:
- Company profiles matching your criteria
- **Custom criteria extracted** (based on your onboarding setup)
- **Buying signals detected** (e.g., recent funding, leadership changes, security incidents)
- Key decision-maker contacts at each company
- 5+ personalization points per contact
- LinkedIn profiles and contact information
- **Priority scoring** (🔥 HOT / ⚡ WARM / STANDARD) based on signal strength

**Results sorted by:**
1. Signal score (companies with recent relevant events)
2. ICP fit score (match to your ideal customer profile)
3. Composite score (overall priority)

Please provide your criteria, and I'll get started.

Estimated cost: 40-50 credits for 20 prospects with full enrichment.`,
        tokens: 1500,
      };
    }

    if (lowerMsg.includes('competitor') || lowerMsg.includes('compare')) {
      return {
        content: `I'll conduct a competitive analysis for you.

**Competitive Analysis**

I can compare your company against competitors across:

1. **Positioning & Messaging**: How each company presents themselves
2. **Product Features**: Key capabilities and differentiators
3. **Pricing**: Public pricing information (if available)
4. **Target Market**: Who they're targeting
5. **Recent Developments**: Funding, product launches, partnerships
6. **Market Share & Growth**: Industry standing and trajectory

Please let me know which competitors you'd like to analyze, or I can use the competitors from your company profile.

I'll provide a side-by-side comparison with strategic recommendations for differentiation.`,
        tokens: 1100,
      };
    }

    return {
      content: `I'm your Research Agent, specialized in B2B sales intelligence. I can help you with:

**What I Can Do:**

• **Company Research** - Deep dive into any company with leadership, tech stack, recent news, and personalization points

• **Prospect Discovery** - Find and analyze qualified prospects matching your ICP with enriched contact data
  - Extract your custom qualifying criteria (e.g., "Single-family focused", "Units managed")
  - Detect buying signals (e.g., security breaches, leadership changes, funding rounds)
  - Prioritize by signal strength and ICP fit

• **Competitive Analysis** - Compare your positioning against competitors with strategic insights

• **Market Intelligence** - Industry trends, technology adoption, and growth opportunities

**🎯 Personalization:**
Based on your onboarding, I understand your ICP, custom criteria, and target signals. All research will be tailored to your specific needs.

**🚨 Time-Sensitive Intelligence:**
I'll flag companies with recent buying signals (e.g., "New CISO hired 12 days ago") so you know when to reach out.

What would you like to research today?`,
      tokens: 800,
    };
  };

  const toggleStar = async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    await supabase
      .from('chats')
      .update({ starred: !chat.starred })
      .eq('id', chatId);

    setChats(chats.map(c =>
      c.id === chatId ? { ...c, starred: !c.starred } : c
    ));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-white border-r border-gray-200 flex flex-col`}>
        {sidebarOpen && (
          <>
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Search className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="font-semibold text-gray-900">Research Agent</h1>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>

              <button
                onClick={createNewChat}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Research
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {chats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => setCurrentChatId(chat.id)}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-colors flex items-start justify-between group ${
                    currentChatId === chat.id
                      ? 'bg-blue-50 text-blue-900'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="text-sm truncate">{chat.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Star className={`w-4 h-4 ${chat.starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                  </button>
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-gray-200 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Coins className="w-4 h-4" />
                  <span>Credits</span>
                </div>
                <span className="font-semibold text-gray-900">{credits}</span>
              </div>

              <button
                onClick={() => navigate('/settings')}
                className="w-full flex items-center gap-2 text-gray-700 hover:bg-gray-50 py-2 px-3 rounded-lg transition-colors text-sm"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>

              <button
                onClick={signOut}
                className="w-full flex items-center gap-2 text-gray-700 hover:bg-gray-50 py-2 px-3 rounded-lg transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>

          <div className="text-sm text-gray-600">
            {currentChatId && chats.find(c => c.id === currentChatId)?.title}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-2xl">
                <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Search className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                  AI-Powered Sales Research
                </h2>
                <p className="text-gray-600 mb-8">
                  I can help you research companies, find prospects, analyze competitors, and gather market intelligence.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setInputMessage('Research a company for me')}
                    className="p-4 text-left bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    <div className="font-medium text-gray-900 mb-1">Company Research</div>
                    <div className="text-sm text-gray-600">Deep dive into any company</div>
                  </button>
                  <button
                    onClick={() => setInputMessage('Find prospects for me')}
                    className="p-4 text-left bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    <div className="font-medium text-gray-900 mb-1">Find Prospects</div>
                    <div className="text-sm text-gray-600">Discover qualified leads</div>
                  </button>
                  <button
                    onClick={() => setInputMessage('Analyze my competitors')}
                    className="p-4 text-left bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    <div className="font-medium text-gray-900 mb-1">Competitive Analysis</div>
                    <div className="text-sm text-gray-600">Compare against rivals</div>
                  </button>
                  <button
                    onClick={() => setInputMessage('What are the latest market trends?')}
                    className="p-4 text-left bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm"
                  >
                    <div className="font-medium text-gray-900 mb-1">Market Intelligence</div>
                    <div className="text-sm text-gray-600">Industry trends & insights</div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-6 py-4 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    {message.tokens_used > 0 && (
                      <div className="text-xs mt-2 opacity-70">
                        Tokens used: {message.tokens_used} (~{Math.ceil(message.tokens_used / 1000)} credits)
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="bg-white border-t border-gray-200 p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask me to research a company, find prospects, or analyze competitors..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !inputMessage.trim()}
                className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            {credits < 20 && (
              <div className="mt-3 text-sm text-blue-700 flex items-center gap-2">
                <Coins className="w-4 h-4" />
                Running low on credits. Consider purchasing more to continue research.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
