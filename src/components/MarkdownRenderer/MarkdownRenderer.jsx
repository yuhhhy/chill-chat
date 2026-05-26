import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import 'highlight.js/styles/github-dark.css';

function linkCitations(content, citationOrders = []) {
  const available = new Set(citationOrders.map(Number));
  if (!available.size) return content;

  const lines = String(content || '').split('\n');
  let inFence = false;

  return lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    let inInlineCode = false;
    let result = '';

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '`') {
        inInlineCode = !inInlineCode;
        result += char;
        continue;
      }

      const match = !inInlineCode ? line.slice(i).match(/^\[(\d+)\]/) : null;
      if (match && available.has(Number(match[1])) && line[i + match[0].length] !== '(') {
        result += `[[${match[1]}]](#rag-source-${match[1]})`;
        i += match[0].length - 1;
      } else {
        result += char;
      }
    }

    return result;
  }).join('\n');
}

const MarkdownRenderer = React.memo(({ content, citationOrders = [], onCitationClick }) => {
  const renderedContent = useMemo(
    () => linkCitations(content, citationOrders),
    [content, citationOrders]
  );

  const components = useMemo(() => ({
    a({ href, children, ...props }) {
      const citation = typeof href === 'string' ? href.match(/^#rag-source-(\d+)$/) : null;
      if (citation) {
        return (
          <a
            href={href}
            className="citation-link"
            onClick={(event) => {
              event.preventDefault();
              onCitationClick?.(Number(citation[1]));
            }}
            {...props}
          >
            {children}
          </a>
        );
      }

      return <a href={href} {...props}>{children}</a>;
    },
    code({ className, children, ...props }) {
      const isBlockCode = Boolean(className) || String(children).includes('\n');

      if (!isBlockCode) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre({ children, ...props }) {
      return (
        <div className="code-block">
          <pre {...props}>{children}</pre>
        </div>
      );
    }
  }), [onCitationClick]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={components}
    >
      {renderedContent}
    </ReactMarkdown>
  );
});

export default MarkdownRenderer;
