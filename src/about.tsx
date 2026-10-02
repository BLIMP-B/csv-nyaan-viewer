import React from 'react';
import { ExternalLink } from 'lucide-react';
import appInfo from '../electron/app-info.json';
import { version } from '../package.json';

export function About({ icon, onError }: { icon: string | null; onError: (message: string) => void }) {
  return <div className="about-content">
    <div className="about-identity">{icon && <img src={icon} alt=""/>}<div><strong>CSV nyaan Viewer</strong><span>バージョン {version}</span></div></div>
    <p>CSV・Excel・Markdown・テキストを直接開く、読み取り専用のビューワーです。</p>
    <dl><dt>オブザーバー</dt><dd>{appInfo.observer}</dd></dl>
    <div className="about-links">{appInfo.links.map(link => <a key={link.url} href={link.url} onClick={e => { e.preventDefault(); window.csv.openExternal(link.url).catch(error => onError(String(error))); }}><ExternalLink size={14}/><span>{link.label}<small>{link.url}</small></span></a>)}</div>
  </div>;
}
