/** Public transport vocabulary. No database rows or unfiltered engine state belong here. */
export const CONTRACT_VERSION = '2.1' as const;
export type RoomPhase = 'lobby' | 'playing' | 'review';
export type MemberKind = 'formal' | 'public_spectator' | 'private_spectator';
export type Presence = 'online' | 'reconnecting' | 'offline';
export interface Profile { userId: string; username: string; avatarUrl: string | null; profileVersion: number }
export interface RoomMemberDTO extends Profile {
  memberId: string;
  kind: MemberKind;
  playerId: string | null;
  ready: boolean | null;
  presence: Presence;
  joinedAt: number;
  isHost: boolean;
}
export interface Permission { allowed: boolean; reason: string | null }
export type ControlReason = 'kicked' | 'dissolved' | 'taken_over' | 'session_expired' | 'host_changed' | 'review_ended' | 'left' | 'screen_revoked';
export interface ControlNotice { roomId: string; gameId: string | null; reason: ControlReason }
export interface RequestIntent { requestId: string }
export interface MatchIntent extends RequestIntent { gameId: string }
export interface CommandIntent extends MatchIntent { windowInstanceId: string; action: string }
export interface CommandReceipt {
  requestId: string;
  status: 'accepted' | 'rejected';
  code: string | null;
  message: string | null;
}
export type ReceiptLookup = CommandReceipt | { requestId: string; status: 'not_seen' | 'pending' };
export interface ChatMessageDTO { messageId: string; clientMessageId: string; cursor: number; senderId: string; text: string; at: number }
export interface ErrorEnvelope { error: { code: string; message?: string } }
