import { ChatWindow } from '../components/ChatWindow';

export function ChatPage() {
  return (
    <div className="min-h-screen flex flex-col bg-mavenir-light">
      <header className="bg-mavenir-dark text-white py-4 px-6 shadow-md z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Minimal SVG to represent a cloud-native/network icon inspired by Mavenir's branding */}
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#087BC7" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#087BC7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h1 className="text-2xl font-bold tracking-tight">Mavenir<span className="font-light text-gray-300"> | Assistant</span></h1>
          </div>
          <div className="text-sm font-medium text-gray-300 hidden md:block">
            Specifications Assistant
          </div>
        </div>
      </header>
      
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col">
        <div className="flex-1 h-full min-h-[600px]">
          <ChatWindow />
        </div>
      </main>
    </div>
  );
}
