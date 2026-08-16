import { useState, useCallback } from 'react';
import type { QueryResponse, QueryRequest, Citation } from '../../../shared/types';
import { API_BASE } from '../config';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  abstained?: boolean;
  confidence?: number;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSpec, setSelectedSpec] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const requestBody: QueryRequest = {
        question,
        spec_filter: selectedSpec,
      };

      const response = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as QueryResponse;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        citations: data.citations,
        abstained: data.abstained,
        confidence: data.confidence,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err.message || 'An error occurred while fetching the response.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSpec]);

  return {
    messages,
    isLoading,
    error,
    selectedSpec,
    setSelectedSpec,
    sendMessage,
  };
}
