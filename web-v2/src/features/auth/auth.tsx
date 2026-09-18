import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuthMe } from '../../../../contracts/v2.ts';
import type { BootstrapDTO } from '../../../../contracts/catalog.ts';
import { Emblem, Field, Notice } from '../../components/ui.tsx';
import { ApiFailure, UnknownResult, errorMessage, post } from '../../transport/http.ts';

export function AuthPage({ bootstrap, onLogin }: { bootstrap: BootstrapDTO; onLogin: (profile: AuthMe) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [invitation, setInvitation] = useState('');
  const [verified, setVerified] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const changeMode = (next: typeof mode) => {
    setMode(next); setError(''); setNotice(''); setPassword(''); setConfirmation(''); setShow(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setError(''); setNotice('');
    if ((mode === 'reset' || mode === 'register' && verified) && password !== confirmation) { setError('两次输入的密码不一致。'); return; }
    setBusy(true);
    try {
      if (mode === 'register' && !verified) {
        await post('/auth/invitations/check', { invitation: invitation.trim() });
        if (active.current) setVerified(true);
      } else if (mode === 'reset') {
        await post('/auth/reset-password', { token: invitation.trim(), password });
        if (active.current) { changeMode('login'); setInvitation(''); setVerified(false); setNotice('密码已重置，请使用新密码登录。'); }
      } else {
        const profile = await post<AuthMe>(`/auth/${mode}`, mode === 'login' ? { username, password } : { username, password, invitation: invitation.trim() });
        if (active.current) { setPassword(''); setConfirmation(''); setInvitation(''); onLogin(profile); }
      }
    } catch (failure) {
      if (!active.current) return;
      if (mode === 'register' && verified && failure instanceof UnknownResult) {
        changeMode('login'); setNotice('尚未确认注册结果。请用刚才的账号和密码登录，确认账号是否已创建。');
      } else if (failure instanceof ApiFailure && failure.code === 'invalid_reset_token') setError('重置码无效、已使用或已过期，请联系维护者。');
      else setError(errorMessage(failure));
    } finally { if (active.current) setBusy(false); }
  };
  const credentials = mode === 'login' || mode === 'reset' || mode === 'register' && verified;
  return <main className="auth-layout">
    <section className="auth-world" aria-label="剧院死神">
      <div className="auth-world__image"/>
      <div className="auth-world__content"><span className="eyebrow">THEATER DEATH · 序幕</span><Emblem/><h1>剧院死神</h1><p className="auth-world__subtitle">一场关于谎言与灵魂的演出</p><div className="fine-rule"/><p className="auth-world__quote">灯光熄灭之后，<br/>每个人都有自己的秘密。</p></div>
      <span className="auth-world__foot">九种身份 · 两重幕间 · 一场未知的结局</span>
    </section>
    <section className="auth-panel">
      <div className="auth-panel__brand"><Emblem/><span>THEATER DEATH</span></div>
      <div className="auth-card"><span className="eyebrow">{mode === 'login' ? 'WELCOME TO THE THEATER' : mode === 'register' ? 'YOUR INVITATION' : 'ACCOUNT RECOVERY'}</span>
        <h2>{mode === 'login' ? '欢迎入席' : mode === 'register' ? verified ? '留下你的名字' : '凭邀请入场' : '重置密码'}</h2>
        <p className="muted">{mode === 'login' ? '登录你的账号，回到这场演出。' : mode === 'register' ? verified ? '邀请码已验证。设置账号与密码，即可加入剧院。' : '输入维护者提供的注册邀请码。' : '请输入维护者单独签发的密码重置码。'}</p>
        <form onSubmit={event => void submit(event)}>
          <fieldset disabled={busy}>
            {mode !== 'login' && (!verified || mode === 'reset') && <Field label={mode === 'reset' ? '密码重置码' : '注册邀请码'} value={invitation} onChange={event => { setInvitation(event.target.value); setVerified(false); }} required maxLength={128} autoComplete="off" spellCheck={false} hint={mode === 'reset' ? '重置码与注册邀请码、房间码不同。' : '邀请码用于注册，不是房间码。'}/>}
            {credentials && mode !== 'reset' && <Field label="账号" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required minLength={bootstrap.auth.username.minLength} maxLength={bootstrap.auth.username.maxLength} pattern={bootstrap.auth.username.pattern} spellCheck={false} autoCapitalize="none" hint={mode === 'register' ? '使用英文字母、数字或下划线；账号将作为公开显示名。' : undefined}/>}
            {credentials && <><div className="password-label"><span>密码</span><button type="button" className="text-button" onClick={() => setShow(!show)} aria-pressed={show}>{show ? '隐藏密码' : '显示密码'}</button></div>
              <Field label={mode === 'login' ? '登录密码' : '设置新密码'} className="password-input" type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={mode === 'login' ? 1 : bootstrap.auth.password.minLength} maxLength={bootstrap.auth.password.maxLength} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} hint={mode !== 'login' ? `长度为 ${bootstrap.auth.password.minLength}–${bootstrap.auth.password.maxLength} 个字符。` : undefined}/>
              {mode !== 'login' && <Field label="确认密码" type={show ? 'text' : 'password'} value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="new-password" maxLength={bootstrap.auth.password.maxLength}/>}</>}
            {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
            <button className="button button--primary button--wide" type="submit">{busy ? '正在确认…' : mode === 'login' ? '进入剧院' : mode === 'reset' ? '保存新密码' : verified ? '创建账号并入席' : '验证邀请码'}<span aria-hidden="true">→</span></button>
          </fieldset>
        </form>
        <div className="auth-switch">{mode === 'login' ? <><span>还没有账号？</span><button disabled={busy} className="text-button" onClick={() => { setVerified(false); changeMode('register'); }}>使用邀请码注册</button></> : <button disabled={busy} className="text-button" onClick={() => changeMode('login')}>← 返回登录</button>}</div>
        {mode === 'register' && verified && <button disabled={busy} className="text-button" onClick={() => { setVerified(false); setPassword(''); setConfirmation(''); }}>更换邀请码</button>}
        {mode === 'login' && <button disabled={busy} className="text-button subtle" onClick={() => { setInvitation(''); changeMode('reset'); }}>已有密码重置码</button>}
      </div>
      <footer className="auth-foot">请妥善保管账号。你的身份，只属于你的视角。</footer>
    </section>
  </main>;
}
