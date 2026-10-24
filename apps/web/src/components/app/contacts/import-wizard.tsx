'use client';

import * as React from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { COUNTRY_CODES, IMPORT_BATCH_SIZE, normalizePhone, type ImportRow } from '@talkzi/shared';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Checkbox } from '@talkzi/ui/checkbox';
import { Label } from '@talkzi/ui/label';
import { Progress } from '@talkzi/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Switch } from '@talkzi/ui/switch';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { useLabels } from '@/components/app/inbox/use-inbox';
import { apiFetch } from '@/lib/api/client';
import { csvCell } from '@/lib/contacts/import';
import type { ImportResult } from '@/lib/contacts/types';
import { contactsKey } from './contacts-table';

type Step = 'upload' | 'map' | 'review' | 'importing' | 'done';
type Field = 'phone' | 'name' | 'email' | 'labels';

const NONE = '__none__';
const MAX_ROWS = 100_000;
const GUESSES: Record<Field, RegExp> = {
  phone: /phone|mobile|whats ?app|number|cell|contact/i,
  name: /^(full ?)?name$|customer|first ?name/i,
  email: /e-?mail/i,
  labels: /label|tag|group|segment/i,
};

interface Parsed {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

interface Totals extends Omit<ImportResult, 'invalid'> {
  invalid: ImportResult['invalid'];
}

const emptyTotals = (): Totals => ({ received: 0, created: 0, updated: 0, existing: 0, skipped_limit: 0, invalid: [] });

function guessMapping(headers: string[]): Record<Field, string> {
  const used = new Set<string>();
  const pick = (field: Field) => {
    const match = headers.find((h) => !used.has(h) && GUESSES[field].test(h.trim()));
    if (match) used.add(match);
    return match ?? NONE;
  };
  return { phone: pick('phone'), email: pick('email'), labels: pick('labels'), name: pick('name') };
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'map', label: 'Map columns' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Import' },
  ];
  const order: Step[] = ['upload', 'map', 'review', 'importing', 'done'];
  const current = order.indexOf(step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Import progress">
      {steps.map((s, i) => {
        const index = order.indexOf(s.id);
        const active = index === current || (s.id === 'done' && step === 'importing');
        const complete = index < current && !(s.id === 'done');
        return (
          <li key={s.id} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                active ? 'border-primary bg-primary text-primary-foreground' : complete ? 'border-primary text-primary' : 'border-border text-muted-foreground',
              )}
            >
              {complete ? '✓' : i + 1}
            </span>
            <span className={active ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
            {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ImportWizard({ defaultCountryCode }: { defaultCountryCode: string }) {
  const qc = useQueryClient();
  const labels = useLabels();
  const [step, setStep] = React.useState<Step>('upload');
  const [parsed, setParsed] = React.useState<Parsed | null>(null);
  const [mapping, setMapping] = React.useState<Record<Field, string>>({ phone: NONE, name: NONE, email: NONE, labels: NONE });
  const [customColumns, setCustomColumns] = React.useState<Set<string>>(new Set());
  const [countryCode, setCountryCode] = React.useState(defaultCountryCode);
  const [updateExisting, setUpdateExisting] = React.useState(false);
  const [labelIds, setLabelIds] = React.useState<string[]>([]);
  const [consent, setConsent] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [totals, setTotals] = React.useState<Totals>(emptyTotals);
  const [dragging, setDragging] = React.useState(false);
  const cancelled = React.useRef(false);

  const onFile = (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error('CSV files must be under 20 MB.');
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const headers = (result.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0 || result.data.length === 0) {
          toast.error('That file has no rows. Make sure the first row contains column names.');
          return;
        }
        if (result.data.length > MAX_ROWS) {
          toast.error(`Import up to ${MAX_ROWS.toLocaleString()} rows at a time — split the file and try again.`);
          return;
        }
        const guessed = guessMapping(headers);
        setParsed({ fileName: file.name, headers, rows: result.data });
        setMapping(guessed);
        setCustomColumns(new Set(headers.filter((h) => !Object.values(guessed).includes(h))));
        setStep('map');
      },
      error: (error) => toast.error(`Could not read the CSV: ${error.message}`),
    });
  };

  const importRows = React.useMemo<ImportRow[]>(() => {
    if (!parsed || mapping.phone === NONE) return [];
    const col = (row: Record<string, string>, field: Field) => (mapping[field] === NONE ? undefined : row[mapping[field]]?.trim() || undefined);
    return parsed.rows.map((row, i) => {
      const custom = Object.fromEntries(
        [...customColumns].flatMap((h) => {
          const value = row[h]?.trim();
          return value ? [[h.slice(0, 50), value.slice(0, 1000)]] : [];
        }),
      );
      const labelText = col(row, 'labels');
      return {
        row: i + 2,
        phone: col(row, 'phone') ?? '',
        name: col(row, 'name')?.slice(0, 200),
        email: col(row, 'email')?.slice(0, 320),
        labels: labelText ? labelText.split(/[;,|]/).map((l) => l.trim().slice(0, 50)).filter(Boolean).slice(0, 10) : undefined,
        customFields: Object.keys(custom).length ? custom : undefined,
      };
    });
  }, [parsed, mapping, customColumns]);

  const preview = React.useMemo(() => {
    const seen = new Set<string>();
    let valid = 0;
    const problems: { row: number; reason: string }[] = [];
    for (const row of importRows) {
      const waId = normalizePhone(row.phone, countryCode);
      if (!waId) problems.push({ row: row.row, reason: row.phone ? `Invalid phone “${row.phone}”` : 'Missing phone' });
      else if (seen.has(waId)) problems.push({ row: row.row, reason: `Duplicate +${waId}` });
      else {
        seen.add(waId);
        valid++;
      }
    }
    return { valid, problems };
  }, [importRows, countryCode]);

  const runImport = async () => {
    setStep('importing');
    setProgress(0);
    cancelled.current = false;
    const acc = emptyTotals();
    for (let i = 0; i < importRows.length; i += IMPORT_BATCH_SIZE) {
      if (cancelled.current) break;
      const batch = importRows.slice(i, i + IMPORT_BATCH_SIZE);
      try {
        const result = await apiFetch<ImportResult>('/api/contacts/import', {
          body: { rows: batch, updateExisting, labelIds, defaultCountryCode: countryCode, consent: true },
        });
        acc.received += result.received;
        acc.created += result.created;
        acc.updated += result.updated;
        acc.existing += result.existing;
        acc.skipped_limit += result.skipped_limit;
        acc.invalid.push(...result.invalid);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Import batch failed');
        acc.invalid.push(...batch.map((r) => ({ row: r.row, reason: 'Batch failed — try again' })));
      }
      setTotals({ ...acc, invalid: [...acc.invalid] });
      setProgress(Math.min(100, Math.round(((i + batch.length) / importRows.length) * 100)));
    }
    void qc.invalidateQueries({ queryKey: contactsKey });
    setStep('done');
  };

  const downloadErrors = () => {
    const csv = ['row,reason', ...totals.invalid.map((e) => `${e.row},${csvCell(e.reason)}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />

      {step === 'upload' ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload a CSV</CardTitle>
            <CardDescription>The first row must contain column names. Phone numbers can be local (0300…) or international (+92…).</CardDescription>
          </CardHeader>
          <CardContent>
            <label
              htmlFor="csv-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) onFile(file);
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition',
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              )}
            >
              <Upload className="size-8 text-primary" />
              <span className="font-medium">Drop your CSV here or click to browse</span>
              <span className="text-xs text-muted-foreground">Up to {MAX_ROWS.toLocaleString()} rows · 20 MB</span>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFile(file);
                }}
              />
            </label>
            <p className="mt-3 text-xs text-muted-foreground">
              Example columns: <code>name, phone, email, labels, city</code>. Extra columns are saved as custom fields.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {step === 'map' && parsed ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" /> {parsed.fileName}
            </CardTitle>
            <CardDescription>{parsed.rows.length.toLocaleString()} rows · match your columns to contact fields.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {(['phone', 'name', 'email', 'labels'] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`map-${field}`}>
                    {field === 'phone' ? 'Phone number *' : field === 'labels' ? 'Labels (separated by ; or ,)' : field[0]!.toUpperCase() + field.slice(1)}
                  </Label>
                  <Select
                    value={mapping[field]}
                    onValueChange={(value) => {
                      setMapping((m) => ({ ...m, [field]: value }));
                      setCustomColumns((cols) => {
                        const next = new Set(cols);
                        next.delete(value);
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger id={`map-${field}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Don’t import —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {parsed.headers.some((h) => !Object.values(mapping).includes(h)) ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Save other columns as custom fields</legend>
                <div className="flex flex-wrap gap-3">
                  {parsed.headers
                    .filter((h) => !Object.values(mapping).includes(h))
                    .map((h) => (
                      <label key={h} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={customColumns.has(h)}
                          onCheckedChange={(v) =>
                            setCustomColumns((cols) => {
                              const next = new Set(cols);
                              if (v === true) next.add(h);
                              else next.delete(h);
                              return next;
                            })
                          }
                        />
                        {h}
                      </label>
                    ))}
                </div>
              </fieldset>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cc">Default country for local numbers</Label>
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger id="cc">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((c) => (
                      <SelectItem key={`${c.code}-${c.country}`} value={c.code}>
                        {c.country} (+{c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <Label htmlFor="update-existing">Update existing contacts</Label>
                  <p className="text-xs text-muted-foreground">Fill in names, emails and custom fields for numbers you already have.</p>
                </div>
                <Switch id="update-existing" checked={updateExisting} onCheckedChange={setUpdateExisting} />
              </div>
            </div>

            {(labels.data ?? []).length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Add these labels to every imported contact</p>
                <div className="flex flex-wrap gap-2">
                  {(labels.data ?? []).map((l) => {
                    const on = labelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setLabelIds((ids) => (on ? ids.filter((id) => id !== l.id) : [...ids, l.id].slice(0, 10)))}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition',
                          on ? 'border-primary bg-primary/10 text-primary dark:text-accent' : 'border-border hover:border-primary/50',
                        )}
                      >
                        <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button disabled={mapping.phone === NONE} onClick={() => setStep('review')}>
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'review' && parsed ? (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              {preview.valid.toLocaleString()} contacts ready · {preview.problems.length.toLocaleString()} rows will be skipped
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Labels</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 5).map((row) => {
                    const waId = normalizePhone(row.phone, countryCode);
                    return (
                      <tr key={row.row} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{row.row}</td>
                        <td className="px-3 py-2">{waId ? `+${waId}` : <span className="text-danger">{row.phone || 'missing'}</span>}</td>
                        <td className="px-3 py-2">{row.name ?? '—'}</td>
                        <td className="px-3 py-2">{row.email ?? '—'}</td>
                        <td className="px-3 py-2">{row.labels?.join(', ') ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {preview.problems.length ? (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>{preview.problems.length.toLocaleString()} rows need attention</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc pl-4">
                    {preview.problems.slice(0, 5).map((p) => (
                      <li key={p.row}>
                        Row {p.row}: {p.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
              <span>
                I confirm these contacts gave permission to receive WhatsApp messages from my business (WhatsApp Business Messaging Policy). Talkzi
                honours opt-outs automatically.
              </span>
            </label>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep('map')}>
                Back
              </Button>
              <Button disabled={!consent || preview.valid === 0} onClick={() => void runImport()}>
                Import {preview.valid.toLocaleString()} contacts
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'importing' ? (
        <Card>
          <CardHeader>
            <CardTitle>Importing…</CardTitle>
            <CardDescription>Keep this tab open. Contacts are imported in batches of {IMPORT_BATCH_SIZE}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} aria-label="Import progress" />
            <p className="text-sm text-muted-foreground">
              {progress}% · {totals.created.toLocaleString()} created · {totals.updated.toLocaleString()} updated
            </p>
            <Button variant="outline" onClick={() => (cancelled.current = true)}>
              Stop after this batch
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-success" /> Import finished
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{totals.created.toLocaleString()} created</Badge>
              <Badge variant="info">{totals.updated.toLocaleString()} updated</Badge>
              {!updateExisting && totals.existing ? <Badge variant="secondary">{totals.existing.toLocaleString()} already existed</Badge> : null}
              {totals.skipped_limit ? <Badge variant="warning">{totals.skipped_limit.toLocaleString()} over plan limit</Badge> : null}
              {totals.invalid.length ? <Badge variant="danger">{totals.invalid.length.toLocaleString()} skipped</Badge> : null}
            </div>
            {totals.skipped_limit ? (
              <p className="text-sm text-muted-foreground">
                Your plan’s contact limit was reached. <Link href="/app/settings/billing" className="text-primary underline">Upgrade</Link> to import the rest.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/app/contacts">View contacts</Link>
              </Button>
              {totals.invalid.length ? (
                <Button variant="outline" onClick={downloadErrors}>
                  Download skipped rows
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => {
                  setParsed(null);
                  setTotals(emptyTotals());
                  setConsent(false);
                  setStep('upload');
                }}
              >
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
