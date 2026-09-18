import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { BootstrapDTO } from '../../../../contracts/catalog.ts';
import type { AuthMe, Profile } from '../../../../contracts/v2.ts';
import { Avatar, Field, Modal, Notice, PageHeading } from '../../components/ui.tsx';
import { ApiFailure, UnknownResult, errorMessage, get, post } from '../../transport/http.ts';
import { AvatarEditor } from './avatar-editor.tsx';
import { DisplaySettings } from './display-settings.tsx';

export function AccountPage({ bootstrap, profile, onProfile, onExpired }: {
  bootstrap: BootstrapDTO; profile: AuthMe; onProfile: (profile: Profile) => void; onExpired: () => void;
}) {
  const [modal, setModal] = useState<'avatar' | 'password' | null>(null);
  return <><PageHeading eyebrow="YOUR IDENTITY" title="你的账户">名字留在剧院，身份留在每一场演出里。</PageHeading>
    <section className="panel account-profile"><Avatar url={profile.avatarUrl} name={profile.username} size="large"/><div><h2>{profile.username}</h2><p className="muted">账号即公开显示名，创建后不可修改。</p>{bootstrap.features.avatars && <button className="button" onClick={() => setModal('avatar')}>更换头像</button>}</div></section>
    <section className="panel"><h2>账户安全</h2><div className="setting-row"><div><strong>登录密码</strong><p className="muted">修改后所有设备需重新登录。</p></div><button className="button" onClick={() => setModal('password')}>修改密码</button></div></section>
    <DisplaySettings/>
    {modal === 'avatar' && <AvatarEditor limits={bootstrap.avatar} userId={profile.userId} onSave={onProfile} onClose={() => setModal(null)} onExpired={onExpired}/>}
    {modal === 'password' && <PasswordEditor limits={bootstrap.auth.password} onClose={() => setModal(null)} onExpired={onExpired}/>}
  </>;
}

function PasswordEditor({ limits, onClose, onExpired }: { limits: BootstrapDTO['auth']['password']; onClose: () => void; onExpired: () => void }) {
  const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setError('');
    if (password !== confirmation) { setError('两次输入的新密码不一致。'); return; }
    setBusy(true);
    try {
      await post('/auth/change-password', { currentPassword: current, password });
      if (live.current) { setCurrent(''); setPassword(''); setConfirmation(''); setDone(true); }
    } catch (failure) {
      if (!live.current) return;
      if (failure instanceof ApiFailure && failure.code === 'unauthorized') { onExpired(); return; }
      if (failure instanceof UnknownResult) {
        try { await get('/auth/me'); }
        catch (refreshError) { if (live.current && refreshError instanceof ApiFailure && refreshError.code === 'unauthorized') { onExpired(); return; } }
      }
      if (live.current) setError(failure instanceof ApiFailure && failure.code === 'invalid_credentials' ? '当前密码不正确，请重试。' : errorMessage(failure));
    } finally { if (live.current) setBusy(false); }
  };
  return <Modal title="修改密码" onClose={done ? onExpired : onClose} dismissible={!busy}>
    {done ? <><Notice>密码已更新，所有旧会话已撤销。请使用新密码重新登录。</Notice><button className="button button--primary" onClick={onExpired}>返回登录</button></> : <form onSubmit={event => void submit(event)}><fieldset disabled={busy}>
      <Field label="当前密码" type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required maxLength={limits.maxLength}/>
      <Field label="新密码" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={limits.minLength} maxLength={limits.maxLength} hint={`长度为 ${limits.minLength}–${limits.maxLength} 个字符。`}/>
      <Field label="确认新密码" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required maxLength={limits.maxLength}/>
      {error && <Notice error>{error}</Notice>}<p className="muted">修改成功后将撤销所有设备的登录状态。</p><button className="button button--primary button--wide" type="submit">{busy ? '正在保存…' : '保存新密码'}</button>
    </fieldset></form>}
  </Modal>;
}
