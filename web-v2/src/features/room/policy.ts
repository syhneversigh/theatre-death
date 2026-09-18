import type { RoomAction, RoomMemberDTO, RoomSnapshot } from '../../../../contracts/v2.ts';

export function canManageMember(view: RoomSnapshot, action: 'kick' | 'transfer-host', memberId: string): boolean {
  const target = [...view.room.formalMembers, ...view.room.spectators].find(member => member.memberId === memberId);
  if (!target || target.memberId === view.viewer.memberId) return false;
  if (action === 'transfer-host') return view.capabilities.room.transferHost.allowed && target.kind === 'formal' && target.presence === 'online';
  return target.kind === 'formal' ? view.capabilities.room.kickFormal.allowed : view.capabilities.room.kickSpectator.allowed;
}

export function roomActionAllowed(view: RoomSnapshot, action: RoomAction): boolean {
  return view.capabilities.room[action].allowed;
}

export function memberLabel(member: RoomMemberDTO, viewerId: string): string {
  return member.username + (member.userId === viewerId ? '（你）' : '') + (member.isHost ? ' · 房主' : '');
}
