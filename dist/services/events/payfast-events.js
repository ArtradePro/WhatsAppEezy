"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payFastEventEmitter = exports.PayFastEventEmitter = void 0;
const events_1 = require("events");
class PayFastEventEmitter extends events_1.EventEmitter {
    emitOrderPaid(event) {
        return this.emit('ORDER_PAID', event);
    }
    onOrderPaid(listener) {
        return this.on('ORDER_PAID', listener);
    }
}
exports.PayFastEventEmitter = PayFastEventEmitter;
exports.payFastEventEmitter = new PayFastEventEmitter();
//# sourceMappingURL=payfast-events.js.map