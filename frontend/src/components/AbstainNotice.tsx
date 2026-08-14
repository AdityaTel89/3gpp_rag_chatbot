import { AlertTriangle } from 'lucide-react';

interface AbstainNoticeProps {
  message: string;
}

export function AbstainNotice({ message }: AbstainNoticeProps) {
  return (
    <div className="flex items-start p-4 mb-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg shadow-sm">
      <AlertTriangle className="w-6 h-6 text-amber-500 mr-3 flex-shrink-0 mt-0.5" />
      <div>
        <h3 className="text-sm font-semibold text-amber-800 mb-1">
          Low Confidence or Out of Scope
        </h3>
        <p className="text-sm text-amber-700">
          {message}
        </p>
      </div>
    </div>
  );
}
