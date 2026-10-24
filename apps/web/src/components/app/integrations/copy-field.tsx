'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Input } from '@talkzi/ui/input';
import { toast } from '@talkzi/ui/sonner';

/** Read-only value with a copy button (secrets shown once, URLs). */
export function CopyField({ value, label, secret }: { value: string; label: string; secret?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed — select the text and copy it manually.');
    }
  };
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} className={secret ? 'font-mono text-xs' : 'text-xs'} onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" variant="outline" size="icon" onClick={() => void copy()} aria-label={`Copy ${label}`}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
