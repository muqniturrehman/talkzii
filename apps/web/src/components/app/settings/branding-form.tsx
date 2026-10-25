'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ImageUp, RotateCcw, Trash2 } from 'lucide-react';
import { brandingSchema, contrastRatio, readableTextOn, type Branding } from '@talkzi/shared';
import { LogoMark } from '@talkzi/ui/logo';
import { Button } from '@talkzi/ui/button';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Switch } from '@talkzi/ui/switch';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { apiFetch } from '@/lib/api/client';
import { uploadPublicFile } from '@/lib/storage-client';

const DEFAULT_PRIMARY = '#6d28d9';
const DEFAULT_ACCENT = '#8b5cf6';
const SURFACES = { light: '#ffffff', dark: '#0a0a0f' } as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Unique storage path per upload (module scope keeps render pure). */
const uploadPath = (workspaceId: string, kind: 'logo' | 'favicon') => `${workspaceId}/brand-${kind}-${Date.now()}`;

/** Contrast of a brand colour used as text/icons on each theme's background. */
function ContrastNote({ color, label }: { color: string; label: string }) {
  if (!HEX.test(color)) return null;
  return (
    <ul className="space-y-0.5 text-xs" aria-label={`${label} contrast`}>
      {(['light', 'dark'] as const).map((mode) => {
        const ratio = contrastRatio(color, SURFACES[mode]);
        const ok = ratio >= 4.5;
        const fair = ratio >= 3;
        return (
          <li key={mode} className={cn('flex items-center gap-1', ok ? 'text-muted-foreground' : fair ? 'text-warning' : 'text-danger')}>
            {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
            {ratio.toFixed(1)}:1 on {mode} — {ok ? 'readable text' : fair ? 'fine for buttons and icons, weak for text' : 'too low; pick a stronger colour'}
          </li>
        );
      })}
    </ul>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1"
        />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={7} className="w-32 font-mono" placeholder="#6d28d9" />
      </div>
      <ContrastNote color={value} label={label} />
    </div>
  );
}

/** A miniature app frame painted with the chosen brand, in one theme. */
function Preview({ mode, brand }: { mode: 'light' | 'dark'; brand: { name: string; logoUrl?: string; primary: string; accent: string } }) {
  const dark = mode === 'dark';
  const surface = SURFACES[mode];
  const text = dark ? '#ffffff' : '#0a0a0f';
  const muted = dark ? '#b4b4c7' : '#4a4a5e';
  const border = dark ? '#2a2a3a' : '#e5e0f5';
  const primary = HEX.test(brand.primary) ? brand.primary : DEFAULT_PRIMARY;
  const accent = HEX.test(brand.accent) ? brand.accent : DEFAULT_ACCENT;
  return (
    <figure className="overflow-hidden rounded-2xl border" style={{ background: surface, color: text, borderColor: border }} aria-label={`${mode} theme preview`}>
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: border }}>
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="size-6 rounded object-contain" />
        ) : (
          <LogoMark className="size-6" />
        )}
        <span className="text-sm font-semibold">{brand.name || 'Your brand'}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide" style={{ color: muted }}>
          {mode}
        </span>
      </div>
      <div className="grid grid-cols-[88px_1fr] gap-3 p-3 text-xs">
        <ul className="space-y-1">
          <li className="rounded-md px-2 py-1 font-medium" style={{ background: `color-mix(in oklab, ${primary} 15%, transparent)` }}>
            Inbox
          </li>
          <li className="px-2 py-1" style={{ color: muted }}>
            Contacts
          </li>
          <li className="px-2 py-1" style={{ color: muted }}>
            Broadcasts
          </li>
        </ul>
        <div className="space-y-2">
          <p className="w-fit max-w-[85%] rounded-xl rounded-tl-sm border px-2.5 py-1.5" style={{ borderColor: border }}>
            Is my order shipped?
          </p>
          <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm px-2.5 py-1.5" style={{ background: primary, color: readableTextOn(primary) }}>
            Yes! It’s on the way 🚚
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span style={{ color: dark ? accent : primary }} className="font-medium underline">
              View order
            </span>
            <span className="rounded-lg px-3 py-1.5 font-semibold" style={{ backgroundImage: `linear-gradient(135deg, ${accent}, ${primary})`, color: readableTextOn(primary) }}>
              Send
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}

