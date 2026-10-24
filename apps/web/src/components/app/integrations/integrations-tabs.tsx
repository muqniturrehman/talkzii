'use client';

import * as React from 'react';
import { KeyRound, Plug, Webhook } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@talkzi/ui/tabs';
import { ApiKeysPanel } from './api-keys-panel';
import { AppsPanel } from './apps-panel';
import { WebhooksPanel } from './webhooks-panel';

export type IntegrationTab = 'apps' | 'webhooks' | 'api-keys';

/** Apps / Webhooks / API keys; the active tab is mirrored to ?tab= so it can be linked. */
export function IntegrationsTabs({ initialTab }: { initialTab: IntegrationTab }) {
  return (
    <Tabs
      defaultValue={initialTab}
      onValueChange={(tab) => {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState(null, '', url);
      }}
    >
      <TabsList className="max-w-full overflow-x-auto">
        <TabsTrigger value="apps">
          <Plug className="size-4" aria-hidden /> Apps
        </TabsTrigger>
        <TabsTrigger value="webhooks">
          <Webhook className="size-4" aria-hidden /> Webhooks
        </TabsTrigger>
        <TabsTrigger value="api-keys">
          <KeyRound className="size-4" aria-hidden /> API keys
        </TabsTrigger>
      </TabsList>
      <TabsContent value="apps">
        <AppsPanel />
      </TabsContent>
      <TabsContent value="webhooks">
        <WebhooksPanel />
      </TabsContent>
      <TabsContent value="api-keys">
        <ApiKeysPanel />
      </TabsContent>
    </Tabs>
  );
}
