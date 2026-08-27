'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children }) {
  return (
    <div className="text-sm leading-relaxed space-y-2 break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h2]:mt-3 [&_h3]:font-semibold [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ''}</ReactMarkdown>
    </div>
  );
}
