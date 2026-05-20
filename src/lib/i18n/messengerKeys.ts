// 메신저 i18n 키 — dictionaries.ts 폭증 방지를 위한 영역별 분리 시범.
// dictionaries.ts 가 import 해서 interpreter 사전에 병합. 향후 다른 도메인도 같은 패턴 적용 가능.

export const messengerKo = {
  messengerTitle: '메시지',
  messengerNoThreads: '대화가 없습니다',
  messengerThreadStart: '대화 시작',
  messengerInputPlaceholder: '메시지를 입력하세요',
  messengerSend: '전송',
  messengerSending: '전송 중…',
  messengerToAdmin: '관리자에게 보내기',
  messengerLoading: '메시지 불러오는 중…',
  messengerEmpty: '아직 메시지가 없습니다. 먼저 보내보세요.',
  messengerLoadError: '메시지 조회 실패',
  messengerSendError: '메시지 전송 실패',
  messengerSenderAdmin: '관리자',
  messengerSelectInterpreter: '왼쪽에서 통역사를 선택하세요',
} as const;

export const messengerEn = {
  messengerTitle: 'Messages',
  messengerNoThreads: 'No conversations',
  messengerThreadStart: 'Start chat',
  messengerInputPlaceholder: 'Type a message',
  messengerSend: 'Send',
  messengerSending: 'Sending…',
  messengerToAdmin: 'Message admin',
  messengerLoading: 'Loading messages…',
  messengerEmpty: 'No messages yet. Send one.',
  messengerLoadError: 'Failed to load messages',
  messengerSendError: 'Failed to send',
  messengerSenderAdmin: 'Admin',
  messengerSelectInterpreter: 'Pick an interpreter from the left',
} as const;

export type MessengerKeys = typeof messengerKo;
