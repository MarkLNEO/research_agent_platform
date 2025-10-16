import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Send, Sparkles } from 'lucide-react';
import { invalidateUserProfileCache, primeUserProfileCache } from '../hooks/useUserProfile';

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
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);

  const recommendedFocus = useMemo(() => {
    const role = (profileData.userRole || '').toLowerCase();
    if (role.includes('security') || role.includes('ciso') || role.includes('risk')) {
      return ['leadership', 'tech_stack', 'news'];
    }
    if (role.includes('marketing')) {
      return ['market', 'customers', 'news'];
    }
    if (role.includes('sales') || role.includes('account') || role.includes('revenue')) {
      return ['leadership', 'customers', 'news'];
    }
    return ['leadership', 'news'];
  }, [profileData.userRole]);

  const [pendingCriteria, setPendingCriteria] = useState<string[]>([]);
  const [currentCriterionIndex, setCurrentCriterionIndex] = useState(-1);
  const [currentCriterionStep, setCurrentCriterionStep] = useState<'importance' | null>(null);
  const [tempCriterion, setTempCriterion] = useState<Partial<CustomCriterion>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const node = messagesEndRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
    // At the final step, default to all focus areas selected for clarity.
    if (currentStep === 9 && !welcomeMode && selectedFocus.length === 0) {
      setSelectedFocus(RESEARCH_FOCUS_OPTIONS.map(opt => opt.id));
    }
  }, [currentStep, welcomeMode, selectedFocus.length]);

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
        // Load any saved values, but always start at the welcome card for clarity
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
        setCurrentStep(data.onboarding_step || 1);
        // Always show the welcome mode for incomplete onboarding to keep flow consistent
        setWelcomeMode(true);
      } else {
        setWelcomeMode(true);
      }
    };

    checkExistingProfile();
  }, [user, navigate]);

  const getStepMessage = (step: number): string => {
    switch (step) {
      case 1:
        return "Hi! I'm your Welcome Agent. I'll use this setup to tailor research, signals, and meetings for you.\n\nLet's start — what's your company name? You can paste the website if that's easier and I'll detect it automatically.";
      case 2:
        return `Great! I'll use the official domain to pull logo, news, and verified firmographics.\n\nWhat's your website address?`;
      case 3:
        return `Perfect! Now let's define your Ideal Customer Profile (ICP). This helps me find the right prospects.\n\nWhat industry are you in?`;
      case 4:
        return `This is important! Every industry has unique data points that matter. For example:\n• Property managers care about: single-family vs multi-family, units managed\n• Tech companies care about: tech stack, funding stage\n• Manufacturers care about: production capacity, certifications\n\nWhat are YOUR 3-5 most important qualifying criteria? Type them one at a time or separated by commas (e.g., "Has a CISO, SOC2 certified"), or type "skip" if you'd like to add these later.`;
      case 5:
        return `Thanks! I can gather even better insights if you share additional data sources like your LinkedIn company page or YouTube channel.\n\nFeel free to share any URLs, or just type "skip" to move on.`;
      case 6:
        return `Now, who are your main competitors? Knowing this helps me provide comparative insights.\n\nList 2-5 competitor names separated by commas, or type "skip".`;
      case 7:
        return `Next step: Certain events create urgency for your solution. For example, if you sell security software, a recent data breach is a strong signal.\n\nWhat events make a company more likely to buy from you right now?\n\nPossible responses: answer the question, type "show signals" to see options, or "skip" to continue.`;
      case 8:
        return `Almost done! Who do you typically sell to?\n\nPlease provide job titles (e.g., "VP Sales, CRO, Director of Sales") or type "skip".`;
      case 9:
        return `Here’s what I can dig into for every account. By default I’ll cover all of them.\n${RESEARCH_FOCUS_OPTIONS.map((opt, idx) => `${idx + 1}. ${opt.label}`).join('\n')}\n\nTell me if there’s anything you’d like me to skip, or anything missing that you expect.`;
      default:
        return '';
    }
  };

  const addAgentMessage = async (content: string, withDelay: boolean = true, animate: boolean = true) => {
    if (withDelay) {
      setIsTyping(true);
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    const msgId = `agent-${Date.now()}`;
    setMessages(prev => [...prev, { id: msgId, role: 'agent', content: '', streaming: true }]);
    setIsTyping(false);

    if (animate) {
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
    } else {
      setMessages(prev => prev.map(msg => (msg.id === msgId ? { ...msg, content } : msg)));
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

  const handleSkip = async () => {
    if (welcomeMode || isTyping) return;
    if (currentStep === 9) {
      await finishOnboarding([]);
      return;
    }
    const skippable = new Set([4, 5, 6, 7, 8]);
    if (!skippable.has(currentStep)) return;
    addUserMessage('skip');
    await processUserInput('skip');
  };

  const processUserInput = async (input: string) => {
    const lowerInput = input.toLowerCase();

    switch (currentStep) {
      case 1: {
        const affirmations = ['yes', 'y', 'correct', 'same', 'unchanged', 'no change', 'yep', 'yeah'];
        const currentName = profileData.companyName?.trim();

        const looksLikeUrl = /\./.test(input) || input.startsWith('http');
        if (looksLikeUrl) {
          try {
            const normalizedUrl = input.startsWith('http') ? input : `https://${input}`;
            const parsed = new URL(normalizedUrl);
            const sanitizedUrl = parsed.origin;
            const guessedName = deriveCompanyNameFromUrl(normalizedUrl);
            const finalName = guessedName || input.replace(/^https?:\/\//, '');

            setProfileData(prev => ({
              ...prev,
              companyName: finalName,
              companyUrl: sanitizedUrl,
            }));

            await saveProgress(3, {
              company_name: finalName,
              company_url: sanitizedUrl
            });

            setCurrentStep(3);
            await addAgentMessage(
              `Got it — I'll research for ${finalName}.\n\nNow, what's your role?\n\n• BDR/SDR (finding new prospects)\n• AE (researching existing accounts)\n• Marketing\n• Other`
            );
            break;
          } catch {
            await addAgentMessage("That looks like a partial link. Paste the full domain (e.g., acme.com) or type the company name and I'll look it up for you.");
            return;
          }
        }

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
          await addAgentMessage("That seems quite short. Try the full company name (e.g., 'Acme Corp') or paste the website.");
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
          signalList += 'Type the signals you want to track (e.g., "security breach, leadership change") or "skip"';
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
        const human = (list: string[]) => list.map(x => x.replace(/_/g, ' ')).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(', ');
        await addAgentMessage(`Now tracking: ${human(merged)}\n\nType more or "done" to continue.`);
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

const inferFieldTypeFromCriterion = (criterion: string): 'text' | 'number' | 'boolean' | 'list' => {
  const lower = criterion.toLowerCase();
  if (/count|number of|revenue|employees|growth|%|percent|pipeline|budget|headcount|ARR|MRR/.test(lower)) {
    return 'number';
  }
  if (/has |have |do they|does it|is there|compliance|certified|yes|no/.test(lower)) {
    return 'boolean';
  }
  if (/list|titles|tools|stack|technolog|vendors|platforms/.test(lower)) {
    return 'list';
  }
  return 'text';
};

const deriveCompanyNameFromUrl = (raw: string): string => {
  try {
    const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, '');
    const segment = host.split('.')[0] || host;
    return segment
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch {
    return '';
  }
};

  const promptImportanceForCriterion = async (criterion: string) => {
    const inferred = inferFieldTypeFromCriterion(criterion);
    setTempCriterion({ field_name: criterion, field_type: inferred });
    setCurrentCriterionStep('importance');
    await addAgentMessage(
      `How important is "${criterion}"?\n• Critical (must have)\n• Important (nice to have)\n• Optional (bonus)`
    );
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
        await promptImportanceForCriterion(pendingCriteria[currentCriterionIndex + 1]);
      } else {
        setPendingCriteria([]);
        setCurrentCriterionIndex(-1);
        setCurrentCriterionStep(null);

        const criteriaList = customCriteria.concat([newCriterion]).map((c, idx) => {
          const importanceLabel = (c.importance || '').charAt(0).toUpperCase() + (c.importance || '').slice(1);
          return `${idx + 1}. ${c.field_name}${c.importance ? ` — ${importanceLabel}` : ''}`;
        }).join('\n');

        await addAgentMessage(
          `Excellent! I've saved all your criteria:\n\n${criteriaList}\n\nYou can add more criteria, or type "done" to continue. You can refine these later in Settings if needed.`
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
    const criteriaListFormatted = newCriteria.map((c, idx) => `${idx + 1}. ${c}`).join('\n');

    await addAgentMessage(
      `Got it! I've identified ${newCriteria.length} ${newCriteria.length === 1 ? 'criterion' : 'criteria'}:\n\n${criteriaListFormatted}\n\nI'll make sensible assumptions about the data type for each one. Let's talk about priority next.`
    );

    await promptImportanceForCriterion(newCriteria[0]);
  };

  const handleResearchFocusInput = async (input: string) => {
    const lowerInput = input.toLowerCase();

    if (lowerInput === 'all' || lowerInput.includes('all of those') || lowerInput.includes('all of them') || lowerInput.includes('all of these') || lowerInput.includes('everything')) {
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
        "Use the checkboxes below to fine-tune what I emphasize, or leave everything checked and continue."
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

    const payload = {
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
    };

    const { data: profileRow, error } = await supabase
      .from('company_profiles')
      .upsert(payload, {
        onConflict: 'user_id'
      })
      .select('*')
      .single();

    if (error) {
      console.error('Failed to finalize onboarding profile', error);
    }

    const mergedProfile = profileRow
      ? {
          ...profileRow,
          research_focus: researchFocus,
          onboarding_complete: true,
          onboarding_step: 9
        }
      : {
          ...payload
        };

    if (profileRow || !error) {
      primeUserProfileCache(user.id, mergedProfile, {
        customCriteriaCount: customCriteria.length,
        signalPreferencesCount: selectedSignals.length,
        disqualifiersCount: 0
      });
    } else {
      invalidateUserProfileCache(user.id);
    }

    navigate('/', { replace: true });
    // Best-effort: default research preference to 'deep' without blocking
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          fetch('/api/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ prompt_config: { preferred_research_type: 'deep' } })
          }).catch(() => {});
          try { localStorage.setItem('preferred_research_type', 'deep'); } catch {}
        }
      } catch {}
    })();
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

  const inputMetadata = useMemo(() => {
    if (welcomeMode) {
      return {
        label: "What should I get ready for you?",
        helper: 'Jump straight into research or let me gather preferences—either way, you can change these anytime.',
        placeholder: 'Research Boeing or “Help me set up”',
      };
    }

    switch (currentStep) {
      case 1:
        return {
          label: 'Company name or website',
          helper: 'Paste the full domain (acme.com) or type the company name. I’ll verify it and pull the official details.',
          placeholder: 'Acme Corp or acme.com',
        };
      case 2:
        return {
          label: 'Company website',
          helper: "Confirm the domain you want me to monitor and enrich. Paste any variation—I'll normalize it.",
          placeholder: 'https://acme.com',
        };
      case 3:
        return {
          label: 'Your role',
          helper: 'Helps personalize recommendations (e.g., Account Executive, VP of Sales, RevOps Lead).',
          placeholder: 'Account Executive',
        };
      default:
        return {
          label: 'Your answer',
          helper: undefined,
          placeholder: 'Type your answer...',
        };
    }
  }, [currentStep, welcomeMode]);

  const canSkip = !welcomeMode && [4, 5, 6, 7, 8].includes(currentStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Welcome Agent</h1>
              {!welcomeMode && (
                <p className="text-sm text-blue-100">
                  Step {currentStep} of 9 <span aria-hidden="true">•</span> ≈ 2 minutes total
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="h-[500px] overflow-y-auto p-6 space-y-4">
          {welcomeMode && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5" data-testid="onboarding-welcome">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg">👋</div>
                <div className="flex-1">
                  <div className="mb-2">
                    <div className="text-sm text-gray-900 font-semibold">Hey! I'm your Welcome Agent.</div>
                  </div>
                  <div className="text-sm text-gray-700 mb-4">
                    I help sales teams research companies, find hot leads, and track accounts.
                    <br />
                    <span className="font-semibold">What I can do (besides individual research):</span>
                    <ul className="list-disc ml-6 mt-1 space-y-1">
                      <li>Run <span className="font-medium">bulk research</span> from a CSV for many companies</li>
                      <li><span className="font-medium">Track accounts</span> and monitor signals (breaches, leadership changes, funding)</li>
                      <li><span className="font-medium">Save reports</span>, export to PDF, and <span className="font-medium">draft outreach</span></li>
                      <li><span className="font-medium">Summarize</span> any response (High Level + key bullets)</li>
                    </ul>
                    <div className="mt-2"><span className="font-semibold">How it works:</span> Ask me anything and I’ll adapt — or set me up in 5 minutes.</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Guided setup FIRST */}
                    <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer" data-testid="onboarding-guided" onClick={() => selectPath('guided')}>
                      <div className="text-2xl">🛠️</div>
                      <div className="font-semibold text-gray-900 mt-1">Take 5 minutes to set up your Research Agent</div>
                      <div className="text-sm text-gray-700">Help me help you — I’ll personalize research, signals, and contacts.</div>
                      <div className="text-xs text-gray-600 mt-2">I’ll ask about your role, what you’re looking for, and what data matters.</div>
                    </div>
                    {/* Immediate research SECOND */}
                    <div className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer" data-testid="onboarding-immediate" onClick={() => selectPath('immediate')}>
                      <div className="text-2xl">🚀</div>
                      <div className="font-semibold text-gray-900 mt-1">Dive into research now</div>
                      <div className="text-sm text-gray-600">Set it up as you go — I’ll automate and learn.</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="text-xs bg-gray-100 rounded-full px-2.5 py-1" onClick={(e) => { e.stopPropagation(); selectPath('immediate', 'Research Boeing'); }}>Research Boeing</button>
                        <button className="text-xs bg-gray-100 rounded-full px-2.5 py-1" onClick={(e) => { e.stopPropagation(); selectPath('immediate', 'Find companies like Stripe'); }}>Find companies like Stripe</button>
                        <button className="text-xs bg-gray-100 rounded-full px-2.5 py-1" onClick={(e) => { e.stopPropagation(); selectPath('immediate', 'What can you do?'); }}>What can you do?</button>
                      </div>
                    </div>
                  </div>

                  {/* Intentionally minimal — keep focus on the two primary paths */}
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
          {currentStep === 9 ? (
            <div className="space-y-4" role="group" aria-label="Select research focus areas">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">Final step — tailor your agent</p>
                <p className="text-xs text-gray-600">I’ll pull all of these by default. Uncheck anything you don’t need, or highlight the topics that matter most. You can adjust this anytime in Settings.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full border border-blue-200 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40"
                  onClick={() => setSelectedFocus(Array.from(new Set([...(recommendedFocus.length ? recommendedFocus : []), ...selectedFocus])))}
                  disabled={recommendedFocus.length === 0}
                >
                  Use recommended
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100"
                  onClick={() => setSelectedFocus(RESEARCH_FOCUS_OPTIONS.map(opt => opt.id))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-700 bg-white hover:bg-gray-100"
                  onClick={() => setSelectedFocus([])}
                >
                  Clear selection
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {RESEARCH_FOCUS_OPTIONS.map(opt => {
                  const checked = selectedFocus.includes(opt.id);
                  return (
                    <label key={opt.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}`}>
                      <input
                        type="checkbox"
                        className="mt-1 w-4 h-4"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedFocus(prev => e.target.checked ? Array.from(new Set([...prev, opt.id])) : prev.filter(id => id !== opt.id));
                        }}
                        aria-label={opt.label}
                      />
                      <span className="text-sm text-gray-800 leading-tight">{opt.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-500">We’ll use this to highlight the most relevant insights. You can update preferences later.</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => { void finishOnboarding([]); }}
                  disabled={isTyping}
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => { void finishOnboarding(selectedFocus); }}
                  disabled={isTyping}
                >
                  Create my agent
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="welcome-agent-input" className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  {inputMetadata.label}
                </label>
                {inputMetadata.helper && (
                  <p id="welcome-agent-helper" className="text-xs text-gray-500 mb-2">
                    {inputMetadata.helper}
                  </p>
                )}
                <input
                  id="welcome-agent-input"
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={inputMetadata.placeholder}
                  aria-describedby={inputMetadata.helper ? 'welcome-agent-helper' : undefined}
                  aria-label="Onboarding input"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  autoFocus
                  disabled={isTyping}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  aria-label="Continue onboarding"
                  className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">Continue</span>
                </button>
                {canSkip && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="text-xs font-medium text-gray-600 hover:text-gray-800"
                  >
                    Skip this step
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
