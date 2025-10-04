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

interface CustomCriterion {
  field_name: string;
  field_type: 'text' | 'number' | 'boolean' | 'list';
  importance: 'critical' | 'important' | 'optional';
}

// Removed unused SignalPreference interface

const SIGNAL_OPTIONS = {
  'Company Changes': [
    'recent_funding',
    'leadership_change',
    'company_acquisition',
    'rapid_hiring_growth',
    'office_expansion'
  ],
  'Technology': [
    'security_breach',
    'tech_stack_change',
    'new_product_launch',
    'website_redesign'
  ],
  'Market': [
    'industry_awards',
    'major_partnership',
    'geographic_expansion',
    'competitor_news'
  ],
  'Financial': [
    'earnings_announcement',
    'revenue_milestone',
    'new_investment_round'
  ]
};

const RESEARCH_FOCUS_OPTIONS = [
  { id: 'leadership', label: 'Leadership & key contacts' },
  { id: 'funding', label: 'Funding & financials' },
  { id: 'tech_stack', label: 'Technology stack' },
  { id: 'news', label: 'Recent news & announcements' },
  { id: 'positioning', label: 'Market positioning' },
  { id: 'customers', label: 'Customer base' },
  { id: 'hiring', label: 'Hiring trends' },
];

export function OnboardingEnhanced() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [welcomeMode, setWelcomeMode] = useState(true);

  const [profileData, setProfileData] = useState({
    companyName: '',
    companyUrl: '',
    userRole: '',
    useCase: '',
    industry: '',
    icpDefinition: '',
    linkedinUrl: '',
    youtubeChannel: '',
    competitors: [] as string[],
    targetTitles: [] as string[],
    seniorityLevels: [] as string[],
    targetDepartments: [] as string[],
    researchFocus: [] as string[],
    outputFormat: 'pdf',
    outputStyle: 'executive_summary',
  });

  const [customCriteria, setCustomCriteria] = useState<CustomCriterion[]>([]);
  const [selectedSignals, setSelectedSignals] = useState<string[]>([]);

  const [pendingCriteria, setPendingCriteria] = useState<string[]>([]);
  const [currentCriterionIndex, setCurrentCriterionIndex] = useState(-1);
  const [currentCriterionStep, setCurrentCriterionStep] = useState<'type' | 'importance' | null>(null);
  const [tempCriterion, setTempCriterion] = useState<Partial<CustomCriterion>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep the text input focused for fast replies
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isTyping) {
      inputRef.current?.focus();
    }
  }, [isTyping, currentStep]);

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
          userRole: data.user_role || '',
          useCase: data.use_case || '',
          industry: data.industry || '',
          icpDefinition: data.icp_definition || '',
          linkedinUrl: data.linkedin_url || '',
          youtubeChannel: data.youtube_channel || '',
          competitors: data.competitors || [],
          targetTitles: data.target_titles || [],
          seniorityLevels: data.seniority_levels || [],
          targetDepartments: data.target_departments || [],
          researchFocus: data.research_focus || [],
          outputFormat: data.output_format || 'pdf',
          outputStyle: data.output_style || 'executive_summary',
        });
        setCurrentStep(data.onboarding_step);

        const isReturningUser = data.company_name && data.company_url;
        if (isReturningUser) {
          addAgentMessage(
            `Welcome back! I see you're updating your company profile for ${data.company_name}. Let's go through the setup again to make sure everything is current.\n\nFirst, is your company name still ${data.company_name}? You can confirm by typing it again or provide a new one.`,
            true
          );
          setWelcomeMode(false);
        } else {
          // Show agentic welcome instead of immediate text prompt
          setWelcomeMode(true);
        }
      } else {
        setWelcomeMode(true);
      }
    };

    checkExistingProfile();
  }, [user, navigate]);

  const getStepMessage = (step: number): string => {
    switch (step) {
      case 1:
        return "Hi! I'm your Research Agent. I'm here to help set up your account so I can provide personalized research insights for your sales team.\n\nLet's start - what's your company name?";
      case 2:
        return `Great! Now I need your company website URL and a bit about your role.\n\nWhat's your website address?`;
      case 3:
        return `Perfect! Now let's define your Ideal Customer Profile (ICP). This helps me find the right prospects.\n\nWhat industry are you in?`;
      case 4:
        return `This is important! Every industry has unique data points that matter. For example:\n• Property managers care about: single-family vs multi-family, units managed\n• Tech companies care about: tech stack, funding stage\n• Manufacturers care about: production capacity, certifications\n\nWhat are YOUR 3-5 most important qualifying criteria? Type them one at a time or separated by commas (e.g., "Has a CISO, SOC2 certified"), or type "skip" if you'd like to add these later.`;
      case 5:
        return `Thanks! I can gather even better insights if you share additional data sources like your LinkedIn company page or YouTube channel.\n\nFeel free to share any URLs, or just type "skip" to move on.`;
      case 6:
        return `Now, who are your main competitors? Knowing this helps me provide comparative insights.\n\nList 2-5 competitor names separated by commas, or type "skip".`;
      case 7:
        return `Excellent! Certain events create urgency for your solution. For example, if you sell security software, a recent data breach is a strong signal.\n\nWhat events make a company MORE likely to buy from you RIGHT NOW? I'll show you some common signals, or you can describe your own. Type "show signals" to see options, or "skip" to continue.`;
      case 8:
        return `Almost done! Who do you typically sell to?\n\nPlease provide job titles (e.g., "VP Sales, CRO, Director of Sales") or type "skip".`;
      case 9:
        return `Finally, what areas should I focus on when researching? Select any that apply:\n${RESEARCH_FOCUS_OPTIONS.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n')}\n\nType the numbers (like "1,3,5"), type "all", or describe what you're interested in.`;
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

    // Return focus to the input after assistant finishes
    inputRef.current?.focus();
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
    inputRef.current?.focus();
    addUserMessage(userInput);

    await processUserInput(userInput);
  };

  const processUserInput = async (input: string) => {
    const lowerInput = input.toLowerCase();

    switch (currentStep) {
      case 1: {
        const affirmations = ['yes', 'y', 'correct', 'same', 'unchanged', 'no change', 'yep', 'yeah'];
        const currentName = profileData.companyName?.trim();

        if (affirmations.includes(lowerInput)) {
          if (!currentName) {
            await addAgentMessage("Please type your full company name (e.g., 'Acme Corp').");
            return;
          }
          await saveProgress(2, { company_name: currentName });
          setCurrentStep(2);
          await addAgentMessage(
            `Perfect! I'll be researching for ${currentName}.\n\nNow, what's your company website URL?`
          );
          break;
        }

        if (input.length < 2) {
          await addAgentMessage("That seems quite short. Could you provide your full company name?");
          return;
        }
        setProfileData(prev => ({ ...prev, companyName: input }));
        await saveProgress(2, { company_name: input });
        setCurrentStep(2);
        await addAgentMessage(
          `Perfect! I'll be researching for ${input}.\n\nNow, what's your company website URL?`
        );
        break;
      }

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
            `Got it! Now, what's your role?\n\nType one of these or describe your role:\n• BDR/SDR (finding new prospects)\n• AE (researching existing accounts)\n• Marketing\n• Other`
          );
        } catch {
          await addAgentMessage("That doesn't look like a valid URL. Try again? (e.g., 'acmecorp.com')");
        }
        break;

      case 3:
        if (profileData.userRole === '') {
          setProfileData(prev => ({ ...prev, userRole: input }));
          await addAgentMessage(
            `Great! And what's your primary use case?\n\n• Find new prospects (lead generation)\n• Research existing accounts\n• Both`
          );
        } else if (profileData.useCase === '') {
          setProfileData(prev => ({ ...prev, useCase: input }));
          await addAgentMessage(
            `Perfect! Now let's define your Ideal Customer Profile. What industry are you in?`
          );
        } else if (profileData.industry === '') {
          setProfileData(prev => ({ ...prev, industry: input }));
          await addAgentMessage(
            `Excellent! Now describe your ideal customer in 1-2 sentences.\n\nFor example: "Mid-market SaaS companies with 100-1000 employees and revenue >$10M"`
          );
        } else {
          setProfileData(prev => ({ ...prev, icpDefinition: input }));
          await saveProgress(4, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            user_role: profileData.userRole,
            use_case: profileData.useCase,
            industry: profileData.industry,
            icp_definition: input
          });
          setCurrentStep(4);
          await addAgentMessage(getStepMessage(4));
        }
        break;

      case 4:
        await handleCustomCriteriaInput(input, lowerInput);
        break;

      case 5:
        if (lowerInput === 'skip' || lowerInput === 'done') {
          await saveProgress(6, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            user_role: profileData.userRole,
            use_case: profileData.useCase,
            industry: profileData.industry,
            icp_definition: profileData.icpDefinition,
            linkedin_url: profileData.linkedinUrl || null,
            youtube_channel: profileData.youtubeChannel || null,
          });
          setCurrentStep(6);
          await addAgentMessage(getStepMessage(6));
        } else {
          if (input.includes('linkedin.com')) {
            setProfileData(prev => ({ ...prev, linkedinUrl: input }));
            await addAgentMessage(
              `Saved your LinkedIn page! Any other sources, or type "done" to continue.`
            );
          } else if (input.includes('youtube.com') || input.includes('youtu.be')) {
            setProfileData(prev => ({ ...prev, youtubeChannel: input }));
            await addAgentMessage(
              `Saved your YouTube channel! Type "done" when ready to continue.`
            );
          } else {
            await addAgentMessage(
              `I've noted that URL. Type "done" to continue.`
            );
          }
        }
        break;

      case 6:
        if (lowerInput === 'skip') {
          await saveProgress(7, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            user_role: profileData.userRole,
            use_case: profileData.useCase,
            industry: profileData.industry,
            icp_definition: profileData.icpDefinition,
            linkedin_url: profileData.linkedinUrl,
            youtube_channel: profileData.youtubeChannel,
            competitors: []
          });
          setCurrentStep(7);
          await addAgentMessage(getStepMessage(7));
        } else {
          const competitors = input.split(',').map(c => c.trim()).filter(c => c);
          setProfileData(prev => ({ ...prev, competitors }));
          await saveProgress(7, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            user_role: profileData.userRole,
            use_case: profileData.useCase,
            industry: profileData.industry,
            icp_definition: profileData.icpDefinition,
            linkedin_url: profileData.linkedinUrl,
            youtube_channel: profileData.youtubeChannel,
            competitors
          });
          setCurrentStep(7);
          await addAgentMessage(
            `Perfect! I'll keep an eye on ${competitors.join(', ')}.\n\n` + getStepMessage(7)
          );
        }
        break;

      case 7: {
        const persistAndAdvance = async () => {
          // Persist selectedSignals to user_signal_preferences
          if (user) {
            await supabase.from('user_signal_preferences').delete().eq('user_id', user.id);
            if (selectedSignals.length > 0) {
              const rows = selectedSignals.map(sig => ({
                user_id: user.id,
                signal_type: sig,
                importance: 'important',
                lookback_days: 90,
                config: {},
              }));
              await supabase.from('user_signal_preferences').insert(rows);
            }
          }
          await saveProgress(8, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            user_role: profileData.userRole,
            use_case: profileData.useCase,
            industry: profileData.industry,
            icp_definition: profileData.icpDefinition,
            linkedin_url: profileData.linkedinUrl,
            youtube_channel: profileData.youtubeChannel,
            competitors: profileData.competitors
          });
          setCurrentStep(8);
          await addAgentMessage(getStepMessage(8));
        };

        if (lowerInput === 'skip' || lowerInput === 'done') {
          await persistAndAdvance();
          break;
        }

        if (lowerInput === 'show signals') {
          let signalList = 'Here are common buying signals:\n\n';
          Object.entries(SIGNAL_OPTIONS).forEach(([category, signals]) => {
            signalList += `${category}:\n`;
            signals.forEach(signal => {
              signalList += `• ${signal.replace(/_/g, ' ')} (${signal})\n`;
            });
            signalList += '\n';
          });
          signalList += 'Type the signals you want to track (e.g., "security_breach, leadership_change") or "skip"';
          await addAgentMessage(signalList);
          break;
        }

        // Parse comma-separated list into normalized ids
        const entries = input
          .split(',')
          .map(s => s.trim().toLowerCase().replace(/\s+/g, '_'))
          .filter(Boolean);
        const merged = Array.from(new Set([...selectedSignals, ...entries]));
        setSelectedSignals(merged);
        await addAgentMessage(
          `Added ${entries.join(', ')}. Currently tracking: ${merged.join(', ')}. Type more, or "done" to continue.`
        );
        break;
      }

      case 8:
        if (lowerInput === 'skip') {
          await saveProgress(9, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            user_role: profileData.userRole,
            use_case: profileData.useCase,
            industry: profileData.industry,
            icp_definition: profileData.icpDefinition,
            linkedin_url: profileData.linkedinUrl,
            youtube_channel: profileData.youtubeChannel,
            competitors: profileData.competitors,
            target_titles: []
          });
          setCurrentStep(9);
          await addAgentMessage(getStepMessage(9));
        } else {
          const titles = input.split(',').map(t => t.trim()).filter(t => t);
          setProfileData(prev => ({ ...prev, targetTitles: titles }));
          await saveProgress(9, {
            company_name: profileData.companyName,
            company_url: profileData.companyUrl,
            user_role: profileData.userRole,
            use_case: profileData.useCase,
            industry: profileData.industry,
            icp_definition: profileData.icpDefinition,
            linkedin_url: profileData.linkedinUrl,
            youtube_channel: profileData.youtubeChannel,
            competitors: profileData.competitors,
            target_titles: titles
          });
          setCurrentStep(9);
          await addAgentMessage(
            `Perfect! I'll focus on ${titles.join(', ')}.\n\n` + getStepMessage(9)
          );
        }
        break;

      case 9:
        await handleResearchFocusInput(input);
        break;
    }
  };

  const parseCriteriaFromInput = (input: string): string[] => {
    // Check if input contains numbered patterns like "1. text 2. text" or "1. text\n2. text"
    const hasNumbering = /\d+\.\s+/.test(input);

    if (hasNumbering) {
      // Split by numbered pattern (e.g., "1. ", "2. ", etc.)
      const parts = input.split(/\d+\.\s+/).map(part => part.trim()).filter(part => part.length > 0);

      // The first element might be empty if input starts with "1. "
      return parts.filter(part => part.length > 3);
    }

    // If comma-separated values are provided, treat each as a separate criterion
    if (input.includes(',')) {
      const items = input
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 1);
      if (items.length > 1) return items;
    }

    // Fallback: split by newlines or semicolons
    const lines = input
      .split(/\n|;/)
      .map(line => line.trim())
      .filter(line => line.length > 3);

    return lines;
  };

  const handleCustomCriteriaInput = async (input: string, lowerInput: string) => {
    if (lowerInput === 'skip' || lowerInput === 'done') {
      if (customCriteria.length > 0) {
        await saveCriteria();
      }
      await saveProgress(5, {
        company_name: profileData.companyName,
        company_url: profileData.companyUrl,
        user_role: profileData.userRole,
        use_case: profileData.useCase,
        industry: profileData.industry,
        icp_definition: profileData.icpDefinition
      });
      setCurrentStep(5);
      await addAgentMessage(getStepMessage(5));
      return;
    }

    if (currentCriterionStep === 'type') {
      let fieldType: 'text' | 'number' | 'boolean' | 'list' = 'text';

      if (lowerInput.includes('text')) {
        fieldType = 'text';
      } else if (lowerInput.includes('number')) {
        fieldType = 'number';
      } else if (lowerInput.includes('yes') || lowerInput.includes('no') || lowerInput.includes('boolean')) {
        fieldType = 'boolean';
      } else if (lowerInput.includes('list')) {
        fieldType = 'list';
      } else {
        await addAgentMessage(
          `I didn't catch that. Is "${pendingCriteria[currentCriterionIndex]}" a:\n• Text (e.g., "Salesforce")\n• Number (e.g., 500)\n• Yes/No`
        );
        return;
      }

      setTempCriterion({ field_name: pendingCriteria[currentCriterionIndex], field_type: fieldType });
      setCurrentCriterionStep('importance');

      await addAgentMessage(
        `Got it! How important is "${pendingCriteria[currentCriterionIndex]}"?\n• Critical (must have)\n• Important (nice to have)\n• Optional (bonus)`
      );
      return;
    }

    if (currentCriterionStep === 'importance') {
      let importance: 'critical' | 'important' | 'optional' = 'important';

      if (lowerInput.includes('critical') || lowerInput.includes('must')) {
        importance = 'critical';
      } else if (lowerInput.includes('important') || lowerInput.includes('nice')) {
        importance = 'important';
      } else if (lowerInput.includes('optional') || lowerInput.includes('bonus')) {
        importance = 'optional';
      } else {
        await addAgentMessage(
          `I didn't catch that. Is "${pendingCriteria[currentCriterionIndex]}":\n• Critical\n• Important\n• Optional`
        );
        return;
      }

      const newCriterion: CustomCriterion = {
        field_name: tempCriterion.field_name!,
        field_type: tempCriterion.field_type!,
        importance
      };

      setCustomCriteria(prev => [...prev, newCriterion]);
      setTempCriterion({});

      if (currentCriterionIndex < pendingCriteria.length - 1) {
        setCurrentCriterionIndex(currentCriterionIndex + 1);
        setCurrentCriterionStep('type');

        await addAgentMessage(
          `Perfect! Next criterion: "${pendingCriteria[currentCriterionIndex + 1]}"\n\nWhat type of data is this?\n• Text (e.g., "Salesforce")\n• Number (e.g., 500)\n• Yes/No`
        );
      } else {
        setPendingCriteria([]);
        setCurrentCriterionIndex(-1);
        setCurrentCriterionStep(null);

        const criteriaList = customCriteria.concat([newCriterion]).map((c, idx) =>
          `${idx + 1}. ${c.field_name} (${c.field_type}, ${c.importance})`
        ).join('\n');

        await addAgentMessage(
          `Excellent! I've saved all your criteria:\n\n${criteriaList}\n\nYou can add more criteria, or type "done" to continue.`
        );
      }
      return;
    }

    const newCriteria = parseCriteriaFromInput(input);

    if (newCriteria.length === 0) {
      await addAgentMessage(
        `I couldn't identify any criteria in your message. Please list them clearly, one per line or separated by numbers. For example:\n\n1. Have they had security incidents?\n2. What security tools are they using?\n3. Do they have a dedicated CISO?\n\nOr type "skip" to continue without adding criteria.`
      );
      return;
    }

    setPendingCriteria(newCriteria);
    setCurrentCriterionIndex(0);
    setCurrentCriterionStep('type');

    const criteriaListFormatted = newCriteria.map((c, idx) => `${idx + 1}. ${c}`).join('\n');

    await addAgentMessage(
      `Got it! I've identified ${newCriteria.length} ${newCriteria.length === 1 ? 'criterion' : 'criteria'}:\n\n${criteriaListFormatted}\n\nNow I need to know what type of data each one is. Let's start with the first one:\n\n"${newCriteria[0]}"\n\nWhat type of data is this?\n• Text (e.g., "Salesforce")\n• Number (e.g., 500)\n• Yes/No`
    );
  };

  const handleResearchFocusInput = async (input: string) => {
    const lowerInput = input.toLowerCase();

    if (lowerInput === 'all') {
      const allFocus = RESEARCH_FOCUS_OPTIONS.map(opt => opt.id);
      await finishOnboarding(allFocus);
    } else if (lowerInput === 'skip') {
      await finishOnboarding([]);
    } else if (/^\d+(?:,\s*\d+)*$/.test(input)) {
      const indices = input.split(',').map(n => parseInt(n.trim()) - 1);
      const selectedFocus = indices
        .filter(idx => idx >= 0 && idx < RESEARCH_FOCUS_OPTIONS.length)
        .map(idx => RESEARCH_FOCUS_OPTIONS[idx].id);
      await finishOnboarding(selectedFocus);
    } else {
      await addAgentMessage(
        "Please type numbers separated by commas (like '1,3,5'), 'all' for everything, or 'skip'."
      );
    }
  };

  const saveCriteria = async () => {
    if (!user || customCriteria.length === 0) return;
    // Clear previous to avoid duplicates
    await supabase.from('user_custom_criteria').delete().eq('user_id', user.id);
    const rows = customCriteria.map((c, idx) => ({
      user_id: user.id,
      field_name: c.field_name,
      field_type: c.field_type,
      importance: c.importance,
      hints: [],
      display_order: idx + 1,
    }));
    await supabase.from('user_custom_criteria').insert(rows);
  };

  const finishOnboarding = async (researchFocus: string[]) => {
    if (!user) return;

    await supabase
      .from('company_profiles')
      .upsert({
        user_id: user.id,
        company_name: profileData.companyName,
        company_url: profileData.companyUrl,
        user_role: profileData.userRole,
        use_case: profileData.useCase,
        industry: profileData.industry,
        icp_definition: profileData.icpDefinition,
        linkedin_url: profileData.linkedinUrl,
        youtube_channel: profileData.youtubeChannel,
        competitors: profileData.competitors,
        target_titles: profileData.targetTitles,
        research_focus: researchFocus,
        onboarding_complete: true,
        onboarding_step: 9
      }, {
        onConflict: 'user_id'
      });

    await addAgentMessage(
      `Perfect! You're all set up. I'm ready to help you research companies, find prospects, and provide personalized insights based on your ICP.\n\nRedirecting you to your dashboard...`
    );
    navigate('/');
  };

  const selectPath = (path: 'immediate' | 'guided', starter?: string) => {
    if (path === 'immediate') {
      const q = starter || 'Research Boeing';
      navigate(`/?q=${encodeURIComponent(q)}`);
      return;
    }
    // guided path
    setWelcomeMode(false);
    // seed first step message
    addAgentMessage(getStepMessage(1), false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Research Agent</h1>
              {!welcomeMode && <p className="text-sm text-blue-100">Step {currentStep} of 9</p>}
            </div>
          </div>
        </div>

        <div className="h-[500px] overflow-y-auto p-6 space-y-4">
          {welcomeMode && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg">👋</div>
                <div className="flex-1">
                  <div className="mb-2">
                    <div className="text-sm text-gray-900 font-semibold">Hey! I'm your Research Agent.</div>
                  </div>
                  <div className="text-sm text-gray-700 mb-4">
                    I help sales teams research companies, find hot leads, and track accounts.
                    <br />
                    <span className="font-semibold">Here's how this works:</span> You can ask me anything right now, and I'll learn about your needs as we go. No forms to fill out.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer" onClick={() => selectPath('immediate')}>
                      <div className="text-2xl">🚀</div>
                      <div className="font-semibold text-gray-900 mt-1">Jump right in</div>
                      <div className="text-sm text-gray-600">Research a company now</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="text-xs bg-gray-100 rounded-full px-2.5 py-1" onClick={(e) => { e.stopPropagation(); selectPath('immediate', 'Research Boeing'); }}>Research Boeing</button>
                        <button className="text-xs bg-gray-100 rounded-full px-2.5 py-1" onClick={(e) => { e.stopPropagation(); selectPath('immediate', 'Find companies like Stripe'); }}>Find companies like Stripe</button>
                        <button className="text-xs bg-gray-100 rounded-full px-2.5 py-1" onClick={(e) => { e.stopPropagation(); selectPath('immediate', 'What can you do?'); }}>What can you do?</button>
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer" onClick={() => selectPath('guided')}>
                      <div className="text-2xl">💬</div>
                      <div className="font-semibold text-gray-900 mt-1">Quick chat first</div>
                      <div className="text-sm text-gray-600">2 min conversation to personalize</div>
                      <div className="text-xs text-gray-500 mt-2">I'll ask about your role, what you're looking for, and what data matters to you.</div>
                    </div>
                  </div>

                  <div className="mt-4 text-sm">
                    <button className="text-blue-600 hover:text-blue-700" onClick={() => selectPath('immediate')}>Or just start asking me questions →</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                {message.streaming && (
                  <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1"></span>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your answer..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              autoFocus
              disabled={isTyping}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