export function BrandingForm({ workspaceId, initial }: { workspaceId: string; initial: Branding }) {
  const router = useRouter();
  const [brandName, setBrandName] = React.useState(initial.brandName ?? '');
  const [logoUrl, setLogoUrl] = React.useState(initial.logoUrl);
  const [faviconUrl, setFaviconUrl] = React.useState(initial.faviconUrl);
  const [primary, setPrimary] = React.useState(initial.primaryColor ?? DEFAULT_PRIMARY);
  const [accent, setAccent] = React.useState(initial.accentColor ?? DEFAULT_ACCENT);
  const [supportEmail, setSupportEmail] = React.useState(initial.supportEmail ?? '');
  const [hidePoweredBy, setHidePoweredBy] = React.useState(Boolean(initial.hidePoweredBy));
  const [uploading, setUploading] = React.useState<'logo' | 'favicon' | null>(null);
  const [saving, setSaving] = React.useState(false);

  const upload = async (kind: 'logo' | 'favicon', file: File | undefined) => {
    if (!file) return;
    if (file.size > 1024 * 1024) return toast.error('Images must be under 1 MB.');
    setUploading(kind);
    try {
      const url = await uploadPublicFile('branding', uploadPath(workspaceId, kind), file);
      if (kind === 'logo') setLogoUrl(url);
      else setFaviconUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(null);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const candidate = {
      ...(brandName.trim() ? { brandName: brandName.trim() } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(faviconUrl ? { faviconUrl } : {}),
      ...(primary.toLowerCase() !== DEFAULT_PRIMARY ? { primaryColor: primary } : {}),
      ...(accent.toLowerCase() !== DEFAULT_ACCENT ? { accentColor: accent } : {}),
      ...(supportEmail.trim() ? { supportEmail: supportEmail.trim() } : {}),
      ...(hidePoweredBy ? { hidePoweredBy: true } : {}),
    };
    const parsed = brandingSchema.safeParse(candidate);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
    setSaving(true);
    try {
      await apiFetch('/api/workspaces/current/branding', { method: 'PATCH', body: parsed.data });
      toast.success('Branding saved.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save branding.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setBrandName('');
    setLogoUrl(undefined);
    setFaviconUrl(undefined);
    setPrimary(DEFAULT_PRIMARY);
    setAccent(DEFAULT_ACCENT);
    setHidePoweredBy(false);
  };

  const brand = { name: brandName.trim(), logoUrl, primary, accent };

  return (
    <form onSubmit={save} className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="brand-name">Brand name</Label>
          <Input id="brand-name" value={brandName} maxLength={60} onChange={(e) => setBrandName(e.target.value)} placeholder="Your agency" />
          <p className="text-xs text-muted-foreground">Replaces “Talkzi” in the sidebar, browser tab and sign-in pages.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {(['logo', 'favicon'] as const).map((kind) => {
            const url = kind === 'logo' ? logoUrl : faviconUrl;
            return (
              <div key={kind} className="space-y-1.5">
                <Label htmlFor={`${kind}-upload`}>{kind === 'logo' ? 'Logo (square, PNG/SVG/JPG)' : 'Favicon (PNG/ICO)'}</Label>
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="size-full object-contain" />
                    ) : (
                      <ImageUp className="size-4 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <label htmlFor={`${kind}-upload`} className="cursor-pointer">
                      {uploading === kind ? 'Uploading…' : 'Upload'}
                    </label>
                  </Button>
                  <input
                    id={`${kind}-upload`}
                    type="file"
                    className="sr-only"
                    accept={kind === 'logo' ? 'image/png,image/jpeg,image/svg+xml,image/webp' : 'image/png,image/x-icon,image/vnd.microsoft.icon'}
                    onChange={(e) => void upload(kind, e.target.files?.[0])}
                  />
                  {url ? (
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${kind}`} onClick={() => (kind === 'logo' ? setLogoUrl(undefined) : setFaviconUrl(undefined))}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <ColorField id="primary-color" label="Primary colour" value={primary} onChange={setPrimary} />
          <ColorField id="accent-color" label="Accent colour" value={accent} onChange={setAccent} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="support-email">Support email (optional)</Label>
          <Input id="support-email" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@youragency.com" />
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <span>
            <span className="block text-sm font-medium">Hide “Powered by Talkzi”</span>
            <span className="block text-xs text-muted-foreground">Removes the Talkzi mention from the sidebar and sign-in pages.</span>
          </span>
          <Switch checked={hidePoweredBy} onCheckedChange={setHidePoweredBy} />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving}>
            Save branding
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            <RotateCcw /> Reset to Talkzi defaults
          </Button>
        </div>
      </div>

      <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <p className="text-sm font-medium">Preview</p>
        <Preview mode="light" brand={brand} />
        <Preview mode="dark" brand={brand} />
        <p className="text-xs text-muted-foreground">Client workspaces inherit this branding unless they set their own.</p>
      </div>
    </form>
  );
}
