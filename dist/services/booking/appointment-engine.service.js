"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appointmentEngineService = exports.AppointmentEngineService = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../../database/db");
class AppointmentEngineService {
    schedules = new Map();
    appointments = new Map();
    holdTimers = new Map();
    static DEFAULT_HOLD_MINUTES = 10;
    constructor() {
        this.seedDefaultSchedules();
    }
    seedDefaultSchedules() {
        const auraLuxeVendorId = 'c2ddde77-7c2b-4ef8-994d-4bb7bd160c33';
        const vendorSchedules = [];
        // Seed 7 days (0..6) 09:00 - 17:00, 60-min slots, max 1 concurrent booking per slot
        for (let day = 0; day <= 6; day++) {
            vendorSchedules.push({
                id: (0, crypto_1.randomUUID)(),
                vendor_id: auraLuxeVendorId,
                day_of_week: day,
                start_time: '09:00:00',
                end_time: '17:00:00',
                slot_duration_minutes: 60,
                max_concurrent_bookings: 1,
                created_at: new Date().toISOString(),
            });
        }
        this.schedules.set(auraLuxeVendorId, vendorSchedules);
    }
    /**
     * Configures or updates a vendor's operating schedule for a specific day of week (0-6)
     */
    async upsertServiceSchedule(schedule) {
        const record = {
            id: schedule.id || (0, crypto_1.randomUUID)(),
            vendor_id: schedule.vendor_id,
            day_of_week: schedule.day_of_week,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            slot_duration_minutes: schedule.slot_duration_minutes || 60,
            max_concurrent_bookings: schedule.max_concurrent_bookings || 1,
            created_at: new Date().toISOString(),
        };
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query(`INSERT INTO vendor_service_schedules (
            id, vendor_id, day_of_week, start_time, end_time, slot_duration_minutes, max_concurrent_bookings
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (vendor_id, day_of_week) DO UPDATE SET
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            slot_duration_minutes = EXCLUDED.slot_duration_minutes,
            max_concurrent_bookings = EXCLUDED.max_concurrent_bookings
          RETURNING *`, [
                    record.id,
                    record.vendor_id,
                    record.day_of_week,
                    record.start_time,
                    record.end_time,
                    record.slot_duration_minutes,
                    record.max_concurrent_bookings,
                ]);
                if (res.rows[0]) {
                    this.saveScheduleInMemory(res.rows[0]);
                    return res.rows[0];
                }
            }
            catch (err) {
                console.warn('[AppointmentEngine] DB upsertServiceSchedule fallback:', err);
            }
        }
        this.saveScheduleInMemory(record);
        return record;
    }
    saveScheduleInMemory(record) {
        const list = this.schedules.get(record.vendor_id) || [];
        const idx = list.findIndex((s) => s.day_of_week === record.day_of_week);
        if (idx >= 0) {
            list[idx] = record;
        }
        else {
            list.push(record);
        }
        this.schedules.set(record.vendor_id, list);
    }
    async getVendorSchedules(vendorId) {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query('SELECT * FROM vendor_service_schedules WHERE vendor_id = $1::uuid ORDER BY day_of_week ASC', [vendorId]);
                if (res.rows.length > 0)
                    return res.rows;
            }
            catch (err) {
                console.warn('[AppointmentEngine] getVendorSchedules fallback:', err);
            }
        }
        let existing = this.schedules.get(vendorId);
        if (!existing || existing.length === 0) {
            // Auto-initialize default 09:00-17:00 schedule for any service_booking vendor
            existing = [];
            for (let day = 0; day <= 6; day++) {
                existing.push({
                    id: (0, crypto_1.randomUUID)(),
                    vendor_id: vendorId,
                    day_of_week: day,
                    start_time: '09:00:00',
                    end_time: '17:00:00',
                    slot_duration_minutes: 60,
                    max_concurrent_bookings: 1,
                    created_at: new Date().toISOString(),
                });
            }
            this.schedules.set(vendorId, existing);
        }
        return existing;
    }
    /**
     * Releases any temporary 'hold' appointments whose 10-minute hold window has expired
     * without receiving a PayFast ITN confirmation.
     */
    async releaseExpiredHolds(referenceNow = new Date()) {
        const nowIso = referenceNow.toISOString();
        const released = [];
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query(`UPDATE appointments
           SET status = 'cancelled'
           WHERE status = 'hold'
             AND hold_expires_at IS NOT NULL
             AND hold_expires_at <= $1::timestamptz
           RETURNING *`, [nowIso]);
                if (res.rows.length > 0) {
                    released.push(...res.rows);
                }
            }
            catch (err) {
                console.warn('[AppointmentEngine] releaseExpiredHolds DB fallback:', err);
            }
        }
        for (const [id, appt] of this.appointments.entries()) {
            if (appt.status === 'hold' &&
                appt.hold_expires_at &&
                new Date(appt.hold_expires_at).getTime() <= referenceNow.getTime()) {
                appt.status = 'cancelled';
                this.appointments.set(id, { ...appt });
                this.clearHoldTimer(id);
                released.push(appt);
            }
        }
        return released;
    }
    /**
     * Queries real-time availability in `appointments` and returns the next `count` (default 3)
     * available slots for a service business.
     */
    async getNextAvailableSlots(vendorId, fromTime = new Date(), count = 3) {
        await this.releaseExpiredHolds(fromTime);
        const schedules = await this.getVendorSchedules(vendorId);
        const activeAppointments = await this.getActiveVendorAppointments(vendorId, fromTime);
        const availableSlots = [];
        const baseCursor = new Date(fromTime.getTime());
        baseCursor.setUTCMinutes(0, 0, 0);
        baseCursor.setUTCHours(baseCursor.getUTCHours() + 1);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Scan up to 14 days ahead to find the next N available slots
        for (let dayOffset = 0; dayOffset < 14 && availableSlots.length < count; dayOffset++) {
            const candidateDay = new Date(baseCursor.getTime() + dayOffset * 24 * 60 * 60 * 1000);
            const dayOfWeek = candidateDay.getUTCDay();
            const daySchedule = schedules.find((s) => s.day_of_week === dayOfWeek);
            if (!daySchedule)
                continue;
            const [startH, startM] = daySchedule.start_time.split(':').map((v) => parseInt(v, 10));
            const [endH, endM] = daySchedule.end_time.split(':').map((v) => parseInt(v, 10));
            const durationMs = daySchedule.slot_duration_minutes * 60 * 1000;
            const windowStart = new Date(candidateDay);
            windowStart.setUTCHours(startH, startM || 0, 0, 0);
            const windowEnd = new Date(candidateDay);
            windowEnd.setUTCHours(endH, endM || 0, 0, 0);
            for (let slotStartMs = windowStart.getTime(); slotStartMs + durationMs <= windowEnd.getTime() && availableSlots.length < count; slotStartMs += durationMs) {
                if (slotStartMs < fromTime.getTime())
                    continue;
                const slotEndMs = slotStartMs + durationMs;
                const overlappingCount = activeAppointments.filter((a) => {
                    const aStart = new Date(a.scheduled_start).getTime();
                    const aEnd = new Date(a.scheduled_end).getTime();
                    return aStart < slotEndMs && aEnd > slotStartMs;
                }).length;
                if (overlappingCount < daySchedule.max_concurrent_bookings) {
                    const startObj = new Date(slotStartMs);
                    const endObj = new Date(slotEndMs);
                    const pad = (n) => String(n).padStart(2, '0');
                    const dayLabel = dayNames[startObj.getUTCDay()];
                    const dateLabel = `${pad(startObj.getUTCDate())}/${pad(startObj.getUTCMonth() + 1)}`;
                    const timeRange = `${pad(startObj.getUTCHours())}:${pad(startObj.getUTCMinutes())}-${pad(endObj.getUTCHours())}:${pad(endObj.getUTCMinutes())}`;
                    availableSlots.push({
                        slotId: `slot_${slotStartMs}`,
                        vendorId,
                        scheduledStart: startObj.toISOString(),
                        scheduledEnd: endObj.toISOString(),
                        durationMinutes: daySchedule.slot_duration_minutes,
                        remainingCapacity: daySchedule.max_concurrent_bookings - overlappingCount,
                        title: `${dayLabel} ${timeRange}`.slice(0, 24),
                        description: `${dateLabel} • ${daySchedule.slot_duration_minutes}m session (${daySchedule.max_concurrent_bookings - overlappingCount} open)`,
                    });
                }
            }
        }
        return availableSlots;
    }
    /**
     * Places a temporary 10-minute hold on a selected slot while generating the PayFast checkout link.
     * Automatically releases the hold if PayFast ITN is not received within the timeout window.
     */
    async placeTemporarySlotHold(input) {
        await this.releaseExpiredHolds();
        const schedules = await this.getVendorSchedules(input.vendorId);
        const startDate = new Date(input.scheduledStart);
        const daySchedule = schedules.find((s) => s.day_of_week === startDate.getUTCDay());
        const slotDurationMin = daySchedule?.slot_duration_minutes || 60;
        const maxConcurrent = daySchedule?.max_concurrent_bookings || 1;
        const endDate = input.scheduledEnd
            ? new Date(input.scheduledEnd)
            : new Date(startDate.getTime() + slotDurationMin * 60 * 1000);
        const activeAppointments = await this.getActiveVendorAppointments(input.vendorId);
        const overlapping = activeAppointments.filter((a) => {
            const aStart = new Date(a.scheduled_start).getTime();
            const aEnd = new Date(a.scheduled_end).getTime();
            return aStart < endDate.getTime() && aEnd > startDate.getTime();
        });
        if (overlapping.length >= maxConcurrent) {
            throw new Error(`Selected slot (${startDate.toISOString()}) is currently held or fully booked.`);
        }
        const holdMinutes = input.holdDurationMinutes ?? AppointmentEngineService.DEFAULT_HOLD_MINUTES;
        const holdExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();
        const appointment = {
            id: (0, crypto_1.randomUUID)(),
            vendor_id: input.vendorId,
            customer_phone: input.customerPhone,
            customer_name: input.customerName || 'Valued Client',
            service_product_id: input.serviceProductId,
            order_id: input.orderId,
            scheduled_start: startDate.toISOString(),
            scheduled_end: endDate.toISOString(),
            status: 'hold',
            hold_expires_at: holdExpiresAt,
            created_at: new Date().toISOString(),
        };
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query(`INSERT INTO appointments (
            id, vendor_id, customer_phone, customer_name, service_product_id, order_id,
            scheduled_start, scheduled_end, status, hold_expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'hold', $9)
          RETURNING *`, [
                    appointment.id,
                    appointment.vendor_id,
                    appointment.customer_phone,
                    appointment.customer_name,
                    appointment.service_product_id,
                    appointment.order_id || null,
                    appointment.scheduled_start,
                    appointment.scheduled_end,
                    appointment.hold_expires_at,
                ]);
                if (res.rows[0]) {
                    this.appointments.set(appointment.id, res.rows[0]);
                    this.scheduleAutoHoldExpiry(appointment.id, holdMinutes * 60 * 1000);
                    return res.rows[0];
                }
            }
            catch (err) {
                console.warn('[AppointmentEngine] placeTemporarySlotHold DB fallback:', err);
            }
        }
        this.appointments.set(appointment.id, appointment);
        this.scheduleAutoHoldExpiry(appointment.id, holdMinutes * 60 * 1000);
        return appointment;
    }
    scheduleAutoHoldExpiry(appointmentId, timeoutMs) {
        this.clearHoldTimer(appointmentId);
        const timer = setTimeout(async () => {
            const appt = this.appointments.get(appointmentId);
            if (appt && appt.status === 'hold') {
                await this.cancelAppointmentHold(appointmentId);
            }
        }, Math.min(timeoutMs, 2147483647));
        if (typeof timer.unref === 'function') {
            timer.unref();
        }
        this.holdTimers.set(appointmentId, timer);
    }
    clearHoldTimer(appointmentId) {
        const existing = this.holdTimers.get(appointmentId);
        if (existing) {
            clearTimeout(existing);
            this.holdTimers.delete(appointmentId);
        }
    }
    async attachOrderToAppointment(appointmentId, orderId) {
        const appt = this.appointments.get(appointmentId);
        if (appt) {
            appt.order_id = orderId;
            this.appointments.set(appointmentId, { ...appt });
        }
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                await pool.query('UPDATE appointments SET order_id = $2 WHERE id = $1::uuid', [
                    appointmentId,
                    orderId,
                ]);
            }
            catch {
                // Ignore fallback
            }
        }
        return appt || null;
    }
    /**
     * Confirms a held appointment when PayFast ITN is verified.
     */
    async confirmAppointmentPayment(identifier, pfPaymentId) {
        let target = null;
        if (identifier.appointmentId) {
            target = this.appointments.get(identifier.appointmentId) || null;
        }
        if (!target && identifier.orderId) {
            for (const appt of this.appointments.values()) {
                if (appt.order_id === identifier.orderId) {
                    target = appt;
                    break;
                }
            }
        }
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query(`UPDATE appointments
           SET status = 'confirmed',
               payfast_pf_payment_id = $3
           WHERE (id::text = $1 OR order_id::text = $2)
             AND status IN ('hold', 'confirmed')
           RETURNING *`, [identifier.appointmentId || '', identifier.orderId || '', pfPaymentId]);
                if (res.rows[0]) {
                    this.clearHoldTimer(res.rows[0].id);
                    this.appointments.set(res.rows[0].id, res.rows[0]);
                    return res.rows[0];
                }
            }
            catch (err) {
                console.warn('[AppointmentEngine] confirmAppointmentPayment DB fallback:', err);
            }
        }
        if (!target)
            return null;
        this.clearHoldTimer(target.id);
        target.status = 'confirmed';
        target.payfast_pf_payment_id = pfPaymentId;
        this.appointments.set(target.id, { ...target });
        return target;
    }
    async cancelAppointmentHold(appointmentId) {
        this.clearHoldTimer(appointmentId);
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1::uuid RETURNING *`, [appointmentId]);
                if (res.rows[0]) {
                    this.appointments.set(appointmentId, res.rows[0]);
                    return res.rows[0];
                }
            }
            catch {
                // Fallback
            }
        }
        const appt = this.appointments.get(appointmentId);
        if (!appt)
            return null;
        appt.status = 'cancelled';
        this.appointments.set(appointmentId, { ...appt });
        return appt;
    }
    async findById(appointmentId) {
        return this.appointments.get(appointmentId) || null;
    }
    async getActiveVendorAppointments(vendorId, referenceNow = new Date()) {
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query(`SELECT * FROM appointments
           WHERE vendor_id = $1::uuid
             AND (
               status = 'confirmed'
               OR (status = 'hold' AND (hold_expires_at IS NULL OR hold_expires_at > $2::timestamptz))
             )`, [vendorId, referenceNow.toISOString()]);
                if (res.rows.length > 0)
                    return res.rows;
            }
            catch {
                // Fallback to in-memory
            }
        }
        return Array.from(this.appointments.values()).filter((a) => {
            if (a.vendor_id !== vendorId)
                return false;
            if (a.status === 'confirmed')
                return true;
            if (a.status === 'hold') {
                if (!a.hold_expires_at)
                    return true;
                return new Date(a.hold_expires_at).getTime() > referenceNow.getTime();
            }
            return false;
        });
    }
    async completeAppointment(appointmentId) {
        this.clearHoldTimer(appointmentId);
        const pool = db_1.db.getPool();
        if (pool) {
            try {
                const res = await pool.query(`UPDATE appointments SET status = 'completed' WHERE id = $1::uuid RETURNING *`, [appointmentId]);
                if (res.rows[0]) {
                    this.appointments.set(appointmentId, res.rows[0]);
                    return res.rows[0];
                }
            }
            catch {
                // Fallback
            }
        }
        const appt = this.appointments.get(appointmentId);
        if (!appt)
            return null;
        appt.status = 'completed';
        this.appointments.set(appointmentId, { ...appt });
        return appt;
    }
    async getAllVendorAppointments(vendorId) {
        const all = Array.from(this.appointments.values());
        if (!vendorId)
            return all;
        return all.filter((a) => a.vendor_id === vendorId);
    }
}
exports.AppointmentEngineService = AppointmentEngineService;
exports.appointmentEngineService = new AppointmentEngineService();
//# sourceMappingURL=appointment-engine.service.js.map