import { Bot, CheckCheck, Inbox, Megaphone, Paperclip, Search, Send, Sparkles, Users } from 'lucide-react';

const chats = [
  { name: 'Ayesha Khan', preview: 'Is COD available in Lahore?', time: '2m', unread: 2, active: true },
  { name: 'Bilal Raza', preview: 'Order TZ-1042 status?', time: '9m', unread: 1 },
  { name: 'Hira Shah', preview: 'Thank you so much! 💜', time: '24m' },
  { name: 'Usman Tariq', preview: 'Wholesale price for 20 pcs', time: '1h' },
];

/** Static, decorative product mock for the hero (no data, no JS). */
export function MockDashboard() {
  return (
    <div className="glass overflow-hidden rounded-2xl shadow-glow-lg" aria-hidden>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-3 rounded-full bg-danger/70" />
        <span className="size-3 rounded-full bg-warning/70" />
        <span className="size-3 rounded-full bg-success/70" />
        <span className="ml-3 hidden rounded-lg bg-muted px-3 py-1 text-xs text-muted-foreground sm:block">
          app.talkzi.app/inbox
        </span>
      </div>

      <div className="grid h-[380px] grid-cols-1 sm:grid-cols-[56px_220px_1fr]">
        <div className="hidden flex-col items-center gap-3 border-r border-border py-4 sm:flex">
          {[Inbox, Users, Megaphone, Bot].map((Icon, i) => (
            <div
              key={i}
              className={`flex size-9 items-center justify-center rounded-xl ${i === 0 ? 'bg-primary/20 text-primary dark:text-accent' : 'text-muted-foreground'}`}
            >
              <Icon className="size-4" />
            </div>
          ))}
        </div>

        <div className="hidden flex-col border-r border-border sm:flex">
          <div className="m-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Search className="size-3.5" /> Search chats
          </div>
          {chats.map((chat) => (
            <div
              key={chat.name}
              className={`mx-2 mb-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${chat.active ? 'bg-primary/15' : ''}`}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary dark:text-accent">
                {chat.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs font-semibold">{chat.name}</p>
                  <span className="text-[10px] text-muted-foreground">{chat.time}</span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{chat.preview}</p>
              </div>
              {chat.unread ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {chat.unread}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-col bg-chat-bg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold">Ayesha Khan</p>
              <p className="text-[11px] text-success">● Session open · 23h left</p>
            </div>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary dark:text-accent">
              VIP
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-hidden p-4 text-[12px]">
            <div className="max-w-[75%] self-start rounded-2xl rounded-tl-sm bg-bubble-in px-3 py-2 shadow-sm">
              Assalam o Alaikum! Is the embroidered lawn suit still available?
            </div>
            <div className="max-w-[75%] self-end rounded-2xl rounded-tr-sm bg-bubble-out px-3 py-2 shadow-sm">
              Walaikum Assalam! Yes — S, M and L. PKR 4,500 with free delivery.
              <span className="ml-2 inline-flex items-center gap-0.5 align-bottom text-[10px] text-info">
                <CheckCheck className="size-3" />
              </span>
            </div>
            <div className="max-w-[75%] self-start rounded-2xl rounded-tl-sm bg-bubble-in px-3 py-2 shadow-sm">
              Great! Is cash on delivery possible in Lahore?
            </div>
            <div className="mt-auto flex items-center gap-2 self-start rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-[11px]">
              <Sparkles className="size-3.5 text-primary dark:text-accent" />
              <span>
                <span className="font-semibold">AI suggestion:</span> Yes! COD is available across Lahore 🚚
              </span>
            </div>
          </div>

          <div className="m-3 flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" />
            <span className="flex-1">Type / for canned replies…</span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-gradient text-white">
              <Send className="size-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
