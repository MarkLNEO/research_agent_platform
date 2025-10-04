import { ThumbsUp, ThumbsDown, Copy, RotateCcw, Coins } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { useToast } from './ToastProvider';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  userName?: string;
  showActions?: boolean;
  streaming?: boolean;
  onPromote?: () => void;
  disablePromote?: boolean;
  onRetry?: () => void;
  metadata?: Record<string, unknown>;
  usage?: { tokens: number; credits: number };
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="streamdown-wrapper text-gray-900">
      <Streamdown
        className="prose prose-gray max-w-none"
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4 text-gray-900">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mt-7 mb-3 text-gray-900">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-6 mb-3 text-gray-900">{children}</h3>,
          h4: ({ children }) => <h4 className="text-base font-semibold mt-5 mb-2 text-gray-900">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-semibold mt-4 mb-2 text-gray-900">{children}</h5>,
          h6: ({ children }) => <h6 className="text-sm font-semibold mt-4 mb-2 text-gray-700">{children}</h6>,
          p: ({ children }) => <p className="mb-4 leading-relaxed text-gray-800">{children}</p>,
          ul: ({ children }) => <ul className="list-disc ml-6 my-3 space-y-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-6 my-3 space-y-1.5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">{children}</code>,
          pre: ({ children }) => <pre className="bg-gray-100 p-3 rounded-lg my-3 overflow-x-auto">{children}</pre>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-4 my-3 italic text-gray-700">{children}</blockquote>,
          a: ({ children, href }) => <a href={href} className="text-blue-600 hover:text-blue-700 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <table className="min-w-full divide-y divide-gray-200 my-3">{children}</table>,
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          tbody: ({ children }) => <tbody className="bg-white divide-y divide-gray-200">{children}</tbody>,
          th: ({ children }) => <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th>,
          td: ({ children }) => <td className="px-4 py-2 text-sm text-gray-900">{children}</td>,
          hr: () => <hr className="my-6 border-gray-200" />,
        }}
      >
        {content}
      </Streamdown>
    </div>
  );
}

export function MessageBubble({
  role,
  content,
  userName = 'Y',
  showActions = false,
  streaming = false,
  onPromote,
  disablePromote,
  onRetry,
  usage,
}: MessageBubbleProps) {
  const { addToast } = useToast();

  if (role === 'user') {
    return (
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
          {userName}
        </div>
        <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-gray-900">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <MarkdownContent content={content} />
        {streaming && content && (
          <span className="inline-block w-0.5 h-4 bg-blue-600 ml-1 animate-pulse" />
        )}
        {streaming && !content && (
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
          </div>
        )}
      </div>

      {showActions && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title="Copy"
              aria-label="Copy message"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(content);
                  addToast({ type: 'success', title: 'Copied to clipboard' });
                } catch {
                  addToast({ type: 'error', title: 'Copy failed', description: 'Select and copy manually.' });
                }
              }}
            >
              <Copy className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              className="p-1.5 hover:bg-gray-100 rounded transition-colors" 
              title="Like"
              onClick={() => addToast({ type: 'success', title: 'Feedback recorded', description: 'Thanks for your input!' })}
            >
              <ThumbsUp className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              className="p-1.5 hover:bg-gray-100 rounded transition-colors" 
              title="Dislike"
              onClick={() => addToast({ type: 'info', title: 'Feedback recorded', description: 'We\'ll work on improving this.' })}
            >
              <ThumbsDown className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {onRetry && (
            <button 
              onClick={onRetry}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1" 
              aria-label="Retry generation"
            >
              Retry
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          {onPromote && (
            <button
              onClick={onPromote}
              disabled={disablePromote}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              aria-label="Save to Research"
            >
              Save to Research
            </button>
          )}

          {usage && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto mr-2">
              <Coins className="w-3.5 h-3.5" />
              <span className="font-medium">{usage.tokens.toLocaleString()} tokens</span>
              <span className="text-gray-400">•</span>
              <span>~{usage.credits} credits</span>
            </div>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            Agent can make mistakes. Please double-check responses.
          </span>
        </div>
      )}
    </div>
  );
}
