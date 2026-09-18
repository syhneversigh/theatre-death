import { readFileSync } from 'node:fs';

export interface LoginAccount {
  username: string;
  password: string;
}

export interface RegistrationAccount extends LoginAccount {
  invitation: string;
}

export interface ResetAccount extends LoginAccount {
  token: string;
}

export interface RoomAccount extends LoginAccount {
  userId: string;
}

export interface AccountCase extends RegistrationAccount {
  lost: RegistrationAccount;
  reset: ResetAccount;
  rooms?: RoomAccount[];
}

export function loadAccountCase(projectName: string): AccountCase {
  if (projectName !== 'chromium' && projectName !== 'webkit') throw new Error(`unsupported browser project: ${projectName}`);
  const all = JSON.parse(readFileSync('/test-access/accounts.json', 'utf8')) as Record<string, AccountCase | undefined>;
  const account = all[projectName];
  if (!account) throw new Error(`missing disposable account case for ${projectName}`);
  return account;
}

export function newPasswordFor(username: string): string {
  return `V2-changed-${username}-password`;
}

export function staticPng(): Buffer {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
}

export function invalidSvg(): Buffer {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
}

export function corruptPng(): Buffer {
  return Buffer.from('\x89PNG\r\n\x1a\nthis is not a decodable PNG', 'binary');
}
