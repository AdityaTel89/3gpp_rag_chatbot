import type { Citation } from '../../../shared/types';
import { FileText } from 'lucide-react';

interface CitationCardProps {
  citation: Citation;
  index: number;
}

export function CitationCard({ citation, index }: CitationCardProps) {
  return (
    <div 
      className="flex items-center space-x-2 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 hover:bg-gray-50 transition-colors cursor-default max-w-[200px] shadow-sm"
      title={`${citation.spec} - ${citation.clause}`}
    >
      <div className="flex-shrink-0 w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
        {index + 1}
      </div>
      <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-gray-700 truncate block">
          {citation.spec}
        </span>
        <span className="text-[10px] text-gray-500 truncate block">
          Page {citation.page}
        </span>
      </div>
    </div>
  );
}
