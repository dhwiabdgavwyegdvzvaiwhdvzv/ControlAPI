

export const METHODS = {
  fps120: { tier: 'free' },
  hybrid60: { tier: 'premium' },
  tikquick720: { tier: 'premium' },
  smart: { tier: 'premium' }
};

export function isKnownMethod(method) {
  return typeof method === 'string' && Object.prototype.hasOwnProperty.call(METHODS, method);
}

export function isPremiumMethod(method) {
  return isKnownMethod(method) && METHODS[method].tier === 'premium';
}
