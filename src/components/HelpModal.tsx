import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronDown } from 'lucide-react';
import readmeRaw from '../../README.md?raw';

interface HelpModalProps {
  onClose: () => void;
}

interface Section {
  title: string;
  content: string;
}

function parseReadme(raw: string): Section[] {
  const sections: Section[] = [];
  const lines = raw.split('\n');
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
      }
      currentTitle = line.replace('## ', '');
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
  }
  return sections;
}

function renderContent(content: string) {
  const blocks: React.ReactNode[] = [];
  const lines = content.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '' || line.trim() === '---') {
      i++;
      continue;
    }

    // Sub-heading (###)
    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={key++} className="text-sm font-semibold text-green-100 mt-4 mb-2">
          {line.replace('### ', '')}
        </h4>
      );
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && lines[i + 1]?.includes('---')) {
      const headers = line.split('|').filter(c => c.trim()).map(c => c.trim());
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').filter(c => c.trim()).map(c => c.trim()));
        i++;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} className="text-left py-1.5 px-2 text-green-200 font-semibold border-b border-green-600">
                    {formatInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="py-1.5 px-2 text-green-300 border-b border-green-700/50">
                      {formatInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <pre key={key++} className="bg-green-950 rounded-lg p-3 my-2 text-xs text-green-300 overflow-x-auto">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <div key={key++} className="border-l-2 border-green-500 pl-3 my-2 text-xs text-green-300 italic">
          {quoteLines.map((ql, qi) => <p key={qi}>{formatInline(ql)}</p>)}
        </div>
      );
      continue;
    }

    // List items
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].match(/^[-*]\s/) || lines[i].match(/^\d+\.\s/))) {
        listItems.push(lines[i].replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-2 space-y-1">
          {listItems.map((item, li) => (
            <li key={li} className="text-xs text-green-300 flex gap-2">
              <span className="text-green-500 mt-0.5 shrink-0">&bull;</span>
              <span>{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={key++} className="text-xs text-green-300 my-1.5">
        {formatInline(line)}
      </p>
    );
    i++;
  }

  return blocks;
}

function formatInline(text: string): React.ReactNode {
  // Split on bold (**text**) and inline code (`text`)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let partKey = 0;

  while (remaining.length > 0) {
    // Check for bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Check for inline code
    const codeMatch = remaining.match(/`(.+?)`/);

    // Find which comes first
    const boldIdx = boldMatch?.index ?? Infinity;
    const codeIdx = codeMatch?.index ?? Infinity;

    if (boldIdx === Infinity && codeIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (boldIdx <= codeIdx && boldMatch) {
      parts.push(remaining.slice(0, boldIdx));
      parts.push(
        <span key={partKey++} className="font-semibold text-green-100">
          {boldMatch[1]}
        </span>
      );
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (codeMatch) {
      parts.push(remaining.slice(0, codeIdx));
      parts.push(
        <code key={partKey++} className="bg-green-950 px-1 py-0.5 rounded text-green-200 text-[11px]">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    }
  }

  return <>{parts}</>;
}

export function HelpModal({ onClose }: HelpModalProps) {
  const [sections] = useState<Section[]>(() => parseReadme(readmeRaw));
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const toggle = (idx: number) => {
    setExpandedIdx(expandedIdx === idx ? null : idx);
  };

  // Filter out developer-focused sections for end users
  const userSections = sections.filter(
    s => !['Tech Stack', 'Developer Setup', 'License', 'Table of Contents'].includes(s.title)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] bg-green-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-green-700">
          <h2 className="text-lg font-bold text-white">Help & User Guide</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-green-700 rounded-lg transition-colors"
            aria-label="Close help"
          >
            <X className="w-5 h-5 text-green-300" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {userSections.map((section, idx) => (
            <div key={idx} className="border border-green-700/50 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(idx)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-green-700/40 transition-colors"
              >
                <span className="text-sm font-medium text-green-100">{section.title}</span>
                {expandedIdx === idx ? (
                  <ChevronDown className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-green-400 shrink-0" />
                )}
              </button>
              {expandedIdx === idx && (
                <div className="px-4 pb-4 border-t border-green-700/50">
                  {renderContent(section.content)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-green-700 text-center">
          <p className="text-xs text-green-400">
            Press <kbd className="bg-green-950 px-1.5 py-0.5 rounded text-green-300">Esc</kbd> or click outside to close
          </p>
        </div>
      </div>
    </div>
  );
}
