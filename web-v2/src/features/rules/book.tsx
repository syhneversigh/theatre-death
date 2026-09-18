import { useState } from 'react';
import type { ReactNode } from 'react';
import type { CatalogDTO } from '../../../../contracts/catalog.ts';
import { Modal } from '../../components/ui.tsx';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

/** Render the rulebook's small Markdown vocabulary; raw HTML is always plain text. */
export function RuleMarkdown({ markdown }: { markdown: string }) {
  return <div className="rule-markdown">{markdown.trim().split(/\r?\n\s*\r?\n/).map((block, index) => {
    const lines = block.split(/\r?\n/);
    const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
    if (lines.length > 1 && lines[0]!.trim().startsWith('|') && /^\s*\|?[\s:|\-]+\|?\s*$/.test(lines[1]!)) {
      return <div className="table-scroll" key={index}><table><thead><tr>{cells(lines[0]!).map((cell, i) => <th key={i}>{inline(cell)}</th>)}</tr></thead><tbody>{lines.slice(2).map((line, row) => <tr key={row}>{cells(line).map((cell, i) => <td key={i}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
    }
    if (lines.every(line => /^\s*[-*] /.test(line))) return <ul key={index}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-*] /, ''))}</li>)}</ul>;
    if (lines.every(line => /^\s*\d+[.)] /.test(line))) return <ol key={index}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*\d+[.)] /, ''))}</li>)}</ol>;
    if (lines.length === 1 && /^#{1,6} /.test(block)) return <h3 key={index}>{inline(block.replace(/^#{1,6} /, ''))}</h3>;
    return <p key={index}>{inline(block)}</p>;
  })}</div>;
}

export function RulesBook({ catalog, onClose, context }: { catalog: CatalogDTO; onClose: () => void; context?: ReactNode }) {
  const [chapterId, setChapterId] = useState(catalog.rulebook.chapters[0]?.id ?? '');
  const chapter = catalog.rulebook.chapters.find(item => item.id === chapterId);
  return <Modal title={`完整规则 · ${catalog.rulebook.version}`} onClose={onClose} context={context}><label className="select-field">章节<select aria-label="规则章节" value={chapterId} onChange={event => setChapterId(event.target.value)}>{catalog.rulebook.chapters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <p className="muted">正式版型的通用规则。实验房间的人数与角色组成以本房间冻结配置为准。</p>
    {chapter ? <article aria-label={chapter.title}><h2>{chapter.title}</h2><RuleMarkdown markdown={chapter.markdown}/></article> : <p>暂未找到该规则章节。</p>}
  </Modal>;
}
