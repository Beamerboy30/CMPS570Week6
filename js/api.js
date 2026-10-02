/*
 * api.js  (API boundary / trust boundary)
 * Every action from the page must pass through handle(role, action, payload).
 * In the full architecture this is the REST API on the server. In this one-page proof
 * it runs in the browser, but the rule is the same: the page never calls the service directly.
 *
 * Security tactics applied here:
 *   - Authorize actors: a permission table decides which role may call which action.
 *   - Audit: every call, allowed or denied, is written to the audit log (no personal data).
 */
(function (root) {
  const CVP = (root.CVP = root.CVP || {});

  const PERMISSIONS = {
    submitRequest: ["visitor"],
    checkStatus: ["visitor"],
    listPending: ["host"],
    approve: ["host"],
    deny: ["host"],
    verifyPass: ["guard"],
    auditLog: ["host"],
  };

  function createApi(service, deps) {
    const now = (deps && deps.now) || (() => new Date());
    const store = deps && deps.logStore; // optional: { load(), save(entries) } so the log survives a reload
    const log = store ? store.load() : [];

    function audit(role, action, outcome, ref) {
      log.push({ time: now().toISOString(), role, action, outcome, ref: ref || "" });
      if (log.length > 200) log.shift();
      if (store) store.save(log);
    }

    function handle(role, action, payload) {
      const allowed = PERMISSIONS[action];
      if (!allowed) {
        audit(role, action, "rejected: unknown action");
        return { status: 400, error: "Unknown action." };
      }
      if (!allowed.includes(role)) {
        audit(role, action, "DENIED (403)", payload && payload.id);
        return { status: 403, error: `Forbidden: the ${role} role is not allowed to ${action}.` };
      }

      let result;
      switch (action) {
        case "submitRequest": result = service.submitRequest(payload); break;
        case "checkStatus": result = service.checkStatus(payload && payload.id); break;
        case "listPending": result = { ok: true, items: service.listPending() }; break;
        case "approve": result = service.approve(payload && payload.id); break;
        case "deny": result = service.deny(payload && payload.id); break;
        case "verifyPass": result = service.verifyPass(payload && payload.code); break;
        case "auditLog": return { status: 200, body: log.slice().reverse() };
      }

      const failed = result && (result.ok === false);
      const ref = (result && result.request && result.request.id) || (payload && payload.id) || "";
      const outcome = action === "verifyPass" ? (result.valid ? "valid" : "invalid") : failed ? "rejected" : "ok";
      audit(role, action, outcome, ref);
      return { status: failed ? 422 : 200, body: result };
    }

    return { handle, permissions: () => JSON.parse(JSON.stringify(PERMISSIONS)) };
  }

  CVP.createApi = createApi;
  if (typeof module !== "undefined" && module.exports) module.exports = CVP;
})(typeof globalThis !== "undefined" ? globalThis : this);
