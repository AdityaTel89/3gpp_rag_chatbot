import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { SpecFilterDropdown } from './SpecFilterDropdown';

export function ChatWindow() {
  const { messages, isLoading, error, selectedSpec, setSelectedSpec, sendMessage } = useChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-sm z-10">
        <div>
          <h2 className="text-xl font-bold text-mavenir-dark tracking-tight">3GPP Specifications Assistant</h2>
          <p className="text-sm text-gray-500 font-medium">Technical Reference Guide</p>
        </div>
        <SpecFilterDropdown selectedSpec={selectedSpec} onSelect={setSelectedSpec} />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2 bg-mavenir-light/30">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-mavenir-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-mavenir-dark mb-2">How can I help you today?</h3>
            <p className="text-gray-500 max-w-md">
              Ask questions about 3GPP standards, network architectures, and technical specifications.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start mb-6">
            <div className="flex items-center space-x-2 px-5 py-4 bg-white border border-gray-100 rounded-2xl rounded-tl-sm shadow-sm">
              <Loader2 className="w-5 h-5 text-mavenir-blue animate-spin" />
              <span className="text-sm text-gray-500 font-medium">Analyzing specifications...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center my-4">
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium border border-red-100 shadow-sm">
              {error}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about 3GPP specs..."
            disabled={isLoading}
            className="w-full pl-6 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-mavenir-blue focus:border-transparent transition-all disabled:opacity-50 text-mavenir-dark"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-mavenir-blue text-white rounded-full hover:bg-mavenir-blue-hover disabled:opacity-50 disabled:hover:bg-mavenir-blue transition-colors flex items-center justify-center"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
        <div className="text-center mt-3">
          <span className="text-xs text-gray-400">
            Information is referenced from 3GPP specifications. Please verify critical details.
          </span>
        </div>
      </div>
    </div>
  );
}
