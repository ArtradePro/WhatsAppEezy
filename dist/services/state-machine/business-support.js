"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectSupportBusiness = selectSupportBusiness;
exports.higieneSupportReply = higieneSupportReply;
/** Shared-number support context; never changes the transport or order tenant. */
function selectSupportBusiness(text, previous = 'lcsh') {
    const product = /\bfungus\s*no\s*more\b|\bhigiene\b|\bhygienical\b|\bshower\s*gel\b|\bpomegranate\b|\bsea\s*breeze\b|\bcoconut\s+(?:antifungal\s+)?spray\b|#fungus\b/i.test(text);
    const construction = /\blcsh\b|\bla\s+cock\b|\bsmartspaces?\b|\bmodular\b|\brenovat\w*|\bconstruction\b|\bbuilding\b|\bhome\s+project\b|\b(?:wall|roof|bathroom)\s+(?:mould|mold|fungus)\b|\b(?:mould|mold|fungus)\b.*\b(?:wall|ceiling|roof)\b/i.test(text);
    if (product && construction)
        return 'clarify';
    if (construction)
        return 'lcsh';
    if (product)
        return 'higiene';
    return previous;
}
function higieneSupportReply(text) {
    const intro = 'Fungus No More is manufactured and marketed by Hygienical (Pty) Ltd T/A Higiene.';
    if (/ingredient|direction|how (?:do|to)|apply|safe|pregnan|child|allerg|reaction|cure|treat|diagnos/i.test(text)) {
        return intro + '\n\nPlease tell us which product you have. We need its approved label to confirm ingredients, directions and warnings. I cannot diagnose a condition or promise a cure. For a reaction or medical question, contact a healthcare professional. Product support: +27 74 704 3506.';
    }
    if (/price|cost|stock|deliver|shipping|order|buy|refund/i.test(text)) {
        return intro + '\n\nWhich product and quantity would you like help with? Current prices, stock, delivery and any order or refund need confirmation by the Higiene team. You can continue asking here or use the dedicated product contact: https://wa.me/27747043506';
    }
    return intro + '\n\nThe website lists Sea Breeze Shower Gel (500 ml), Pomegranate Shower Gel (500 ml), and Coconut Antifungal Spray (50 ml). Which product can I help with? You can continue here, or contact +27 74 704 3506. For a home project, type LCSH.';
}
//# sourceMappingURL=business-support.js.map