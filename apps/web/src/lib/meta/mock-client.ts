import type { MessagePayload, SendResult } from '@talkzi/whatsapp';
import type { WhatsAppApi } from './whatsapp';

const fakeId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.toUpperCase();

/**
 * In-memory stand-in for the Cloud API, used for the seeded demo workspace
 * (WABA metadata.mock = true) and when WHATSAPP_MOCK=true. Sends "succeed"
 * with fake wamids so the inbox, broadcasts and bots work without Meta.
 */
export function createMockWhatsAppClient(): WhatsAppApi {
  const sendMessage = async (_phoneNumberId: string, to: string, payload: MessagePayload): Promise<SendResult> => {
    const wamid = `wamid.${fakeId('MOCK')}`;
    const waId = to.replace(/\D/g, '');
    return {
      wamid,
      waId,
      messageStatus: 'accepted',
      raw: { messaging_product: 'whatsapp', contacts: [{ input: to, wa_id: waId }], messages: [{ id: wamid }], ...{ mockPayloadType: payload.type } } as SendResult['raw'],
    };
  };
  const ok = async () => ({ success: true });

  return {
    sendMessage,
    sendText: (p, to, text) => sendMessage(p, to, { type: 'text', text: { body: text } }),
    sendTemplate: (p, to, t) => sendMessage(p, to, { type: 'template', template: { name: t.name, language: { code: t.language } } }),
    sendImage: (p, to, media) => sendMessage(p, to, { type: 'image', image: media }),
    sendVideo: (p, to, media) => sendMessage(p, to, { type: 'video', video: media }),
    sendAudio: (p, to, media) => sendMessage(p, to, { type: 'audio', audio: media }),
    sendDocument: (p, to, media) => sendMessage(p, to, { type: 'document', document: media }),
    sendLocation: (p, to, location) => sendMessage(p, to, { type: 'location', location }),
    sendContacts: (p, to, contacts) => sendMessage(p, to, { type: 'contacts', contacts }),
    sendInteractiveButtons: (p, to, input) =>
      sendMessage(p, to, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: input.body },
          action: { buttons: input.buttons.map((b) => ({ type: 'reply' as const, reply: b })) },
        },
      }),
    sendInteractiveList: (p, to, input) =>
      sendMessage(p, to, {
        type: 'interactive',
        interactive: { type: 'list', body: { text: input.body }, action: { button: input.buttonText, sections: input.sections } },
      }),
    sendInteractiveCta: (p, to, input) =>
      sendMessage(p, to, {
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: input.body },
          action: { name: 'cta_url', parameters: { display_text: input.displayText, url: input.url } },
        },
      }),
    sendReaction: (p, to, messageId, emoji) => sendMessage(p, to, { type: 'reaction', reaction: { message_id: messageId, emoji } }),
    markAsRead: ok,
    uploadMedia: async () => ({ id: fakeId('mockmedia') }),
    getMediaUrl: async (mediaId) => ({
      id: mediaId,
      url: 'https://example.invalid/mock-media',
      mime_type: 'application/octet-stream',
      sha256: '',
      file_size: 0,
      messaging_product: 'whatsapp',
    }),
    downloadMedia: async () => new ArrayBuffer(0),
    createTemplate: async (_wabaId, input) => ({ id: fakeId('9'), status: 'PENDING', category: input.category }),
    listAllTemplates: async () => [],
    getTemplateStatus: async (id) => ({ id, name: 'mock', language: 'en', status: 'APPROVED', category: 'UTILITY' }),
    editTemplate: ok,
    deleteTemplate: ok,
    uploadTemplateExample: async () => fakeId('4:mockhandle'),
    registerPhoneNumber: ok,
    requestVerificationCode: ok,
    verifyPhoneNumber: ok,
    updatePhoneProfile: ok,
    getPhoneProfile: async () => ({}),
    getPhoneQuality: async () => ({
      qualityRating: 'GREEN',
      messagingLimitTier: 'TIER_1K',
      throughputLevel: 'STANDARD',
      status: 'CONNECTED',
      nameStatus: 'APPROVED',
    }),
    getPhoneNumber: async (id) => ({ id, display_phone_number: '+92 300 0000000', verified_name: 'Demo Store' }),
    listWabaPhoneNumbers: async () => [],
    requestDisplayNameChange: ok,
    getWaba: async (id) => ({ id, name: 'Demo WABA' }),
    subscribeApp: ok,
    unsubscribeApp: ok,
  };
}
