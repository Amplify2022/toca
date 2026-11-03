/* Durable request keys survive a timeout/reload; only verified dispatch is success. */
(function (root, factory) {
  const create = factory();
  if (typeof module === 'object' && module.exports) module.exports = create;
  else root.createTocaRequestSync = create;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  return function createTocaRequestSync({api, storage, customerId, bearer, makeId}) {
    const keyFor = (venueId, trackId) => `toca:request:${customerId()}:${venueId}:${trackId}`;
    const terminal = status => status === 'DISPATCHED' || status === 'FAILED';
    function read(key) {
      try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
    }
    function remember(key, value, result) {
      if (terminal(result.status)) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify({...value, commandId: result.commandId || value.commandId}));
      return result;
    }
    return {
      async submit(venueId, trackId, body) {
        const key = keyFor(venueId, trackId);
        const value = read(key) || {idempotencyKey: makeId()};
        storage.setItem(key, JSON.stringify(value));
        const result = value.commandId
          ? await api(`/api/customers/me/request-commands/${encodeURIComponent(value.commandId)}`,
              {headers: {Authorization: bearer()}})
          : await api(`/api/venues/${encodeURIComponent(venueId)}/requests`, {
              method: 'POST', headers: {'Idempotency-Key': value.idempotencyKey}, body
            });
        return remember(key, value, result);
      },
      async refresh(venueId, trackId, commandId) {
        const key = keyFor(venueId, trackId);
        const value = read(key) || {commandId};
        const result = await api(`/api/customers/me/request-commands/${encodeURIComponent(commandId)}`,
          {headers: {Authorization: bearer()}});
        return remember(key, value, result);
      }
    };
  };
});
