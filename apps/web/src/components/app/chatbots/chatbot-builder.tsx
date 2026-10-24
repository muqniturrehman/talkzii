'use client';

import '@xyflow/react/dist/style.css';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { AlertTriangle, ArrowLeft, FlaskConical, Power, RotateCcw, Save, Send } from 'lucide-react';
import { validateFlowGraph, type ChatbotNodeType, type ChatbotTrigger, type FlowGraph } from '@talkzi/shared';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Input } from '@talkzi/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@talkzi/ui/sheet';
import { toast } from '@talkzi/ui/sonner';
import { useTheme } from '@talkzi/ui/theme-provider';
import { cn } from '@talkzi/ui/lib/utils';
import { useApp } from '@/components/providers/app-providers';
import { apiFetch } from '@/lib/api/client';
import type { SessionState } from '@/lib/chatbots/engine';
import type { SimulatedMessage } from '@/lib/chatbots/runtime';
import { WhatsAppText } from '@/lib/inbox/whatsapp-format';
import { defaultNodeData, NODE_META, nodeTypes, type BuilderNode } from './flow-nodes';
import { NodeInspector, TriggerEditor } from './node-inspector';

export interface BuilderFlow {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'inactive';
  trigger: ChatbotTrigger;
  graph: FlowGraph;
  priority: number;
  phone_number_id: string | null;
  stats: { live: number; completed: number; handedOff: number };
}

const newNodeId = (type: ChatbotNodeType) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

const PALETTE: ChatbotNodeType[] = ['message', 'ask', 'buttons', 'condition', 'ai_reply', 'set_variable', 'label', 'assign', 'end'];

type ChatLine = { from: 'customer'; text: string } | { from: 'bot'; message: SimulatedMessage };

