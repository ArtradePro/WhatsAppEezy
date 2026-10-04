import axios from 'axios';
import { config } from '../../config/env';

export class WhatsAppClientService {
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly isConfigured: boolean;
  private runtimeGupshupApiKey: string = '';
  private runtimeGupshupAppId: string = '';
  public lastOutboundResult: Record<string, any> | null = null;

  constructor() {
    this.baseUrl = config.META_GRAPH_BASE_URL;
    this.version = config.META_GRAPH_API_VERSION;
    this.phoneNumberId = config.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = config.WHATSAPP_ACCESS_TOKEN;
    this.runtimeGupshupApiKey = config.GUPSHUP_API_KEY || '';
    this.runtimeGupshupAppId = config.GUPSHUP_APP_ID || 'd4f0052b-a102-49f2-bf53-c737349628ee';

    this.isConfigured =
      Boolean(this.accessToken) &&
      this.accessToken !== 'mock-whatsapp-access-token' &&
      Boolean(this.phoneNumberId) &&
      this.phoneNumberId !== 'mock-phone-number-id';
  }

  public configureGupshup(apiKey: string, appId?: string): void {
    this.runtimeGupshupApiKey = apiKey.trim();
    config.GUPSHUP_API_KEY = this.runtimeGupshupApiKey;
    if (appId) {
      this.runtimeGupshupAppId = appId.trim();
      config.GUPSHUP_APP_ID = this.runtimeGupshupAppId;
    }
  }

