import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Send, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  role: 'agent' | 'user';
  content: string;
  streaming?: boolean;
}

const RESEARCH_FOCUS_OPTIONS = [
  { id: 'leadership', label: 'Leadership & key contacts' },
  { id: 'funding', label: 'Funding & financials' },
  { id: 'tech_stack', label: 'Technology stack' },
  { id: 'news', label: 'Recent news & announcements' },
  { id: 'positioning', label: 'Market positioning' },
  { id: 'customers', label: 'Customer base' },
  { id: 'hiring', label: 'Hiring trends' },
];

export function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [profileData, setProfileData] = useState({
    companyName: '',
    companyUrl: '',
    linkedinUrl: '',
    youtubeChannel: '',
    competitors: [] as string[],
    researchFocus: [] as string[],
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const checkExistingProfile = async () => {
      if (!user || initializedRef.current) return;

      initializedRef.current = true;

      const { data } = await supabase
        .from('company_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.onboarding_complete) {
        navigate('/');
      } else if (data) {
        setProfileData({
          companyName: data.company_name || '',
          companyUrl: data.company_url || '',
          linkedinUrl: data.linkedin_url || '',
          youtubeChannel: data.youtube_channel || '',
          competitors: data.competitors || [],
          researchFocus: data.research_focus || [],
        });
        setCurrentStep(data.onboarding_step);

        const isReturningUser = data.company_name && data.company_url;
        if (isReturningUser) {
          addAgentMessage(
            `Welcome back! I see you're updating your company profile for ${data.company_name}. Let's go through the setup again to make sure everything is current.\n\nFirst, is your company name still ${data.company_name}? You can confirm by typing it again or provide a new one.`,
            true
          );
        } else {
          addAgentMessage(getStepMessage(data.onboarding_step), false);
        }
      } else {
        addAgentMessage(
          "Hi! I'm your Welcome Agent. I'm here to help set up your account so I can provide personalized research insights. This will only take a couple of minutes.\n\nLet's start with the basics - what's your company name?",
          true
        );
      }
    };

    checkExistingProfile();
  }, [user, navigate]);

  const getStepMessage = (step: number): string => {
    switch (step) {
      case 1:
        return "Hi! I'm your Welcome Agent. I'm here to help set up your account so I can provide personalized research insights. This will only take a couple of minutes.\n\nLet's start with the basics - what's your company name?";
      case 2:
        return `Great! Now I need your company website URL. This helps me understand your business, products, and positioning.\n\nWhat's your website address?`;
      case 3:
        return `Perfect! I can gather even better insights if you share additional data sources like your LinkedIn company page or YouTube channel.\n\nFeel free to share any URLs, or just type "skip" to move on.`;
      case 4:
        return `Thanks! Now, who are your main competitors? Knowing this helps me provide comparative insights.\n\nYou can list 2-5 competitor names separated by commas, or type "skip" if you'd prefer to add these later.`;
      case 5:
        return `Almost done! Finally, I'd like to know what areas you want me to focus on when researching. I can tailor my analysis to what matters most to you.\n\nSelect any that apply:\n${RESEARCH_FOCUS_OPTIONS.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n')}\n\nYou can type the numbers (like "1,3,5"), type "all" for everything, or describe what you're interested in.`;
      default:
        return '';
    }
  };

  const addAgentMessage = async (content: string, withDelay: boolean = true) => {
    if (withDelay) {
      setIsTyping(true);
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    const msgId = `agent-${Date.now()}`;
    setMessages(prev => [...prev, { id: msgId, role: 'agent', content: '', streaming: true }]);
    setIsTyping(false);

    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 30));
      setMessages(prev =>
        prev.map(msg =>
          msg.id === msgId
            ? { ...msg, content: words.slice(0, i + 1).join(' ') }
            : msg
        )
      );
    }

    setMessages(prev =>
      prev.map(msg => (msg.id === msgId ? { ...msg, streaming: false } : msg))
    );
  };

  const addUserMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content
    }]);
  };

  const saveProgress = async (step: number, data: any) => {
    if (!user) return;

    await supabase
      .from('company_profiles')
      .upsert({
        user_id: user.id,
        onboarding_step: step,
        ...data,
      }, {
        onConflict: 'user_id'
      });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userInput = inputValue.trim();
    setInputValue('');
    addUserMessage(userInput);

    await processUserInput(userInput);
  };

  const processUserInput = async (input: string) => {
    const lowerInput = input.toLowerCase();

    switch (currentStep) {
      case 1:
        if (input.length < 2) {
          await addAgentMessage("That seems quite short. Could you provide your full company name? For example: 'Acme Corporation' or 'TechStart Inc.'");
          return;
        }

        setProfileData(prev => ({ ...prev, companyName: input }));
        await saveProgress(2, { company_name: input });
        setCurrentStep(2);
        await addAgentMessage(
          `Great! I'll be researching for ${input}. Next, please provide your company website URL. This helps me understand your business, products, and positioning.`
        );
        break;

      case 2:
        try {
          const url = input.startsWith('http') ? input : `https://${input}`;
          new URL(url);

          setProfileData(prev => ({ ...prev, companyUrl: url }));
          await saveProgress(3, {
            company_name: profileData.companyName,
            company_url: url
          });
          setCurrentStep(3);
          await addAgentMessage(
            `Perfect! I've saved ${url}.\n\nI can gather even better insights if you share additional data sources like your LinkedIn company page or YouTube channel. These help me understand your brand and market presence.\n\nFeel free to share any URLs (one at a time), or just type "skip" to move on.`
          );
        } catch {
          await addAgentMessage("Hmm, that doesn't look like a valid URL. Could you try again? For example: 'acmecorp.com' or 'https://acmecorp.com'");
        }
        break;

      case 3:
        if (lowerInput === 'skip' || lowerInput === 'done') {
          await saveProgress(4, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            linkedin_url: profileData.linkedinUrl || null,
            youtube_channel: profileData.youtubeChannel || null,
          });
          setCurrentStep(4);
          await addAgentMessage(
            `No problem! Now, who are your main competitors? Knowing this helps me provide comparative insights and identify market trends.\n\nYou can list 2-5 competitor names separated by commas, or type "skip" if you'd prefer to add these later.`
          );
        } else {
          if (input.includes('linkedin.com')) {
            setProfileData(prev => ({ ...prev, linkedinUrl: input }));
            await addAgentMessage(
              `Got it! I've saved your LinkedIn page. Feel free to share your YouTube channel or any other links, or type "done" when you're ready to continue.`
            );
          } else if (input.includes('youtube.com') || input.includes('youtu.be')) {
            setProfileData(prev => ({ ...prev, youtubeChannel: input }));
            await addAgentMessage(
              `Great! I've saved your YouTube channel. Any other sources to add, or shall we move on? Type "done" when ready.`
            );
          } else {
            await addAgentMessage(
              `I've noted that URL. Any other sources like LinkedIn or YouTube, or type "done" to continue.`
            );
          }
        }
        break;

      case 4:
        if (lowerInput === 'skip') {
          await saveProgress(5, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            linkedin_url: profileData.linkedinUrl || null,
            youtube_channel: profileData.youtubeChannel || null,
            competitors: null,
          });
          setCurrentStep(5);
          await addAgentMessage(
            `No worries, you can always add competitors later.\n\nAlmost done! Finally, I'd like to know what areas you want me to focus on when researching. This helps me tailor my analysis to what matters most to you.\n\n${RESEARCH_FOCUS_OPTIONS.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n')}\n\nYou can type the numbers (like "1,3,5"), type "all" for everything, or describe what you're interested in.`
          );
        } else {
          const competitors = input.split(',').map(c => c.trim()).filter(c => c.length > 0);
          if (competitors.length > 10) {
            await addAgentMessage("That's quite a few! Let's focus on your top 5 competitors. Could you narrow it down?");
            return;
          }

          setProfileData(prev => ({ ...prev, competitors }));
          await saveProgress(5, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            linkedin_url: profileData.linkedinUrl || null,
            youtube_channel: profileData.youtubeChannel || null,
            competitors,
          });
          setCurrentStep(5);
          await addAgentMessage(
            `Excellent! I'll track ${competitors.join(', ')} as your key competitors.\n\nAlmost done! Finally, what areas should I focus on when researching?\n\n${RESEARCH_FOCUS_OPTIONS.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n')}\n\nType the numbers (like "1,3,5"), "all" for everything, or describe what interests you.`
          );
        }
        break;

      case 5: {
        let selectedFocus: string[] = [];

        if (lowerInput === 'all') {
          selectedFocus = RESEARCH_FOCUS_OPTIONS.map(opt => opt.id);
        } else if (/^[\d,\s]+$/.test(input)) {
          const numbers = input.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 7);
          selectedFocus = numbers.map(n => RESEARCH_FOCUS_OPTIONS[n - 1].id);
        } else {
          const keywords = lowerInput.split(/[ ,\s]+/);
          selectedFocus = RESEARCH_FOCUS_OPTIONS
            .filter(opt => keywords.some(kw => opt.label.toLowerCase().includes(kw)))
            .map(opt => opt.id);
        }

        if (selectedFocus.length === 0) {
          await addAgentMessage(
            "I'm not sure I understood that. Could you try again? You can type numbers like '1,3,5', type 'all', or describe areas like 'leadership and funding'."
          );
          return;
        }

        setProfileData(prev => ({ ...prev, researchFocus: selectedFocus }));

        await supabase
          .from('company_profiles')
          .upsert({
            user_id: user!.id,
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            linkedin_url: profileData.linkedinUrl || null,
            youtube_channel: profileData.youtubeChannel || null,
            competitors: profileData.competitors.length > 0 ? profileData.competitors : null,
            research_focus: selectedFocus,
            onboarding_complete: true,
            onboarding_step: 5,
          }, {
            onConflict: 'user_id'
          });

        const focusLabels = selectedFocus.map(id =>
          RESEARCH_FOCUS_OPTIONS.find(opt => opt.id === id)?.label
        ).filter(Boolean);

        await addAgentMessage(
          `Perfect! Setup complete! 🎉\n\nI now have everything I need to provide high-quality research tailored to ${profileData.companyName}.\n\n**Here's what I can help you with:**\n\n• **Company Research** - Deep dive into any company, focusing on ${focusLabels.slice(0, 2).join(' and ')}\n• **Prospect Research** - Find and analyze potential customers with personalized data\n• **Competitive Analysis** - Compare against ${profileData.competitors.length > 0 ? profileData.competitors.slice(0, 2).join(' and ') : 'your competitors'}\n• **Market Intelligence** - Industry trends and insights relevant to your space\n\nReady to start researching!`
        );

        setTimeout(() => {
          navigate('/');
        }, 3000);
        break;
      }
    }

    inputRef.current?.focus();
  };

  const handleQuickAction = async (action: string) => {
    setInputValue(action);
    setTimeout(() => handleSubmit(), 100);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-sm">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Setup Your Profile</h1>
            <p className="text-sm text-gray-600">Step {currentStep} of 5</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pb-32">
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-6 py-4 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-900'
                }`}
              >
                <div className="whitespace-pre-wrap">
                  {message.content}
                  {message.streaming && (
                    <span className="inline-block w-1 h-5 bg-gray-400 ml-1 animate-pulse"></span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-6">
        <div className="max-w-3xl mx-auto">
          {currentStep === 3 && messages.length > 0 && !messages[messages.length - 1]?.streaming && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => handleQuickAction('skip')}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Skip this step
              </button>
            </div>
          )}

          {currentStep === 4 && messages.length > 0 && !messages[messages.length - 1]?.streaming && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => handleQuickAction('skip')}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Skip competitors
              </button>
            </div>
          )}

          {currentStep === 5 && messages.length > 0 && !messages[messages.length - 1]?.streaming && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => handleQuickAction('all')}
                className="px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
              >
                Select all
              </button>
              <button
                onClick={() => handleQuickAction('1,3,5')}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Leadership, Tech & Positioning
              </button>
              <button
                onClick={() => handleQuickAction('1,2,4')}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Leadership, Funding & News
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your answer..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isTyping}
              autoFocus
            />
            <button
              type="submit"
              disabled={isTyping || !inputValue.trim()}
              className="bg-blue-500 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
