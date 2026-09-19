import { useEffect, useState, type FormEvent } from 'react';
import type { AdminAccountSummary, AdminInvitationSummary, AdminPage, AdminSecretResult, AdminSummary } from '../../../contracts/admin.ts';
import { Avatar, Emblem, Field, Modal, Notice, PageHeading } from '../components/ui.tsx';
import { ApiFailure, UnknownResult, errorMessage, request } from '../transport/http.ts';
import { newRequestId } from '../transport/ids.ts';

type Tab = 'overview' | 'accounts' | 'invitations';
type Confirmation = { title: string; description: string; path: string };
type Pending = { path: string; method: 'POST' | 'PATCH'; body: Record<string, unknown> };
const pageSize = 25;
const dateTime = (value: number | null) => value === null ? '—' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
const statusText = { active: '可使用', used: '已使用', revoked: '已撤销', expired: '已过期' } as const;
const adminMessages: Record<string, string> = {
  invalid_admin_credentials: '管理员密码不正确。', admin_unauthorized: '管理员登录已失效，请重新登录。', admin_not_configured: '管理员功能尚未配置。',
  username_taken: '该账号名已被使用。', account_in_active_game: '对局或复盘中的账号暂不能改名。', account_disabled: '该账号已停用。',
  invitation_not_active: '该邀请码已经使用、撤销或过期。', invalid_expiry: '有效期必须在5分钟至30天之间。', request_id_reused: '请求编号已用于其他操作。',
};
const adminError = (error: unknown) => error instanceof ApiFailure ? adminMessages[error.code] ?? errorMessage(error) : errorMessage(error);

