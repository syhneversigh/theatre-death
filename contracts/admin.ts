export type AdminAccountStatus = 'active' | 'disabled';
export type AdminInvitationPurpose = 'register' | 'reset';
export type AdminInvitationStatus = 'active' | 'used' | 'revoked' | 'expired';

export interface AdminRoomSummary {
  roomId: string; roomCode: string; phase: 'lobby' | 'playing' | 'review'; kind: 'formal' | 'public_spectator' | 'private_spectator' | null;
}
export interface AdminAccountSummary {
  userId: string; username: string; createdAt: number; disabledAt: number | null; status: AdminAccountStatus;
  avatarUrl: string | null; profileVersion: number; activeSessionCount: number; room: AdminRoomSummary | null;
}
export interface AdminInvitationSummary {
  id: string; purpose: AdminInvitationPurpose; targetUserId: string | null; targetUsername: string | null;
  createdAt: number | null; expiresAt: number; usedAt: number | null; revokedAt: number | null; status: AdminInvitationStatus;
}
export interface AdminAuditEntry { id: number; action: string; targetType: 'account' | 'invitation' | 'auth'; targetId: string | null; at: number; details: Record<string, string | number | boolean | null> }
export interface AdminSummary { accounts: { total: number; active: number; disabled: number; activeSessions: number }; invitations: Record<AdminInvitationStatus, number>; avatars: { total: number; referenced: number }; recentActions: AdminAuditEntry[] }
export interface AdminPage<T> { items: T[]; page: number; pageSize: number; total: number }
export interface AdminSecretResult { id: string; token: string; expiresAt: number; purpose: AdminInvitationPurpose }
