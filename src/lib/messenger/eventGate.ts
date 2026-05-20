// Re-export from lib/events/eventGate (공용 폴더로 이전).
// import 경로 호환 유지 — 후속 슬라이스에서 lib/events 로 일괄 정리 권장.
export { isEventClosed, type EventLike } from '@/lib/events/eventGate';
