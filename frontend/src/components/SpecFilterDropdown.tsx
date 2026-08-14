import { useEffect, useState } from 'react';
import { Filter, Loader2, ChevronDown } from 'lucide-react';

interface SpecFilterDropdownProps {
  selectedSpec: string | undefined;
  onSelect: (spec: string | undefined) => void;
}

interface Spec {
  spec_id: string;
  release: string;
}

export function SpecFilterDropdown({ selectedSpec, onSelect }: SpecFilterDropdownProps) {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    async function fetchSpecs() {
      try {
        const response = await fetch('/api/specs');
        if (response.ok) {
          const data = await response.json();
          setSpecs(data);
        }
      } catch (err) {
        console.error('Failed to fetch specs:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSpecs();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading specs...
      </div>
    );
  }

  if (specs.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-mavenir-blue hover:text-mavenir-blue transition-colors focus:outline-none shadow-sm"
      >
        <Filter className="w-4 h-4" />
        <span className="font-medium">
          {selectedSpec ? `Filtered: ${selectedSpec}` : 'All Specifications'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="py-1">
            <button
              onClick={() => {
                onSelect(undefined);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                !selectedSpec ? 'bg-blue-50 text-mavenir-blue font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              All Specifications
            </button>
            {specs.map((spec) => (
              <button
                key={spec.spec_id}
                onClick={() => {
                  onSelect(spec.spec_id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  selectedSpec === spec.spec_id ? 'bg-blue-50 text-mavenir-blue font-semibold' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {spec.spec_id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
