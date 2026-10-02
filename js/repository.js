/*
 * repository.js  (Data layer)
 * Stores pass requests. Two interchangeable implementations share one interface:
 *   add(request), get(id), all(), update(id, changes), findByCode(code), clear()
 * - createMemoryRepository(): used by the automated tests (a fake data source).
 * - createLocalStorageRepository(): used by the live page so data survives a role switch.
 */
(function (root) {
  const CVP = (root.CVP = root.CVP || {});

  function createMemoryRepository(seed) {
    let items = Array.isArray(seed) ? seed.map((r) => ({ ...r })) : [];
    return {
      add(request) { items.push({ ...request }); return { ...request }; },
      get(id) { const r = items.find((x) => x.id === id); return r ? { ...r } : null; },
      all() { return items.map((r) => ({ ...r })); },
      update(id, changes) {
        const i = items.findIndex((x) => x.id === id);
        if (i === -1) return null;
        items[i] = { ...items[i], ...changes };
        return { ...items[i] };
      },
      findByCode(code) { const r = items.find((x) => x.passCode === code); return r ? { ...r } : null; },
      clear() { items = []; },
    };
  }

  function createLocalStorageRepository(storage, key) {
    const KEY = key || "cvp.requests.v1";
    const read = () => {
      try { return JSON.parse(storage.getItem(KEY)) || []; } catch (e) { return []; }
    };
    const write = (items) => {
      try { storage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* storage full or blocked */ }
    };
    return {
      add(request) { const items = read(); items.push({ ...request }); write(items); return { ...request }; },
      get(id) { return read().find((x) => x.id === id) || null; },
      all() { return read(); },
      update(id, changes) {
        const items = read();
        const i = items.findIndex((x) => x.id === id);
        if (i === -1) return null;
        items[i] = { ...items[i], ...changes };
        write(items);
        return { ...items[i] };
      },
      findByCode(code) { return read().find((x) => x.passCode === code) || null; },
      clear() { write([]); },
    };
  }

  CVP.createMemoryRepository = createMemoryRepository;
  CVP.createLocalStorageRepository = createLocalStorageRepository;
  if (typeof module !== "undefined" && module.exports) module.exports = CVP;
})(typeof globalThis !== "undefined" ? globalThis : this);