export function AdminApp() {
  const [mode, setMode] = useState<'loading' | 'disabled' | 'login' | 'ready'>('loading');
  const [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const [tab, setTab] = useState<Tab>('overview'), [summary, setSummary] = useState<AdminSummary | null>(null);
  const [accounts, setAccounts] = useState<AdminPage<AdminAccountSummary> | null>(null), [invitations, setInvitations] = useState<AdminPage<AdminInvitationSummary> | null>(null);
  const [query, setQuery] = useState(''), [accountStatus, setAccountStatus] = useState('all'), [inviteStatus, setInviteStatus] = useState('all'), [invitePurpose, setInvitePurpose] = useState('all');
  const [accountPage, setAccountPage] = useState(1), [invitePage, setInvitePage] = useState(1), [ttlSeconds, setTtlSeconds] = useState(604800);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null), [rename, setRename] = useState<AdminAccountSummary | null>(null), [renameValue, setRenameValue] = useState('');
  const [secret, setSecret] = useState<AdminSecretResult | null>(null), [pending, setPending] = useState<Pending | null>(null), [expiryInvite, setExpiryInvite] = useState<AdminInvitationSummary | null>(null), [expiryValue, setExpiryValue] = useState('');

  const load = async () => {
    const [nextSummary, nextAccounts, nextInvitations] = await Promise.all([
      request<AdminSummary>('/admin/summary'),
      request<AdminPage<AdminAccountSummary>>(`/admin/accounts?query=${encodeURIComponent(query)}&status=${accountStatus}&page=${accountPage}&pageSize=${pageSize}`),
      request<AdminPage<AdminInvitationSummary>>(`/admin/invitations?status=${inviteStatus}&purpose=${invitePurpose}&page=${invitePage}&pageSize=${pageSize}`),
    ]);
    setSummary(nextSummary); setAccounts(nextAccounts); setInvitations(nextInvitations); setFailure('');
  };
  useEffect(() => {
    void request('/admin/me').then(() => { setMode('ready'); return load(); }).catch(error => {
      if (error instanceof ApiFailure && error.code === 'admin_not_configured') setMode('disabled');
      else if (error instanceof ApiFailure && error.code === 'admin_unauthorized') setMode('login');
      else { setMode('login'); setFailure(adminError(error)); }
    });
  }, []);
  const failed = (error: unknown) => { if (error instanceof ApiFailure && error.code === 'admin_unauthorized') { setMode('login'); setSummary(null); setAccounts(null); setInvitations(null); } setFailure(adminError(error)); };
  useEffect(() => { if (mode === 'ready') void load().catch(failed); }, [accountPage, invitePage, accountStatus, inviteStatus, invitePurpose]);

  const login = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setFailure('');
    try { await request('/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); setPassword(''); setMode('ready'); await load(); }
    catch (error) { if (error instanceof ApiFailure && error.code === 'admin_not_configured') setMode('disabled'); else setFailure(adminError(error)); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); try { await request('/admin/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
    finally { setSummary(null); setAccounts(null); setInvitations(null); setMode('login'); setBusy(false); }
  };
  const mutate = async <T,>(path: string, body: Record<string, unknown> = {}, method: 'POST' | 'PATCH' = 'POST', reuse?: Pending, reload = true): Promise<T | null> => {
    const intent = reuse ?? { path, method, body: { ...body, requestId: newRequestId() } }; setBusy(true); setFailure('');
    try { const result = await request<T>(intent.path, { method: intent.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intent.body) }); setPending(null); if (reload) await load(); return result; }
    catch (error) { if (error instanceof UnknownResult || error instanceof ApiFailure && error.status >= 500) setPending(intent); failed(error); return null; }
    finally { setBusy(false); }
  };
  const createInvite = async () => { const result = await mutate<AdminSecretResult>('/admin/invitations', { ttlSeconds }); if (result) setSecret(result); };
  const regenerate = async (invite: AdminInvitationSummary) => { const result = await mutate<AdminSecretResult>(`/admin/invitations/${encodeURIComponent(invite.id)}/regenerate`, { ttlSeconds }); if (result) setSecret(result); };
  const runConfirmation = async () => { if (!confirmation) return; const current = confirmation; setConfirmation(null); const result = await mutate<AdminSecretResult | Record<string, unknown>>(current.path); if (current.path.endsWith('/reset-token') && result && 'token' in result) setSecret(result as AdminSecretResult); };
  const retryPending = async () => { if (!pending) return; const result = await mutate<AdminSecretResult | Record<string, unknown>>(pending.path, {}, pending.method, pending); if (result && 'token' in result) setSecret(result as AdminSecretResult); };

  if (mode === 'loading') return <main className="splash"><Emblem/><h1>剧院管理</h1><p role="status">正在确认管理员配置…</p></main>;
  if (mode === 'disabled') return <main className="splash"><Emblem/><h1>剧院管理</h1><Notice error>管理员功能尚未配置。请设置至少16位的 ADMIN_PASSWORD 后重启服务。</Notice><a className="button" href="/">返回玩家入口</a></main>;
  if (mode === 'login') return <main className="admin-login"><form className="auth-card panel" onSubmit={login}><Emblem/><span className="eyebrow">THEATER ADMINISTRATION</span><h1>剧院管理</h1><p className="muted">维护者入口与玩家账号相互独立。</p>{failure && <Notice error>{failure}</Notice>}<Field label="管理员密码" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password"/><button className="button button--primary button--wide" disabled={busy}>{busy ? '正在验证…' : '进入管理台'}</button><a className="text-button" href="/">返回玩家入口</a></form></main>;

  return <main className="admin-layout"><aside className="navigation"><div className="brand"><Emblem/><span>剧院管理<small>THEATER ADMIN</small></span></div><nav aria-label="管理导航">{([['overview', '概览'], ['accounts', '账户'], ['invitations', '邀请码']] as const).map(([key, label]) => <button key={key} className={`nav-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</nav><div className="nav-profile"><button className="text-button" disabled={busy} onClick={() => void logout()}>退出管理</button><a className="text-button" href="/">玩家入口</a></div></aside><section className="home-main admin-main">
    {failure && <Notice error>{failure}{pending && <span className="button-row"><button className="button" disabled={busy} onClick={() => void load()}>刷新列表</button><button className="button" disabled={busy} onClick={() => void retryPending()}>重试原操作</button></span>}</Notice>}
    {tab === 'overview' && <Overview summary={summary}/>}
    {tab === 'accounts' && <AccountsPage accounts={accounts} query={query} setQuery={setQuery} status={accountStatus} setStatus={value => { setAccountStatus(value); setAccountPage(1); }} page={accountPage} setPage={setAccountPage} busy={busy} search={() => { setAccountPage(1); void load(); }} rename={account => { setRename(account); setRenameValue(account.username); }} confirm={setConfirmation}/>}
    {tab === 'invitations' && <InvitationsPage invitations={invitations} status={inviteStatus} setStatus={value => { setInviteStatus(value); setInvitePage(1); }} purpose={invitePurpose} setPurpose={value => { setInvitePurpose(value); setInvitePage(1); }} page={invitePage} setPage={setInvitePage} busy={busy} ttl={ttlSeconds} setTtl={setTtlSeconds} create={() => void createInvite()} regenerate={invite => void regenerate(invite)} edit={invite => { setExpiryInvite(invite); setExpiryValue(new Date(invite.expiresAt - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)); }} confirm={setConfirmation}/>}
  </section>
  {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)} dismissible={!busy}><p>{confirmation.description}</p><div className="button-row"><button className="button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button className="button button--primary" disabled={busy} onClick={() => void runConfirmation()}>确认操作</button></div></Modal>}
  {rename && <Modal title="修改账号名" onClose={() => setRename(null)} dismissible={!busy}><Field label="新账号名" value={renameValue} minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" onChange={event => setRenameValue(event.target.value)}/><div className="button-row"><button className="button" onClick={() => setRename(null)}>取消</button><button className="button button--primary" disabled={busy} onClick={() => void mutate<{ username: string; profileVersion: number }>(`/admin/accounts/${rename.userId}`, { username: renameValue }, 'PATCH', undefined, false).then(result => { if (!result) return; setQuery(result.username); setAccounts(current => current ? { ...current, items: current.items.map(item => item.userId === rename.userId ? { ...item, username: result.username, profileVersion: result.profileVersion } : item) } : current); setRename(null); })}>保存</button></div></Modal>}
  {expiryInvite && <Modal title="修改到期时间" onClose={() => setExpiryInvite(null)} dismissible={!busy}><Field label="新的到期时间" type="datetime-local" value={expiryValue} onChange={event => setExpiryValue(event.target.value)}/><div className="button-row"><button className="button" onClick={() => setExpiryInvite(null)}>取消</button><button className="button button--primary" disabled={busy || !expiryValue} onClick={() => void mutate(`/admin/invitations/${expiryInvite.id}`, { expiresAt: new Date(expiryValue).getTime() }, 'PATCH').then(result => { if (result) setExpiryInvite(null); })}>保存</button></div></Modal>}
  {secret && <SecretModal secret={secret} close={() => setSecret(null)}/>}</main>;
}

function Overview({ summary }: { summary: AdminSummary | null }) {
  return <><PageHeading eyebrow="ADMIN OVERVIEW" title="资源概览">这里只展示统计与非敏感操作记录。</PageHeading>{summary ? <><div className="admin-stats"><article><strong>{summary.accounts.total}</strong><span>账户</span></article><article><strong>{summary.accounts.activeSessions}</strong><span>活跃会话</span></article><article><strong>{summary.invitations.active}</strong><span>可用邀请码</span></article><article><strong>{summary.avatars.referenced}</strong><span>在用头像</span></article></div><section className="panel"><h2>最近操作</h2><div className="admin-table-wrap"><table><thead><tr><th>时间</th><th>操作</th><th>对象</th></tr></thead><tbody>{summary.recentActions.map(item => <tr key={item.id}><td>{dateTime(item.at)}</td><td>{item.action}</td><td>{item.targetId ?? '管理登录'}</td></tr>)}</tbody></table></div></section></> : <p role="status">正在读取资源…</p>}</>;
}

function AccountsPage({ accounts, query, setQuery, status, setStatus, page, setPage, busy, search, rename, confirm }: { accounts: AdminPage<AdminAccountSummary> | null; query: string; setQuery: (v: string) => void; status: string; setStatus: (v: string) => void; page: number; setPage: (v: number) => void; busy: boolean; search: () => void; rename: (a: AdminAccountSummary) => void; confirm: (v: Confirmation) => void }) {
  return <><PageHeading eyebrow="ACCOUNT DIRECTORY" title="账户管理">停用会立即注销会话；进行中的玩家保留离线席位。</PageHeading><form className="admin-filters" onSubmit={event => { event.preventDefault(); search(); }}><Field label="搜索账号" value={query} onChange={event => setQuery(event.target.value)} placeholder="账号名"/><label className="field"><span className="field__label">状态</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部</option><option value="active">可登录</option><option value="disabled">已停用</option></select></label><button className="button" disabled={busy}>搜索</button></form>{accounts && <><div className="admin-card-list">{accounts.items.map(account => <article className="panel admin-account" key={account.userId}><Avatar url={account.avatarUrl} name={account.username}/><div className="admin-account__body"><h2>{account.username}</h2><p className="muted">{account.status === 'disabled' ? `已停用 · ${dateTime(account.disabledAt)}` : `可登录 · ${account.activeSessionCount} 个活跃会话`}<br/>{account.room ? `房间 ${account.room.roomCode} · ${account.room.phase}` : '当前没有房间'} · 创建于 {dateTime(account.createdAt)}</p><div className="button-row"><button className="button" disabled={busy || account.room?.phase === 'playing' || account.room?.phase === 'review'} onClick={() => rename(account)}>改名</button><button className="button" disabled={busy || !account.avatarUrl} onClick={() => confirm({ title: '清除头像？', description: '账户将恢复默认头像，旧文件进入延迟清理。', path: `/admin/accounts/${account.userId}/clear-avatar` })}>清除头像</button><button className="button" disabled={busy || !account.activeSessionCount} onClick={() => confirm({ title: '注销全部会话？', description: '该账号所有设备都需要重新登录。', path: `/admin/accounts/${account.userId}/revoke-sessions` })}>注销会话</button><button className="button" disabled={busy || account.status === 'disabled'} onClick={() => confirm({ title: '签发密码重置码？', description: '重置码有效30分钟，并且只显示一次。', path: `/admin/accounts/${account.userId}/reset-token` })}>重置码</button><button className={`button ${account.status === 'active' ? 'button--danger' : ''}`} disabled={busy} onClick={() => confirm({ title: account.status === 'active' ? '停用账户？' : '重新启用账户？', description: account.status === 'active' ? '会立即注销全部会话；大厅席位会释放，对局席位保留为离线。' : '恢复登录资格，但不会自动加入大厅。', path: `/admin/accounts/${account.userId}/${account.status === 'active' ? 'disable' : 'enable'}` })}>{account.status === 'active' ? '停用账户' : '重新启用'}</button></div></div></article>)}</div><Pagination page={page} total={accounts.total} setPage={setPage}/></>}</>;
}

function InvitationsPage({ invitations, status, setStatus, purpose, setPurpose, page, setPage, busy, ttl, setTtl, create, regenerate, edit, confirm }: { invitations: AdminPage<AdminInvitationSummary> | null; status: string; setStatus: (v: string) => void; purpose: string; setPurpose: (v: string) => void; page: number; setPage: (v: number) => void; busy: boolean; ttl: number; setTtl: (v: number) => void; create: () => void; regenerate: (v: AdminInvitationSummary) => void; edit: (v: AdminInvitationSummary) => void; confirm: (v: Confirmation) => void }) {
  return <><PageHeading eyebrow="INVITATIONS" title="邀请码管理">邀请码与密码重置码原文只在生成时显示一次。</PageHeading><section className="panel admin-create"><Field label="有效期（分钟）" type="number" min={5} max={43200} value={Math.round(ttl / 60)} onChange={event => setTtl(Number(event.target.value) * 60)} hint="5分钟至30天；重新生成也使用这个有效期。"/><button className="button button--primary" disabled={busy || ttl < 300 || ttl > 2592000} onClick={create}>生成注册邀请码</button></section><div className="admin-filters"><label className="field"><span className="field__label">用途</span><select value={purpose} onChange={event => setPurpose(event.target.value)}><option value="all">全部</option><option value="register">注册</option><option value="reset">密码重置</option></select></label><label className="field"><span className="field__label">状态</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部</option><option value="active">可使用</option><option value="used">已使用</option><option value="revoked">已撤销</option><option value="expired">已过期</option></select></label></div>{invitations && <><div className="admin-table-wrap panel admin-invitation-table"><table><thead><tr><th>用途/对象</th><th>状态</th><th>创建</th><th>到期</th><th>操作</th></tr></thead><tbody>{invitations.items.map(invite => <tr key={invite.id}><td data-label="用途/对象"><strong>{invite.purpose === 'register' ? '注册' : '重置密码'}</strong><small>{invite.targetUsername ?? invite.id.slice(0, 10)}</small></td><td data-label="状态">{statusText[invite.status]}</td><td data-label="创建">{dateTime(invite.createdAt)}</td><td data-label="到期">{dateTime(invite.expiresAt)}</td><td data-label="操作"><div className="button-row">{invite.status === 'active' && <><button className="text-button" onClick={() => edit(invite)}>改到期时间</button><button className="text-button danger-text" onClick={() => confirm({ title: '撤销邀请码？', description: '撤销后该邀请码立即失效。', path: `/admin/invitations/${invite.id}/revoke` })}>撤销</button></>}<button className="text-button" onClick={() => regenerate(invite)}>重新生成</button></div></td></tr>)}</tbody></table></div><Pagination page={page} total={invitations.total} setPage={setPage}/></>}</>;
}

function Pagination({ page, total, setPage }: { page: number; total: number; setPage: (page: number) => void }) { const pages = Math.max(1, Math.ceil(total / pageSize)); return <div className="pagination"><button className="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} / {pages} 页 · 共 {total} 项</span><button className="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button></div>; }
function SecretModal({ secret, close }: { secret: AdminSecretResult; close: () => void }) { return <Modal title={secret.purpose === 'register' ? '注册邀请码已生成' : '密码重置码已生成'} onClose={close}><Notice>此密钥只显示一次，请立即安全保存。</Notice><label className="field"><span className="field__label">一次性密钥</span><input readOnly value={secret.token} onFocus={event => event.currentTarget.select()}/></label><p className="muted">有效期至 {dateTime(secret.expiresAt)} · 撤销ID {secret.id}</p><div className="button-row"><button className="button" onClick={() => void navigator.clipboard.writeText(secret.token)}>复制</button><button className="button button--primary" onClick={close}>我已保存</button></div></Modal>; }