function Simulator({ flowId, graph }: { flowId: string; graph: FlowGraph }) {
  const [lines, setLines] = React.useState<ChatLine[]>([]);
  const [state, setState] = React.useState<SessionState | null>(null);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const ended = state && ['completed', 'handed_off', 'failed'].includes(state.status);

  const send = async (input: string, buttonId?: string) => {
    if (!input.trim() && !buttonId) return;
    setBusy(true);
    setLines((l) => [...l, { from: 'customer', text: input }]);
    setText('');
    try {
      const result = await apiFetch<{ messages: SimulatedMessage[]; state: SessionState }>(`/api/chatbots/${flowId}/execute`, {
        body: { text: input, buttonId, state: ended ? null : state, graph },
      });
      setLines((l) => [...l, ...result.messages.map((message) => ({ from: 'bot' as const, message }))]);
      setState(result.state);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 scrollbar-thin" aria-live="polite">
        {lines.length === 0 ? <p className="text-center text-sm text-muted-foreground">Send a trigger keyword (e.g. “hi”) to start a test run.</p> : null}
        {lines.map((line, i) =>
          line.from === 'customer' ? (
            <div key={i} className="flex justify-end">
              <span className="max-w-[80%] rounded-2xl rounded-br-md bg-bubble-out px-3 py-2 text-sm">{line.text}</span>
            </div>
          ) : line.message.kind === 'handoff' ? (
            <p key={i} className="text-center text-xs text-warning">Handed off to the team{line.message.note ? ` — ${line.message.note}` : ''}</p>
          ) : line.message.kind === 'label' ? (
            <p key={i} className="text-center text-xs text-muted-foreground">Label added to the contact</p>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-bubble-in px-3 py-2 text-sm shadow-sm">
                <p className="whitespace-pre-wrap">
                  <WhatsAppText text={line.message.text} />
                </p>
                {line.message.kind === 'buttons' || line.message.kind === 'list' ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {(line.message.kind === 'buttons' ? line.message.buttons : line.message.rows).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        disabled={busy || Boolean(ended)}
                        onClick={() => void send(b.title, b.id)}
                        className="rounded-lg border border-primary/30 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50 dark:text-accent"
                      >
                        {b.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
        {ended ? (
          <p className="text-center text-xs text-muted-foreground">
            Session {state?.status.replace('_', ' ')}. Send a message to start over.
          </p>
        ) : null}
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type as the customer…" aria-label="Test message" />
        <Button type="submit" size="icon" loading={busy} aria-label="Send test message">
          <Send />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Reset test"
          onClick={() => {
            setLines([]);
            setState(null);
          }}
        >
          <RotateCcw />
        </Button>
      </form>
    </div>
  );
}

function Builder({ flow }: { flow: BuilderFlow }) {
  const { can } = useApp();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const reactFlow = useReactFlow();
  const editable = can('admin');
  const [nodes, setNodes, applyNodeChanges] = useNodesState<BuilderNode>(
    flow.graph.nodes.map((n) => ({ ...n, deletable: n.type !== 'start' })) as BuilderNode[],
  );
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<Edge>(flow.graph.edges.map((e) => ({ ...e, sourceHandle: e.sourceHandle ?? undefined })));
  const [name, setName] = React.useState(flow.name);
  const [trigger, setTrigger] = React.useState<ChatbotTrigger>(flow.trigger);
  const [status, setStatus] = React.useState(flow.status);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const graph = React.useMemo<FlowGraph>(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, type: n.type as ChatbotNodeType, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
    }),
    [nodes, edges],
  );
  const issues = React.useMemo(() => validateFlowGraph(graph), [graph]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const onNodesChange = (changes: NodeChange<BuilderNode>[]) => {
    applyNodeChanges(changes);
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true);
  };
  const onEdgesChange = (changes: EdgeChange<Edge>[]) => {
    applyEdgeChanges(changes);
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
  };
  const onConnect = (connection: Connection) => {
    setEdges((current) =>
      addEdge(
        { ...connection, id: `e-${connection.source}-${connection.sourceHandle ?? 'out'}-${connection.target}` },
        // One path per output: reconnecting replaces the old edge.
        current.filter((e) => !(e.source === connection.source && (e.sourceHandle ?? null) === (connection.sourceHandle ?? null))),
      ),
    );
    setDirty(true);
  };

  const addNode = (type: ChatbotNodeType) => {
    const id = newNodeId(type);
    const center = reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setNodes((current) => [...current, { id, type, position: { x: center.x - 120, y: center.y - 40 }, data: defaultNodeData(type), deletable: true }]);
    setSelectedId(id);
    setDirty(true);
  };

  const updateSelected = (data: Record<string, unknown>) => {
    if (!selectedId) return;
    setNodes((current) => current.map((n) => (n.id === selectedId ? { ...n, data } : n)));
    // Drop edges from buttons that no longer exist.
    if (selected?.type === 'buttons' && Array.isArray(data.buttons)) {
      const ids = new Set((data.buttons as { id: string }[]).map((b) => b.id));
      setEdges((current) => current.filter((e) => e.source !== selectedId || !e.sourceHandle || ids.has(e.sourceHandle)));
    }
    setDirty(true);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes((current) => current.filter((n) => n.id !== selectedId));
    setEdges((current) => current.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/chatbots/${flow.id}`, {
        method: 'PATCH',
        body: { name: name.trim() || 'Untitled flow', trigger, graph, priority: flow.priority, phoneNumberId: flow.phone_number_id },
      });
      setDirty(false);
      toast.success('Flow saved.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (dirty && !(await save())) return;
    const next = status === 'active' ? 'inactive' : 'active';
    try {
      await apiFetch(`/api/chatbots/${flow.id}/status`, { body: { status: next } });
      setStatus(next);
      toast.success(next === 'active' ? 'Chatbot is live 🎉' : 'Chatbot turned off.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change status');
    }
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button asChild size="icon-sm" variant="ghost" aria-label="Back to chatbots">
          <Link href="/app/chatbots">
            <ArrowLeft />
          </Link>
        </Button>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          aria-label="Flow name"
          className="h-8 w-56"
          disabled={!editable}
        />
        <Badge variant={status === 'active' ? 'success' : 'secondary'}>{status}</Badge>
        <span className="hidden text-xs text-muted-foreground md:inline">
          {flow.stats.live} live · {flow.stats.completed} completed · {flow.stats.handedOff} handed off
        </span>
        <div className="ml-auto flex items-center gap-2">
          {issues.length ? (
            <span className="hidden items-center gap-1 text-xs text-warning sm:flex" title={issues.join('\n')}>
              <AlertTriangle className="size-3.5" /> {issues.length} issue{issues.length === 1 ? '' : 's'}
            </span>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setTesting(true)}>
            <FlaskConical /> Test
          </Button>
          {editable ? (
            <>
              <Button size="sm" variant="outline" onClick={() => void save()} loading={saving} disabled={!dirty}>
                <Save /> Save
              </Button>
              <Button size="sm" variant={status === 'active' ? 'outline' : 'default'} onClick={() => void toggleActive()}>
                <Power /> {status === 'active' ? 'Turn off' : 'Activate'}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {editable ? (
          <aside className="hidden w-52 shrink-0 space-y-1 overflow-y-auto border-r border-border p-3 scrollbar-thin md:block" aria-label="Add steps">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a step</p>
            {PALETTE.map((type) => {
              const meta = NODE_META[type];
              const Icon = meta.icon;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addNode(type)}
                  className="flex w-full items-start gap-2 rounded-xl p-2 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', meta.accent)} />
                  <span>
                    <span className="block text-sm font-medium">{meta.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{meta.description}</span>
                  </span>
                </button>
              );
            })}
          </aside>
        ) : null}

        <div className="min-w-0 flex-1" aria-label="Flow canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={editable ? onNodesChange : undefined}
            onEdgesChange={editable ? onEdgesChange : undefined}
            onConnect={editable ? onConnect : undefined}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodesDraggable={editable}
            nodesConnectable={editable}
            colorMode={resolvedTheme === 'light' ? 'light' : 'dark'}
            defaultEdgeOptions={{ animated: true }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden lg:!block" />
          </ReactFlow>
        </div>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border p-4 scrollbar-thin lg:block" aria-label="Step settings">
          {selected && selected.type !== 'start' ? (
            <NodeInspector key={selected.id} type={selected.type as ChatbotNodeType} data={selected.data} onChange={updateSelected} onDelete={editable ? deleteSelected : undefined} />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold">Trigger</p>
                <p className="text-xs text-muted-foreground">Select a step on the canvas to edit it.</p>
              </div>
              <TriggerEditor
                trigger={trigger}
                onChange={(t) => {
                  setTrigger(t);
                  setDirty(true);
                }}
              />
              {issues.length ? (
                <div className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
                  <p className="font-medium text-warning">Fix before activating</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      <Sheet open={testing} onOpenChange={setTesting}>
        <SheetContent side="right" className="flex w-[24rem] max-w-full flex-col p-0">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>Test this flow</SheetTitle>
            <SheetDescription>Runs your current (unsaved) changes. Nothing is sent to WhatsApp.</SheetDescription>
          </SheetHeader>
          <Simulator flowId={flow.id} graph={graph} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ChatbotBuilder({ flow }: { flow: BuilderFlow }) {
  return (
    <ReactFlowProvider>
      <Builder flow={flow} />
    </ReactFlowProvider>
  );
}
