import { useState } from 'react';
import type { Citation } from '../../../shared/types';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

interface CitationCardProps {
  citation: Citation;
  index: number;
}

export function CitationCard({ citation, index }: CitationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-2 overflow-hidden hover:border-mavenir-blue transition-colors">
      <div 
        className="p-3 flex items-center justify-between cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-mavenir-blue text-white flex items-center justify-center text-xs font-bold">
            {index + 1}
          </div>
          <div>
            <div className="flex items-center space-x-2 text-sm font-semibold text-mavenir-dark">
              <FileText className="w-4 h-4 text-mavenir-blue" />
              <span>{citation.spec}</span>
              <span className="text-gray-400">•</span>
              <span>Page {citation.page}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
              {citation.clause}
            </div>
          </div>
        </div>
        <button className="text-gray-400 hover:text-mavenir-blue">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 bg-white border-t border-gray-100">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Snippet</div>
          <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-100 font-mono italic">
            "{citation.snippet || 'No snippet available.'}"
          </div>
        </div>
      )}
    </div>
  );
}