  /**
   * Sends a plain text WhatsApp message
   */
  async sendTextMessage(to: string, body: string): Promise<string> {
    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body },
    });
  }

  /**
   * Sends an interactive button message
   */
  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<string> {
    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  /**
   * Sends an interactive list message (e.g. for catalog category browsing)
   */
  async sendInteractiveList(
    to: string,
    headerText: string,
    bodyText: string,
    buttonTitle: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>
  ): Promise<string> {
    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        footer: { text: 'CargoDash WhatsApp Commerce' },
        action: {
          button: buttonTitle,
          sections,
        },
      },
    });
  }

  /**
   * Sends the Cape Aggregator Supplies "Direct Yard Delivery" category list
   */
  async sendDirectYardDeliveryCategories(to: string): Promise<string> {
    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: 'Direct Yard Delivery',
        },
        body: {
          text: 'Welcome to Cape Aggregator Supplies. Select a building material category below to browse verified yard inventory and instant contractor pricing.',
        },
        footer: {
          text: 'Guaranteed Next-Day Site Delivery',
        },
        action: {
          button: 'Browse Categories',
          sections: [
            {
              title: 'Aggregates & Masonry',
              rows: [
                {
                  id: 'cat_sand_stone',
                  title: 'Plaster & Building Sand',
                  description: 'Per m³ or 6m³ / 10m³ bulk tipper loads',
                },
                {
                  id: 'cat_bricks_blocks',
                  title: 'Bricks & Pavers',
                  description: 'Cement stock, maxi bricks & bevel pavers',
                },
              ],
            },
            {
              title: 'Structural & Openings',
              rows: [
                {
                  id: 'cat_cement',
                  title: 'Bulk Cement',
                  description: '32.5R & 42.5N bags or pallet loads',
                },
                {
                  id: 'cat_aluminium',
                  title: 'Aluminium Windows',
                  description: 'Pre-glazed standard top hung & sliding units',
                },
              ],
            },
          ],
        },
      },
    });
  }

  /**
   * Sends a native WhatsApp interactive location request message
   */
  async sendLocationRequestMessage(to: string, customBodyText?: string): Promise<string> {
    const text =
      customBodyText ||
      'To calculate accurate delivery fees and direct tipper transport from our nearest yard, please share your site location using the button below:';

    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: {
          text,
        },
        action: {
          name: 'send_location',
        },
      },
    });
  }

  /**
   * Sends the official Order Quote interactive button message
   */
  async sendOrderQuoteInteractiveButtons(
    to: string,
    orderRef: string,
    quoteDetails: {
      deliveryAddress: string;
      distanceKm: number;
      yardName?: string;
      materialsSummary: string;
      deliverySummary: string;
      totalFormatted: string;
    }
  ): Promise<string> {
    const yard = quoteDetails.yardName || 'Fonsi-Colquake Yard';
    const bodyText =
      `📍 *Site Destination:* ${quoteDetails.deliveryAddress}\n` +
      `🚚 *Distance:* ${quoteDetails.distanceKm} km from ${yard}\n\n` +
      `*Materials:*\n${quoteDetails.materialsSummary}\n\n` +
      `*Delivery & Handling:*\n${quoteDetails.deliverySummary}\n\n` +
      `*Total Amount Due:* *${quoteDetails.totalFormatted}* (Incl. VAT)\n\n` +
      `Select an option below to proceed:`;

    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: `Order Quote: #${orderRef}`,
        },
        body: {
          text: bodyText,
        },
        footer: {
          text: 'Quote valid for 24 hours',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'btn_pay_now',
                title: 'Accept & Pay (Instant)',
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'btn_modify_qty',
                title: 'Change Quantity',
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'btn_cancel_quote',
                title: 'Cancel Order',
              },
            },
          ],
        },
      },
    });
  }

  /**
   * Sends an interactive message when the customer's delivery pin exceeds the vendor's maximum operating zone
   */
  async sendOutOfDeliveryZoneButtons(
    to: string,
    details: {
      addressName: string;
      distanceKm: number;
      maxRadiusKm: number;
      yardName?: string;
    }
  ): Promise<string> {
    const yard = details.yardName || 'our nearest supply yard';
    const bodyText =
      `📍 *Your Location:* ${details.addressName}\n` +
      `📏 *Straight-Line Distance:* ${details.distanceKm} km from ${yard}\n\n` +
      `⚠️ *Exceeds Operating Radius:* Our direct tipper delivery zone is limited to *${details.maxRadiusKm} km* to ensure timely offloading and standard haulage rates.\n\n` +
      `You can share an alternate delivery pin closer to the yard, or connect with our logistics desk for custom long-distance dispatch:`;

    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: '⚠️ Out of Delivery Zone',
        },
        body: {
          text: bodyText,
        },
        footer: {
          text: 'Yard Delivery Radius Exceeded',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'btn_change_location',
                title: '📍 Send New Location',
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'btn_speak_agent',
                title: '💬 Speak to Agent',
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'btn_cancel_quote',
                title: '❌ Cancel Order',
              },
            },
          ],
        },
      },
    });
  }

  /**
   * Sends an interactive CTA URL checkout button
   */
  async sendCheckoutCtaButton(
    to: string,
    orderId: string,
    totalFormatted: string,
    checkoutUrl: string
  ): Promise<string> {
    const cleanOrderId = orderId.replace(/^#/, '');
    const bodyText = `Your order *#${cleanOrderId}* has been reserved. Complete payment via PayFast using Card, Capitec Pay, or Instant EFT.\n\nOnce paid, your delivery ticket is automatically generated for site dispatch.`;

    return this.sendPayload(to, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        header: {
          type: 'text',
          text: 'Secure Payment Ready',
        },
        body: {
          text: bodyText,
        },
        footer: {
          text: 'Secured by PayFast Engine',
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: `Pay ${totalFormatted} Now`,
            url: checkoutUrl,
          },
        },
      },
    });
  }

  /**
   * Sends the official Vendor Dispatch Ticket interactive button message
   */
  async sendVendorDispatchNotification(
    vendorPhone: string,
    orderRef: string,
    details: {
      customerName: string;
      customerPhone: string;
      siteAddress: string;
      itemsToLoad: string;
      netPayoutFormatted: string;
      commissionRatePct?: number;
    }
  ): Promise<string> {
    const cleanRef = orderRef.replace(/^#/, '');
    const commissionPct = details.commissionRatePct || 8;
    const bodyText =
      `*Customer:* ${details.customerName} (${details.customerPhone})\n` +
      `*Site Address:* ${details.siteAddress}\n` +
      `*Items to Load:*\n${details.itemsToLoad}\n\n` +
      `*Payout Allocated:* ${details.netPayoutFormatted} (Net of ${commissionPct}% platform fee)\nPayment verified via PayFast.`;

    return this.sendPayload(vendorPhone, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: vendorPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: `🚨 NEW PAID DISPATCH: #${cleanRef}`,
        },
        body: {
          text: bodyText,
        },
        footer: {
          text: 'Update delivery status below',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'dispatch_loaded',
                title: 'Truck Dispatched',
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'dispatch_delivered',
                title: 'Delivered to Site',
              },
            },
          ],
        },
      },
    });
  }

  /**
   * Sends interactive message to vendor with enhanced image preview and approval buttons:
   * [publish_listing_{product_id}] "Approve & Publish"
   * [edit_price_{product_id}] "Edit Price / Text"
   * [discard_{product_id}] "Discard"
   */
  async sendProductDraftInteractivePreview(
    vendorPhone: string,
    draft: {
      productId: string;
      title: string;
      unitPrice: number;
      unitOfMeasure: string;
      description: string;
      enhancedImageUrl: string;
    }
  ): Promise<string> {
    const cleanPhone = vendorPhone.startsWith('+') ? vendorPhone : `+${vendorPhone}`;
    const formattedPrice = Number.isInteger(draft.unitPrice)
      ? `${draft.unitPrice}`
      : draft.unitPrice.toFixed(2);
    const bodyText =
      `📦 *Listing Preview:*\n` +
      `*${draft.title}*\n` +
      `💰 Price: R${formattedPrice} ${draft.unitOfMeasure}\n` +
      `📝 Specs: ${draft.description}\n\n` +
      `Review the enhanced card above. Tap an option below to confirm or edit:`;

    return this.sendPayload(cleanPhone, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'image',
          image: {
            link: draft.enhancedImageUrl,
          },
        },
        body: {
          text: bodyText,
        },
        footer: {
          text: 'CargoDash Verified Catalog Sync',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `publish_listing_${draft.productId}`,
                title: 'Approve & Publish',
              },
            },
            {
              type: 'reply',
              reply: {
                id: `edit_price_${draft.productId}`,
                title: 'Edit Price / Text',
              },
            },
            {
              type: 'reply',
              reply: {
                id: `discard_${draft.productId}`,
                title: 'Discard',
              },
            },
          ],
        },
      },
    });
  }

  /**
   * Low-level payload dispatcher (Supports both Gupshup API & Meta Graph Cloud API)
   */
  private async sendPayload(to: string, payload: Record<string, any>): Promise<string> {
    const cleanDestination = to.replace(/^\+/, '');

    // 1. If Gupshup API Key / Customer App Token is configured, dispatch via Gupshup API
    const gupshupKey = this.runtimeGupshupApiKey || config.GUPSHUP_API_KEY;
    if (gupshupKey) {
      const bodyText =
        payload?.text?.body ||
        payload?.interactive?.body?.text ||
        'Welcome to WhatsAppEezy! Reply 1 to browse our catalog.';
      const formData = new URLSearchParams();
      formData.append('channel', 'whatsapp');
      formData.append('source', (config.GUPSHUP_SOURCE_NUMBER || '917834811114').replace(/^\+/, ''));
      formData.append('destination', cleanDestination);
      formData.append('src.name', config.GUPSHUP_APP_NAME || 'WhatsAppEezy');
      formData.append('message', JSON.stringify({ type: 'text', text: bodyText }));

      try {
        const response = await axios.post('https://api.gupshup.io/wa/api/v1/msg', formData.toString(), {
          headers: {
            apikey: gupshupKey,
            Authorization: gupshupKey.startsWith('Bearer ') ? gupshupKey : `Bearer ${gupshupKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        this.lastOutboundResult = {
          ok: true,
          provider: 'gupshup-v1',
          to: cleanDestination,
          status: response.status,
          data: response.data,
          at: new Date().toISOString(),
        };
        return response.data?.messageId || `gup_${Date.now()}`;
      } catch (err: any) {
        this.lastOutboundResult = {
          ok: false,
          provider: 'gupshup-v1',
          to: cleanDestination,
          error: err?.response?.data || err.message,
          at: new Date().toISOString(),
        };
        console.error(`Failed to send Gupshup WhatsApp message to ${to}:`, err?.response?.data || err.message);
        return `gup.fallback_${Date.now()}`;
      }
    }

    // 2. Fallback to Mock Mode or Direct Meta Cloud API
    if (!this.isConfigured || config.MOCK_EXTERNAL_APIS) {
      const mockMsgId = `wamid.HBgL${Date.now()}`;
      return mockMsgId;
    }

    try {
      const url = `${this.baseUrl}/${this.version}/${this.phoneNumberId}/messages`;
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data?.messages?.[0]?.id || `wamid.${Date.now()}`;
    } catch (err: any) {
      console.error(`Failed to send WhatsApp message to ${to}:`, err?.response?.data || err.message);
      return `wamid.fallback_${Date.now()}`;
    }
  }
}

export const whatsAppClientService = new WhatsAppClientService();
