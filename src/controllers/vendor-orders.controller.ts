import { FastifyRequest, FastifyReply } from 'fastify';
import { postgresOrderRepository } from '../database/postgres-order.repository';
import { postgresVendorRepository } from '../database/postgres-vendor.repository';
import { whatsAppClientService } from '../services/whatsapp/whatsapp-client.service';
import { appointmentEngineService } from '../services/booking/appointment-engine.service';
import { DbOrderStatus } from '../types/database.types';

export class VendorOrdersController {
  /**
   * GET /api/vendor/orders
   * Retrieves active orders for the vendor dashboard
   */
  async listOrders(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = (req.query || {}) as { vendor_id?: string };
    const orders = await postgresOrderRepository.findAllOrders(query.vendor_id);

    reply.status(200).send({
      success: true,
      count: orders.length,
      orders,
    });
  }

  /**
   * PATCH /api/vendor/orders/:id/status
   * Transitions an order status ('dispatched' | 'delivered') and triggers WhatsApp alert to customer
   */
  async updateStatus(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as {
      status?: DbOrderStatus;
      eta_minutes?: number;
      driver_name?: string;
      vehicle_reg?: string;
    };

    const nextStatus = body.status;
    if (!nextStatus || !['paid', 'dispatched', 'delivered', 'cancelled'].includes(nextStatus)) {
      reply.status(400).send({
        success: false,
        error: 'BadRequest',
        message: 'Invalid or missing status transition value',
      });
      return;
    }

    let order = await postgresOrderRepository.findById(id);
    if (!order) {
      order = await postgresOrderRepository.findByOrderRef(id);
    }

    if (!order) {
      reply.status(404).send({
        success: false,
        error: 'OrderNotFound',
        message: `Order '${id}' not found`,
      });
      return;
    }

    const updatedOrder = await postgresOrderRepository.updateOrderStatus(order.id, nextStatus);

    // Send real-time WhatsApp notification to customer
    let whatsappMessageId: string | undefined;
    if (order.customer_phone) {
      const etaText = body.eta_minutes ? ` Estimated arrival: ~${body.eta_minutes} mins.` : '';
      const driverText = body.driver_name ? ` Driver: ${body.driver_name}.` : '';
      if (nextStatus === 'dispatched') {
        whatsappMessageId = await whatsAppClientService.sendTextMessage(
          order.customer_phone,
          `🚚 Your order (*#${order.order_ref}*) is on the truck and out for site delivery! Driver is en route.${etaText}${driverText}`
        );
      } else if (nextStatus === 'delivered') {
        whatsappMessageId = await whatsAppClientService.sendTextMessage(
          order.customer_phone,
          `✅ Delivery completed for *#${order.order_ref}*. Please inspect materials and let us know if everything is in order.`
        );
      }
    }

    reply.status(200).send({
      success: true,
      order: updatedOrder,
      whatsappMessageId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * POST /api/vendor/orders/:id/eta
   * Sends a live WhatsApp ETA & tracking update to the customer
   */
  async sendEtaNotification(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as {
      eta_minutes?: number;
      driver_name?: string;
      vehicle_reg?: string;
      note?: string;
    };

    let order = await postgresOrderRepository.findById(id);
    if (!order) {
      order = await postgresOrderRepository.findByOrderRef(id);
    }

    if (!order) {
      reply.status(404).send({
        success: false,
        error: 'OrderNotFound',
        message: `Order '${id}' not found`,
      });
      return;
    }

    const etaMinutes = body.eta_minutes || 15;
    const driverInfo = body.driver_name ? `\n👷 *Driver:* ${body.driver_name}` : '';
    const vehicleInfo = body.vehicle_reg ? ` (${body.vehicle_reg})` : '';
    const customNote = body.note ? `\n📝 *Note:* ${body.note}` : '';

    const messageText =
      `📍 *Live Delivery Tracking (#${order.order_ref})*\n\n` +
      `⏱️ *Estimated Arrival:* ~${etaMinutes} minutes\n` +
      `📌 *Destination:* ${order.delivery_address}` +
      `${driverInfo}${vehicleInfo}${customNote}\n\n` +
      `Please ensure site access is clear for offloading.`;

    const messageId = await whatsAppClientService.sendTextMessage(
      order.customer_phone,
      messageText
    );

    reply.status(200).send({
      success: true,
      orderId: order.id,
      orderRef: order.order_ref,
      customerPhone: order.customer_phone,
      etaMinutes,
      whatsappMessageId: messageId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * GET /api/v1/appointments
   * Lists service booking appointments (optionally scoped by vendor_id)
   */
  async listAppointments(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = (req.query || {}) as { vendor_id?: string };
    const appointments = await appointmentEngineService.getAllVendorAppointments(query.vendor_id);

    reply.status(200).send({
      success: true,
      count: appointments.length,
      appointments,
    });
  }

  /**
   * POST /api/v1/appointments/:id/remind
   * Dispatches a 24h or 1h WhatsApp appointment reminder to a service_booking customer
   */
  async sendAppointmentReminder(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as { window?: '24h' | '1h' };

    const appt = await appointmentEngineService.findById(id);
    if (!appt) {
      reply.status(404).send({
        success: false,
        error: 'AppointmentNotFound',
        message: `Appointment '${id}' not found`,
      });
      return;
    }

    const vendor = await postgresVendorRepository.findById(appt.vendor_id);
    const windowLabel = body.window === '24h' ? '24 hours' : '1 hour';
    const messageText =
      `🔔 *Appointment Reminder (${vendor?.business_name || 'Service Studio'})*\n\n` +
      `Hi ${appt.customer_name || 'Valued Client'}, your scheduled appointment starts in *${windowLabel}*:\n` +
      `🗓️ *Start:* ${appt.scheduled_start}\n` +
      `✅ *Status:* ${appt.status.toUpperCase()}\n\n` +
      `Reply to this chat if you need assistance.`;

    const whatsappMessageId = await whatsAppClientService.sendTextMessage(
      appt.customer_phone,
      messageText
    );

    reply.status(200).send({
      success: true,
      appointmentId: appt.id,
      customerPhone: appt.customer_phone,
      window: body.window || '1h',
      whatsappMessageId,
      timestamp: new Date().toISOString(),
    });
  }
}

export const vendorOrdersController = new VendorOrdersController();
