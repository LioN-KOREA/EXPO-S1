'use client';

import { ChatPane } from '@/components/messenger/ChatPane';

interface InterpreterMessengerClientProps {
  threadId: string;
  currentUserId: string;
}

export function InterpreterMessengerClient({
  threadId,
  currentUserId,
}: InterpreterMessengerClientProps) {
  return (
    <ChatPane threadId={threadId} currentUserId={currentUserId} currentUserRole="interpreter" />
  );
}
