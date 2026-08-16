import ReactMarkdown from 'react-markdown';
import { User, Bot } from 'lucide-react';
import type { ChatMessage } from '../hooks/useChat';
import { CitationCard } from './CitationCard';
import { AbstainNotice } from './AbstainNotice';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
          isUser ? 'bg-mavenir-dark text-white ml-3' : 'bg-mavenir-blue text-white mr-3'
        }`}>
          {isUser ? <User size={20} /> : <Bot size={20} />}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`px-5 py-4 rounded-2xl shadow-sm ${
            isUser 
              ? 'bg-mavenir-dark text-white rounded-tr-sm' 
              : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm'
          }`}>
            {!isUser && message.citations && message.citations.length > 0 && !message.abstained && (
              <div className="mb-4">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Sources
                </div>
                <div className="flex flex-wrap gap-2">
                  {message.citations.map((citation, index) => (
                    <CitationCard key={`${message.id}-cite-${index}`} citation={citation} index={index} />
                  ))}
                </div>
              </div>
            )}

            {message.abstained && !isUser ? (
              <AbstainNotice message={message.content} />
            ) : (
              <div className="prose prose-sm max-w-none text-current marker:text-current">
                <ReactMarkdown
                  components={{
                    a: ({ node, ...props }) => {
                      // Custom rendering for inline citation markers like [1]
                      const match = /\[(\d+)\]/.exec(props.children?.toString() || '');
                      if (match) {
                        return (
                          <span 
                            className="inline-flex items-center justify-center w-5 h-5 mx-1 rounded-full bg-blue-100 text-mavenir-blue text-[10px] font-bold cursor-help hover:bg-blue-200 transition-colors"
                            title={`Citation ${match[1]}`}
                          >
                            {match[1]}
                          </span>
                        );
                      }
                      return <a {...props} className="text-mavenir-blue hover:underline" />;
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
