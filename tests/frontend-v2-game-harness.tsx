import { useEffect, useRef, useState } from 'react';
import type { CatalogDTO } from '../contracts/catalog.ts';
import type { RoomSnapshot } from '../contracts/v2.ts';
import { GameScene } from '../web-v2/src/features/game/scene.tsx';
import '../web-v2/src/styles/main.css';

export interface GameHarnessFixture { view: RoomSnapshot; catalog: CatalogDTO; online: boolean }
const updateEvent = 'v2-game-fixture-update';

function sceneKey(view: RoomSnapshot): string {
  return [view.viewer.userId, view.roomId, view.gameId, view.viewer.memberId, view.viewer.kind, view.viewer.subjectPlayerId].join('/');
}

export function GameHarness() {
  const [fixture, setFixture] = useState<GameHarnessFixture | null>(null);
  const [terminal, setTerminal] = useState('');
  const sample = useRef<{ server: number; local: number } | null>(null);
  useEffect(() => {
    let active = true;
    const apply = (next: GameHarnessFixture) => {
      if (!active) return;
      setFixture(next);
      const now = performance.now();
      if (!sample.current || next.view.serverTime > sample.current.server) sample.current = { server: next.view.serverTime, local: now };
    };
    void fetch('/__game-fixture').then(response => response.json() as Promise<GameHarnessFixture>).then(apply);
    const onUpdate = (event: Event) => apply((event as CustomEvent<GameHarnessFixture>).detail);
    window.addEventListener(updateEvent, onUpdate);
    return () => { active = false; window.removeEventListener(updateEvent, onUpdate); };
  }, []);
  if (terminal) return <main className="splash"><p role="status">测试终态：{terminal}</p></main>;
  if (!fixture) return <main className="splash"><p role="status">正在加载隔离对局夹具…</p></main>;
  const { view, catalog, online } = fixture;
  const remaining = (deadline: number) => {
    if (!sample.current) return null;
    const estimated = sample.current.server + Math.max(0, performance.now() - sample.current.local);
    return Math.max(0, deadline - estimated);
  };
  return <main className="home-layout home-layout--playing"><section className="home-main"><GameScene key={sceneKey(view)} view={view} catalog={catalog} online={online} remaining={remaining} refresh={async () => {
    const response = await fetch('/__game-fixture');
    applyFixture(await response.json() as GameHarnessFixture);
  }} onExit={message => { setFixture(null); setTerminal(message); }} onExpired={() => { setFixture(null); setTerminal('登录已失效'); }}/></section></main>;
}

function applyFixture(next: GameHarnessFixture): void {
  window.dispatchEvent(new CustomEvent(updateEvent, { detail: next }));
}

export function mountGameHarness(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('game harness root missing');
  import('react-dom/client').then(({ createRoot }) => { createRoot(root).render(<GameHarness/>); });
}

if (import.meta.env.DEV) mountGameHarness();
