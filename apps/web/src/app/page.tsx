import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Glow } from '@talkzi/ui/glow';
import { Logo } from '@talkzi/ui/logo';
import { ThemeToggle } from '@talkzi/ui/theme-toggle';

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-4">
      <Glow className="top-1/3 left-1/2 size-96 -translate-x-1/2" />
      <div className="flex items-center gap-3">
        <Logo />
        <ThemeToggle />
      </div>
      <h1 className="text-brand-gradient text-center text-4xl font-bold">Run your business on WhatsApp.</h1>
      <Card variant="glass" className="w-full">
        <CardHeader>
          <CardTitle>Design system</CardTitle>
          <CardDescription>Tokens, glass cards, gradient CTAs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button>Start free</Button>
          <Button variant="outline">Login</Button>
          <Badge variant="success">APPROVED</Badge>
          <Badge variant="warning">PENDING</Badge>
          <Badge variant="danger">REJECTED</Badge>
        </CardContent>
      </Card>
    </main>
  );
}
