import { useEffect, useState } from 'react';
import type { AuthMe, Profile } from '../../../contracts/v2.ts';
import type { BootstrapDTO, CatalogDTO } from '../../../contracts/catalog.ts';
import { Avatar, Emblem, Notice, PageHeading } from '../components/ui.tsx';
import { AuthPage } from '../features/auth/auth.tsx';
import { AccountPage } from '../features/account/account.tsx';
import { acceptProfile } from '../state/snapshot.ts';
import { navigate, useRoute } from './navigation.ts';
import { ApiFailure, errorMessage, get, post } from '../transport/http.ts';
import type { MyRooms } from '../transport/types.ts';
import '../styles/main.css';

type Boot = { bootstrap: BootstrapDTO; catalog: CatalogDTO; profile: AuthMe | null };
export function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [failure, setFailure] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setFailure('');
    void Promise.all([
      get<BootstrapDTO>('/bootstrap', abort.signal), get<CatalogDTO>('/catalog', abort.signal),
      get<AuthMe>('/auth/me', abort.signal).catch(error => { if (error instanceof ApiFailure && error.code === 'unauthorized') return null; throw error; }),
    ]).then(([bootstrap, catalog, profile]) => {
      if (abort.signal.aborted) return;
      if (bootstrap.contractVersion !== '2.1' || bootstrap.rulesVersion !== '2.0' || catalog.rulesVersion !== '2.0') { setFailure('当前服务版本与页面不匹配，请使用配套入口。'); return; }
      setBoot({ bootstrap, catalog, profile });
    }).catch(error => { if (!abort.signal.aborted) setFailure(errorMessage(error)); });
    return () => abort.abort();
  }, [attempt]);
  if (!boot) return <main className="splash"><Emblem/><h1>剧院死神</h1>{failure ? <><Notice error>{failure}</Notice><button className="button" onClick={() => setAttempt(attempt + 1)}>重新连接</button></> : <p role="status">正在点亮剧院…</p>}</main>;
  if (!boot.profile) return <AuthPage bootstrap={boot.bootstrap} onLogin={profile => { navigate('/'); setBoot({ ...boot, profile }); }}/>;
  const replaceProfile = (incoming: Profile) => setBoot(current => {
    if (!current?.profile) return current;
    const profile = acceptProfile(current.profile, incoming, current.profile.userId);
    return profile ? { ...current, profile: { ...profile, expiresAt: current.profile.expiresAt } } : current;
  });
  return <Home key={boot.profile.userId} profile={boot.profile} bootstrap={boot.bootstrap} onProfile={replaceProfile} onLogout={() => setBoot(current => current ? { ...current, profile: null } : null)}/>;
}

function Home({ profile, bootstrap, onProfile, onLogout }: { profile: AuthMe; bootstrap: BootstrapDTO; onProfile: (profile: Profile) => void; onLogout: () => void }) {
  const [rooms, setRooms] = useState<MyRooms | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const route = useRoute();
  const page = route === '/account' ? 'account' : 'home';
  const setPage = (next: 'home' | 'account') => navigate(next === 'home' ? '/' : '/account');
  useEffect(() => {
    const abort = new AbortController();
    void get<MyRooms>('/me/rooms', abort.signal).then(result => { if (!abort.signal.aborted) setRooms(result); }).catch(error => {
      if (abort.signal.aborted) return;
      if (error instanceof ApiFailure && error.code === 'unauthorized') onLogout(); else setFailure(errorMessage(error));
    });
    return () => abort.abort();
  }, [profile.userId]);
  const logout = async () => {
    if (busy) return; setBusy(true); setFailure('');
    try { await post('/auth/logout', {}); navigate('/'); onLogout(); }
    catch (error) { if (error instanceof ApiFailure && error.code === 'unauthorized') onLogout(); else setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <main className="home-layout"><aside className="navigation"><div className="brand"><Emblem/><span>剧院死神<small>THEATER DEATH</small></span></div><nav aria-label="主导航"><button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>剧院首页</button><button className={`nav-item ${page === 'account' ? 'active' : ''}`} onClick={() => setPage('account')}>我的账户</button></nav><div className="nav-profile"><Avatar url={profile.avatarUrl} name={profile.username}/><span>{profile.username}</span><button className="text-button" disabled={busy} onClick={() => void logout()}>退出登录</button></div></aside>
    <section className="home-main">{page === 'account' ? <AccountPage profile={profile} bootstrap={bootstrap} onProfile={onProfile} onExpired={onLogout}/> : <><PageHeading eyebrow="THE FOYER" title="下一场，等你入席。">每一张面孔，都有尚未揭晓的故事。</PageHeading><div className="home-hero"><span className="eyebrow">THEATER DEATH</span><h2>幕布之后，<br/>真相尚未落定。</h2><p>与同伴一起，开启一场新的演出。</p></div>
      {failure && <Notice error>{failure}</Notice>}
      <section className="panel"><h2>你的房间</h2>{rooms === null ? <p role="status">正在读取房间…</p> : rooms.rooms.length ? rooms.rooms.map(room => <p key={room.roomId}>房间 {room.roomCode} · {room.phase === 'lobby' ? '等待开场' : room.phase === 'playing' ? '演出进行中' : '终场复盘'}</p>) : <p className="muted">目前没有进行中的房间。</p>}</section></>}
    </section></main>;
}
