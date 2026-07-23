"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ANNUAL_RATE_PA = exports.DEFAULT_MARGIN_PA = exports.PRIME_RATE_PA = void 0;
exports.roundCents = roundCents;
exports.monthlyRate = monthlyRate;
exports.monthlyInterest = monthlyInterest;
exports.PRIME_RATE_PA = 10.5;
exports.DEFAULT_MARGIN_PA = 8;
exports.DEFAULT_ANNUAL_RATE_PA = exports.PRIME_RATE_PA + exports.DEFAULT_MARGIN_PA;
function roundCents(value) {
    return Math.round(value * 100) / 100;
}
function monthlyRate(annualRatePct) {
    return annualRatePct / 100 / 12;
}
function monthlyInterest(balance, annualRatePct) {
    return roundCents(balance * monthlyRate(annualRatePct));
}
//# sourceMappingURL=interest.js.map