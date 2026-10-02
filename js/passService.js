/*
 * passService.js  (Business logic layer)
 * Holds the rules for visitor passes. It knows nothing about the page or about roles;
 * role checks happen one layer up, in api.js.
 *
 * Dependencies are injected so tests can replace them with test doubles:
 *   repo      - any repository from repository.js
 *   now()     - returns the current Date (tests use a fixed clock)
 *   newCode() - returns a pass code (tests use a predictable generator)
 *   newId()   - returns a request id
 */
(function (root) {
  const CVP = (root.CVP = root.CVP || {});

  const HOSTS = ["Admissions Office", "Registrar", "IT Services", "Library", "Student Affairs"];
  const NAME_PATTERN = /^[A-Za-z][A-Za-z .'-]{1,59}$/;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_DAYS_AHEAD = 30;
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to avoid misreading

  function toDateString(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function daysBetween(fromStr, toStr) {
    const a = new Date(fromStr + "T00:00:00");
    const b = new Date(toStr + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  function secureCode() {
    const bytes = new Uint32Array(8);
    root.crypto.getRandomValues(bytes);
    let s = "";
    for (let i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return s.slice(0, 4) + "-" + s.slice(4);
  }

  function secureId() {
    const bytes = new Uint32Array(2);
    root.crypto.getRandomValues(bytes);
    return "REQ-" + bytes[0].toString(36).toUpperCase().slice(0, 6);
  }

  // Input validation tactic: reject anything that does not match the expected shape.
  function validateRequest(input, today) {
    const errors = [];
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const date = typeof input.date === "string" ? input.date.trim() : "";
    const host = typeof input.host === "string" ? input.host.trim() : "";

    if (!name) errors.push("Please enter your full name.");
    else if (!NAME_PATTERN.test(name)) errors.push("Name can only use letters, spaces, hyphens, apostrophes and periods (2 to 60 characters).");

    if (!date) errors.push("Please choose a visit date.");
    else if (!DATE_PATTERN.test(date) || isNaN(new Date(date + "T00:00:00"))) errors.push("Visit date is not a valid date.");
    else {
      const diff = daysBetween(today, date);
      if (diff < 0) errors.push("Visit date cannot be in the past.");
      else if (diff > MAX_DAYS_AHEAD) errors.push(`Visits can only be booked up to ${MAX_DAYS_AHEAD} days ahead.`);
    }

    if (!host) errors.push("Please choose who you are visiting.");
    else if (!HOSTS.includes(host)) errors.push("Please choose a host from the list.");

    return { errors, clean: { name, date, host } };
  }

  function createPassService(deps) {
    const repo = deps.repo;
    const now = deps.now || (() => new Date());
    const newCode = deps.newCode || secureCode;
    const newId = deps.newId || secureId;

    return {
      hosts: () => HOSTS.slice(),

      submitRequest(input) {
        const today = toDateString(now());
        const { errors, clean } = validateRequest(input || {}, today);
        if (errors.length) return { ok: false, errors };
        const request = { id: newId(), ...clean, status: "pending", passCode: null, createdAt: now().toISOString() };
        repo.add(request);
        return { ok: true, request: { id: request.id, status: request.status } };
      },

      listPending() {
        return repo.all().filter((r) => r.status === "pending");
      },

      approve(id) {
        const r = repo.get(id);
        if (!r) return { ok: false, errors: ["Request not found."] };
        if (r.status !== "pending") return { ok: false, errors: [`Request is already ${r.status}.`] };
        const updated = repo.update(id, { status: "approved", passCode: newCode(), decidedAt: now().toISOString() });
        return { ok: true, request: updated };
      },

      deny(id) {
        const r = repo.get(id);
        if (!r) return { ok: false, errors: ["Request not found."] };
        if (r.status !== "pending") return { ok: false, errors: [`Request is already ${r.status}.`] };
        const updated = repo.update(id, { status: "denied", decidedAt: now().toISOString() });
        return { ok: true, request: updated };
      },

      // A visitor can check only the request whose id they were given (the id acts as a receipt).
      checkStatus(id) {
        const r = repo.get(String(id || "").trim().toUpperCase());
        if (!r) return { ok: false, errors: ["No request found with that reference."] };
        return { ok: true, request: { id: r.id, status: r.status, date: r.date, passCode: r.status === "approved" ? r.passCode : null } };
      },

      // Limit exposure tactic: the guard only learns valid/invalid, a first name and the date.
      verifyPass(rawCode) {
        const code = String(rawCode || "").trim().toUpperCase();
        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { valid: false, reason: "Code format should look like ABCD-2345." };
        const r = repo.findByCode(code);
        if (!r || r.status !== "approved") return { valid: false, reason: "No approved pass matches this code." };
        const today = toDateString(now());
        if (r.date !== today) return { valid: false, reason: `This pass is for ${r.date}, not today.` };
        return { valid: true, visitor: r.name.split(" ")[0], date: r.date };
      },
    };
  }

  CVP.createPassService = createPassService;
  CVP.toDateString = toDateString;
  CVP.HOSTS = HOSTS;
  if (typeof module !== "undefined" && module.exports) module.exports = CVP;
})(typeof globalThis !== "undefined" ? globalThis : this);
