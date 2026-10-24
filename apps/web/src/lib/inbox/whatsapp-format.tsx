import * as React from 'react';

/**
 * Renders WhatsApp text formatting as React nodes (no HTML injection):
 * *bold*, _italic_, ~strike~, `code`, ```monospace``` and links.
 */
const INLINE =
  /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])|(?<![\w~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\w~])|`([^`\n]+)`|(https?:\/\/[^\s<]+[^\s<.,:;"')\]]|www\.[^\s<]+[^\s<.,:;"')\]])/g;

function renderInline(text: string, keyPrefix: string, depth = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const key = `${keyPrefix}-${i++}`;
    const [, bold, italic, strike, code, url] = match;
    const inner = (value: string) => (depth < 3 ? renderInline(value, key, depth + 1) : value);
    if (bold !== undefined) nodes.push(<strong key={key}>{inner(bold)}</strong>);
    else if (italic !== undefined) nodes.push(<em key={key}>{inner(italic)}</em>);
    else if (strike !== undefined) nodes.push(<s key={key}>{inner(strike)}</s>);
    else if (code !== undefined)
      nodes.push(
        <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.85em] dark:bg-white/10">
          {code}
        </code>,
      );
    else if (url !== undefined) {
      const href = url.startsWith('http') ? url : `https://${url}`;
      nodes.push(
        <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">
          {url}
        </a>,
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function WhatsAppText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split('```');
  return (
    <span className={className}>
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <code key={i} className="my-1 block whitespace-pre-wrap rounded-lg bg-black/10 p-2 font-mono text-[0.85em] dark:bg-white/10">
            {block}
          </code>
        ) : (
          <React.Fragment key={i}>{renderInline(block, String(i))}</React.Fragment>
        ),
      )}
    </span>
  );
}
