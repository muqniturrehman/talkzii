'use client';

import * as React from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Bot, FileText, Flag, GitBranch, Globe, HelpCircle, MessageSquare, MousePointerClick, Play, Sparkles, Tag, UserRound, Variable } from 'lucide-react';
import type { ChatbotNodeType } from '@talkzi/shared';
import { cn } from '@talkzi/ui/lib/utils';

export type FlowNodeData = Record<string, unknown>;
export type BuilderNode = Node<FlowNodeData, ChatbotNodeType>;

export const NODE_META: Record<ChatbotNodeType, { label: string; description: string; icon: React.ComponentType<{ className?: string }>; accent: string }> = {
  start: { label: 'Start', description: 'Where the flow begins', icon: Play, accent: 'text-success' },
  message: { label: 'Send message', description: 'Send a text reply', icon: MessageSquare, accent: 'text-primary' },
  ask: { label: 'Ask a question', description: 'Wait for an answer and save it', icon: HelpCircle, accent: 'text-info' },
  buttons: { label: 'Buttons', description: 'Up to 3 reply buttons, one path each', icon: MousePointerClick, accent: 'text-info' },
  condition: { label: 'Condition', description: 'Branch on a variable', icon: GitBranch, accent: 'text-warning' },
  set_variable: { label: 'Set variable', description: 'Store a value for later', icon: Variable, accent: 'text-muted-foreground' },
  label: { label: 'Add label', description: 'Tag the contact', icon: Tag, accent: 'text-muted-foreground' },
  assign: { label: 'Hand off to team', description: 'Assign and pause the bot', icon: UserRound, accent: 'text-danger' },
  ai_reply: { label: 'AI answer', description: 'Answer from your knowledge base', icon: Sparkles, accent: 'text-primary' },
  http_request: { label: 'HTTP request', description: 'Call your API and save the response', icon: Globe, accent: 'text-info' },
  send_template: { label: 'Send template', description: 'Send an approved template (works after 24h)', icon: FileText, accent: 'text-primary' },
  end: { label: 'End', description: 'Finish the conversation', icon: Flag, accent: 'text-muted-foreground' },
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function summary(type: ChatbotNodeType, data: FlowNodeData): string {
  switch (type) {
    case 'message':
      return str(data.text);
    case 'ask':
      return `${str(data.question)}${data.variable ? ` → {{vars.${str(data.variable)}}}` : ''}`;
    case 'buttons':
      return str(data.text);
    case 'condition':
      return `${str(data.variable)} ${str(data.operator).replace('_', ' ')} ${str(data.value)}`.trim();
    case 'set_variable':
      return `${str(data.variable)} = ${str(data.value)}`;
    case 'assign':
      return str(data.note) || 'Pause the bot and notify the team';
    case 'ai_reply':
      return 'Grounded answer, or the fallback';
    case 'end':
      return str(data.text) || 'Conversation complete';
    case 'label':
      return data.labelId ? 'Adds a label' : 'Choose a label';
    case 'http_request':
      return `${str(data.method) || 'POST'} ${str(data.url)}${data.saveAs ? ` → {{vars.${str(data.saveAs)}}}` : ''}`;
    case 'send_template':
      return str(data.templateName) || 'Choose an approved template';
    default:
      return 'Triggered by your keywords';
  }
}

const handleClass = '!size-3 !border-2 !border-background !bg-primary';

export function FlowNodeCard({ data, type, selected }: NodeProps<BuilderNode>) {
  const nodeType = (type ?? 'message') as ChatbotNodeType;
  const meta = NODE_META[nodeType];
  const Icon = meta.icon;
  const buttons = nodeType === 'buttons' && Array.isArray(data.buttons) ? (data.buttons as { id: string; title: string }[]) : [];

  return (
    <div
      className={cn(
        'w-60 rounded-2xl border bg-card text-card-foreground shadow-sm transition',
        selected ? 'border-primary shadow-glow' : 'border-border',
      )}
    >
      {nodeType !== 'start' ? <Handle type="target" position={Position.Top} className={handleClass} /> : null}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className={cn('size-4', meta.accent)} />
        <span className="text-xs font-semibold">{meta.label}</span>
      </div>
      <p className="line-clamp-3 px-3 py-2 text-xs text-muted-foreground">{summary(nodeType, data) || 'Click to configure'}</p>

      {nodeType === 'buttons' ? (
        <div className="space-y-1 px-3 pb-3">
          {buttons.map((b) => (
            <div key={b.id} className="relative rounded-lg border border-primary/30 px-2 py-1 text-center text-[11px] font-medium text-primary dark:text-accent">
              {b.title || 'Button'}
              <Handle id={b.id} type="source" position={Position.Right} className={handleClass} />
            </div>
          ))}
        </div>
      ) : null}

      {nodeType === 'condition' ? (
        <div className="flex justify-between px-3 pb-2 text-[10px] font-medium">
          <span className="text-success">Yes</span>
          <span className="text-danger">No</span>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: '25%' }} className="!size-3 !border-2 !border-background !bg-success" />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: '75%' }} className="!size-3 !border-2 !border-background !bg-danger" />
        </div>
      ) : null}

      {nodeType === 'http_request' ? (
        <div className="flex justify-between px-3 pb-2 text-[10px] font-medium">
          <span className="text-success">Success</span>
          <span className="text-danger">Error</span>
          <Handle id="success" type="source" position={Position.Bottom} style={{ left: '25%' }} className="!size-3 !border-2 !border-background !bg-success" />
          <Handle id="error" type="source" position={Position.Bottom} style={{ left: '75%' }} className="!size-3 !border-2 !border-background !bg-danger" />
        </div>
      ) : null}

      {!['buttons', 'condition', 'http_request', 'assign', 'end'].includes(nodeType) ? <Handle type="source" position={Position.Bottom} className={handleClass} /> : null}
      {nodeType === 'assign' ? (
        <p className="flex items-center gap-1 px-3 pb-2 text-[10px] text-muted-foreground">
          <Bot className="size-3" /> Bot pauses here
        </p>
      ) : null}
    </div>
  );
}

export const nodeTypes = Object.fromEntries(Object.keys(NODE_META).map((type) => [type, FlowNodeCard])) as Record<ChatbotNodeType, typeof FlowNodeCard>;

/** Default data for a freshly added node. */
export function defaultNodeData(type: ChatbotNodeType): FlowNodeData {
  switch (type) {
    case 'message':
      return { text: 'Thanks for your message!' };
    case 'ask':
      return { question: 'What is your name?', variable: 'name', validation: 'none' };
    case 'buttons':
      return { text: 'Choose an option', buttons: [{ id: `opt_${Math.random().toString(36).slice(2, 7)}`, title: 'Option 1' }] };
    case 'condition':
      return { variable: 'vars.name', operator: 'is_set', value: '' };
    case 'set_variable':
      return { variable: 'source', value: 'chatbot' };
    case 'assign':
      return { assignTo: 'unassigned', note: '' };
    case 'ai_reply':
      return { fallback: 'Let me connect you with our team.' };
    case 'http_request':
      return { method: 'POST', url: 'https://', headers: [], body: '{"phone": "{{contact.phone}}"}', saveAs: 'api_result' };
    case 'send_template':
      return { variables: [] };
    default:
      return {};
  }
}
