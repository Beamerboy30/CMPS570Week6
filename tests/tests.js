/*
 * tests.js  Automated tests for the Campus Visitor Pass.
 * Testability tactics used:
 *   - Fake data source: an in-memory repository, so no real visitor data is ever needed.
 *   - Test doubles: a fixed clock and a predictable pass-code generator.
 *   - The API layer is tested directly, with no page or browser clicks.
 * Run in a browser with tests/tests.html, or from a terminal with: node tests/run-node.js
 */
(function (root) {
  const CVP = root.CVP;
  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || "assertion failed"); };

  // Build a fresh system with test doubles for every test.
  function setup() {
    const fixedNow = () => new Date("2026-10-05T09:00:00");
    let codeCounter = 0, idCounter = 0;
    const repo = CVP.createMemoryRepository();
    const service = CVP.createPassService({
      repo,
      now: fixedNow,
      newCode: () => "TEST-000" + ++codeCounter,
      newId: () => "REQ-" + ++idCounter,
    });
    const api = CVP.createApi(service, { now: fixedNow });
    return { repo, service, api };
  }
  const goodRequest = { name: "Amina Bello", date: "2026-10-05", host: "Library" };

  test("Visitor can submit a valid request", () => {
    const { api } = setup();
    const res = api.handle("visitor", "submitRequest", goodRequest);
    assert(res.status === 200 && res.body.ok, "expected success");
    assert(res.body.request.status === "pending", "new request should be pending");
  });

  test("Empty name is rejected with a clear message", () => {
    const { api } = setup();
    const res = api.handle("visitor", "submitRequest", { ...goodRequest, name: "" });
    assert(res.status === 422, "expected 422");
    assert(res.body.errors.includes("Please enter your full name."), "expected name message");
  });

  test("Script injection in the name is rejected", () => {
    const { api } = setup();
    const res = api.handle("visitor", "submitRequest", { ...goodRequest, name: "<script>alert(1)</script>" });
    assert(res.status === 422, "expected the input to be rejected");
  });

  test("A visit date in the past is rejected", () => {
    const { api } = setup();
    const res = api.handle("visitor", "submitRequest", { ...goodRequest, date: "2026-10-01" });
    assert(res.status === 422 && res.body.errors.some((e) => e.includes("past")), "expected past-date error");
  });

  test("A host that is not on the list is rejected", () => {
    const { api } = setup();
    const res = api.handle("visitor", "submitRequest", { ...goodRequest, host: "Someone Random" });
    assert(res.status === 422, "expected unknown host to be rejected");
  });

  test("SECURITY: a visitor cannot approve a request (403)", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    const res = api.handle("visitor", "approve", { id });
    assert(res.status === 403, "visitor approval must be forbidden");
  });

  test("SECURITY: a guard cannot approve a request (403)", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    assert(api.handle("guard", "approve", { id }).status === 403, "guard approval must be forbidden");
  });

  test("SECURITY: a visitor cannot list other people's requests (403)", () => {
    const { api } = setup();
    assert(api.handle("visitor", "listPending").status === 403, "visitor must not see the pending list");
  });

  test("Host approval creates a pass code that the guard sees as valid", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    const approved = api.handle("host", "approve", { id });
    assert(approved.status === 200 && approved.body.request.passCode === "TEST-0001", "expected pass code");
    const check = api.handle("guard", "verifyPass", { code: "TEST-0001" });
    assert(check.body.valid === true, "guard should see valid");
  });

  test("Visitor can look up their own request and see the code once approved", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    assert(api.handle("visitor", "checkStatus", { id }).body.request.passCode === null, "no code before approval");
    api.handle("host", "approve", { id });
    assert(api.handle("visitor", "checkStatus", { id }).body.request.passCode === "TEST-0001", "code after approval");
  });

  test("An unknown pass code is invalid", () => {
    const { api } = setup();
    assert(api.handle("guard", "verifyPass", { code: "ZZZZ-9999" }).body.valid === false, "expected invalid");
  });

  test("A denied request never gets a pass code", () => {
    const { api, repo } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    api.handle("host", "deny", { id });
    assert(repo.get(id).passCode === null, "denied request must have no code");
  });

  test("A request cannot be approved twice", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    api.handle("host", "approve", { id });
    assert(api.handle("host", "approve", { id }).status === 422, "second approval should be rejected");
  });

  test("A pass for another day is invalid at the gate", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", { ...goodRequest, date: "2026-10-07" }).body.request.id;
    api.handle("host", "approve", { id });
    assert(api.handle("guard", "verifyPass", { code: "TEST-0001" }).body.valid === false, "future pass must be invalid today");
  });

  test("SECURITY: the guard only sees a first name and date (limit exposure)", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    api.handle("host", "approve", { id });
    const body = api.handle("guard", "verifyPass", { code: "TEST-0001" }).body;
    assert(body.visitor === "Amina" && body.host === undefined && body.name === undefined, "guard saw too much data");
  });

  test("AUDIT: denied attempts are recorded without personal data", () => {
    const { api } = setup();
    const id = api.handle("visitor", "submitRequest", goodRequest).body.request.id;
    api.handle("visitor", "approve", { id });
    const log = api.handle("host", "auditLog").body;
    const entry = log.find((e) => e.action === "approve" && e.role === "visitor");
    assert(entry && entry.outcome.includes("403"), "denied attempt missing from audit log");
    assert(!JSON.stringify(log).includes("Amina"), "audit log must not contain visitor names");
  });

  function run(report) {
    let passed = 0;
    const results = tests.map(({ name, fn }) => {
      try { fn(); passed++; return { name, ok: true }; }
      catch (e) { return { name, ok: false, error: e.message }; }
    });
    if (report) report(results, passed, tests.length);
    return { results, passed, total: tests.length };
  }

  CVP.runTests = run;
  if (typeof module !== "undefined" && module.exports) module.exports = { run };
})(typeof globalThis !== "undefined" ? globalThis : this);
