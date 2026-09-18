import { useEffect, useRef, useState } from 'react';
import type { CatalogDTO } from '../../../../contracts/catalog.ts';
import type { EventDTO, RoomSnapshot } from '../../../../contracts/v2.ts';
import { describeEvent } from '../../presentation/events.ts';
import { authorizedPrivate } from './identity.tsx';

export function EventList({ events, view, catalog, onDetail }: { events: EventDTO[]; view: RoomSnapshot; catalog: CatalogDTO; onDetail: (event: EventDTO) => void }) {
  return <div className="event-list">{events.length ? events.map(event => {
    const content = describeEvent(event, view, catalog);
    return <button className="event-row" key={event.cursor} onClick={() => onDetail(event)}><small>第 {event.dayNumber} 轮 · 阶段 {event.stage}</small><strong>{content.title}</strong><span>{content.details.slice(0, 2).join(' · ')}</span></button>;
  }) : <p className="muted">暂时没有可查看的记录。</p>}</div>;
}

export function GameSidebar({ view, catalog, onIdentity, onRules, onEvent }: { view: RoomSnapshot; catalog: CatalogDTO; onIdentity: () => void; onRules: () => void; onEvent: (event: EventDTO) => void }) {
  const [tab, setTab] = useState<'public' | 'intel' | 'records' | 'rules'>('public');
  const [seen, setSeen] = useState(() => ({ public: view.chat.public.length, intel: view.private?.events.length ?? 0, records: view.public?.events.length ?? 0 }));
  const privateView = authorizedPrivate(view);
  const counts = { public: view.chat.public.length, intel: privateView?.events.length ?? 0, records: view.public?.events.length ?? 0 };
  const current = useRef({ tab, counts }); current.current = { tab, counts };
  useEffect(() => { if (tab !== 'rules') setSeen(old => ({ ...old, [tab]: current.current.counts[tab] })); }, [tab, counts.public, counts.intel, counts.records]);
  return <aside className="game-sidebar" aria-label="信息侧栏"><div className="info-tabs" role="tablist" aria-label="对局信息">{([['public', '公屏'], ['intel', '情报'], ['records', '记录'], ['rules', '规则']] as const).map(([key, label]) => <button role="tab" type="button" key={key} aria-selected={tab === key} aria-controls={`panel-${key}`} id={`tab-${key}`} onClick={() => setTab(key)}>{label}{key !== 'rules' && counts[key] > seen[key] && <span className="unread-dot" aria-label="有新内容"/>}</button>)}</div>
    <div className="info-panel" id="panel-public" role="tabpanel" aria-labelledby="tab-public" hidden={tab !== 'public'}><h2>公屏记录</h2>{view.chat.public.length ? view.chat.public.map(message => <div className="chat-message" key={message.messageId}><strong>{view.public?.seats.find(seat => seat.playerId === message.senderId)?.username ?? '玩家'}</strong><p>{message.text}</p></div>) : <p className="muted">暂时没有公共消息。</p>}</div>
    <div className="info-panel" id="panel-intel" role="tabpanel" aria-labelledby="tab-intel" hidden={tab !== 'intel'}><h2>当前视角情报</h2>{privateView ? <><button className="button button--wide" onClick={onIdentity}>{view.viewer.readOnly ? '查看观察身份' : '查看我的身份'}</button>
      <EventList events={privateView.events} view={view} catalog={catalog} onDetail={onEvent}/>
      {privateView.factionRoom && <section><h3>阵营交流记录{privateView.factionRoom.readOnly ? ' · 只读' : ''}</h3>{view.chat.faction.map(message => <div className="chat-message" key={message.messageId}><strong>{view.public?.seats.find(seat => seat.playerId === message.senderId)?.username ?? '成员'}</strong><p>{message.text}</p></div>)}</section>}
    </> : <p className="muted">公开观众没有私人情报或个人角色。</p>}</div>
    <div className="info-panel" id="panel-records" role="tabpanel" aria-labelledby="tab-records" hidden={tab !== 'records'}><h2>公共事件</h2><EventList events={view.public?.events ?? []} view={view} catalog={catalog} onDetail={onEvent}/></div>
    <div className="info-panel" id="panel-rules" role="tabpanel" aria-labelledby="tab-rules" hidden={tab !== 'rules'}><h2>规则 {catalog.rulesVersion}</h2><p className="muted">本局 {view.room.requiredPlayers} 人，{view.room.config.mode === 'formal' ? '正式模式' : '实验模式'}。以冻结配置与服务端任务为准。</p><button className="button button--wide" onClick={onRules}>打开完整规则</button>{privateView && <p>{catalog.roles.find(role => role.roleId === privateView.self.roleId)?.description}</p>}</div>
  </aside>;
}
