export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  readingMinutes: number;
  tags: string[];
  body: { type: 'p' | 'h2' | 'li'; text: string }[];
}

/** Starter articles — replace or extend with your CMS of choice. */
export const posts: BlogPost[] = [
  {
    slug: 'whatsapp-24-hour-window-explained',
    title: 'The WhatsApp 24-hour window, explained',
    excerpt: 'When you can send free-form messages, when you need a template, and how Talkzi enforces it for you.',
    date: '2026-10-01',
    author: 'Talkzi Team',
    readingMinutes: 4,
    tags: ['WhatsApp API', 'Guides'],
    body: [
      { type: 'p', text: 'Every time a customer sends you a WhatsApp message, a 24-hour customer service window opens. Inside that window you can reply with any message type — text, images, documents or interactive buttons.' },
      { type: 'h2', text: 'What happens when the window closes?' },
      { type: 'p', text: 'Once 24 hours pass without a new customer message, WhatsApp only lets businesses send pre-approved message templates. Templates are reviewed by Meta and fall into marketing, utility or authentication categories.' },
      { type: 'h2', text: 'How Talkzi helps' },
      { type: 'li', text: 'Every conversation shows a live countdown until the window closes.' },
      { type: 'li', text: 'When it closes, the composer switches to a template picker automatically.' },
      { type: 'li', text: 'The API rejects free-form sends outside the window with a clear SESSION_WINDOW_CLOSED error.' },
    ],
  },
  {
    slug: 'broadcasts-that-dont-get-you-blocked',
    title: 'Broadcasts that don’t get you blocked',
    excerpt: 'Opt-in, segmentation and quality rating: a practical checklist for WhatsApp marketing in Pakistan.',
    date: '2026-09-15',
    author: 'Talkzi Team',
    readingMinutes: 6,
    tags: ['Marketing', 'Best practices'],
    body: [
      { type: 'p', text: 'WhatsApp is the highest-engagement channel most Pakistani businesses have — which is exactly why customers punish spam. Your phone number’s quality rating drops when people block or report you.' },
      { type: 'h2', text: 'A simple checklist' },
      { type: 'li', text: 'Only message customers who opted in, and honour STOP immediately.' },
      { type: 'li', text: 'Segment by interest using labels instead of messaging everyone.' },
      { type: 'li', text: 'Personalise with variables — names, order numbers, cities.' },
      { type: 'li', text: 'Watch your quality rating; Talkzi pauses broadcasts automatically if it turns red.' },
    ],
  },
  {
    slug: 'why-official-cloud-api',
    title: 'Why we only use the official WhatsApp Cloud API',
    excerpt: 'QR-code tools are cheap until your number gets banned. Here is how the official platform protects your business.',
    date: '2026-08-28',
    author: 'Talkzi Team',
    readingMinutes: 5,
    tags: ['Company', 'WhatsApp API'],
    body: [
      { type: 'p', text: 'Unofficial WhatsApp tools automate the consumer app through QR codes and browser sessions. They violate WhatsApp’s terms, break without warning and put your number at risk of a permanent ban.' },
      { type: 'h2', text: 'The official alternative' },
      { type: 'p', text: 'Meta’s WhatsApp Business Cloud API is hosted by Meta, scales to thousands of messages per second and supports verified business profiles. Talkzi onboards you through Embedded Signup, so you own your WhatsApp Business Account and phone number.' },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((post) => post.slug === slug);
}
