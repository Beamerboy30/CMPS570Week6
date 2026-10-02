/*
 * ui.js  (Presentation layer)
 * Talks ONLY to the API boundary (api.handle). It never touches the service or the data directly.
 * All user-supplied text is written with textContent, never innerHTML, so it cannot run as code.
 */
(function () {
  const CVP = window.CVP;

  let storage;
  try { storage = window.localStorage; storage.setItem("cvp.test", "1"); storage.removeItem("cvp.test"); }
  catch (e) { storage = null; }
  const repo = storage ? CVP.createLocalStorageRepository(storage) : CVP.createMemoryRepository();
  const service = CVP.createPassService({ repo });
  const LOG_KEY = "cvp.audit.v1";
  const logStore = storage ? {
    load: () => { try { return JSON.parse(storage.getItem(LOG_KEY)) || []; } catch (e) { return []; } },
    save: (entries) => { try { storage.setItem(LOG_KEY, JSON.stringify(entries)); } catch (e) {} },
  } : null;
  const api = CVP.createApi(service, { logStore });

  let role = "visitor";
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };

  const notes = {
    visitor: "You are a Visitor. You can request a pass and check your own request.",
    host: "You are a Host. Only hosts can approve or deny requests.",
    guard: "You are the Guard. Type a pass code to check it.",
  };

  function showMsg(target, kind, lines) {
    target.className = "msg " + kind;
    target.replaceChildren();
    (Array.isArray(lines) ? lines : [lines]).forEach((t) => target.appendChild(el("div", t)));
  }

  function setRole(next) {
    role = next;
    document.querySelectorAll(".roles button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.role === role)));
    ["visitor", "host", "guard"].forEach((r) => ($("panel-" + r).hidden = r !== role));
    $("roleNote").textContent = notes[role];
    if (role === "host") renderHost();
  }

  // ---------- Visitor ----------
  service.hosts().forEach((h) => $("vHost").appendChild(Object.assign(el("option", h), { value: h })));
  $("vDate").value = CVP.toDateString(new Date());

  $("requestForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const res = api.handle(role, "submitRequest", { name: $("vName").value, date: $("vDate").value, host: $("vHost").value });
    if (res.status === 200) {
      showMsg($("requestMsg"), "ok", [`Request sent. Your reference is ${res.body.request.id}.`, "Keep it to check whether your pass was approved."]);
      $("statusId").value = res.body.request.id;
      e.target.reset();
      $("vDate").value = CVP.toDateString(new Date());
    } else {
      showMsg($("requestMsg"), "err", res.body ? res.body.errors : res.error);
    }
  });

  $("statusForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const res = api.handle(role, "checkStatus", { id: $("statusId").value });
    if (res.status !== 200) return showMsg($("statusMsg"), "err", res.body ? res.body.errors : res.error);
    const r = res.body.request;
    if (r.status === "approved") showMsg($("statusMsg"), "ok", [`Approved for ${r.date}.`, `Your pass code: ${r.passCode}`]);
    else if (r.status === "denied") showMsg($("statusMsg"), "err", "Sorry, this request was denied.");
    else showMsg($("statusMsg"), "info", "Still pending. Your host has not decided yet.");
  });

  $("tryApprove").addEventListener("click", () => {
    const pending = repo.all().filter((r) => r.status === "pending");
    const target = pending.length ? pending[pending.length - 1].id : "REQ-NONE";
    const res = api.handle(role, "approve", { id: target });
    if (res.status === 403) showMsg($("tryMsg"), "err", [`Blocked with 403: ${res.error}`, "This refusal is now in the audit log."]);
    else showMsg($("tryMsg"), "info", "Switch back to the Visitor role to run this check.");
  });

  // ---------- Host ----------
  function renderHost() {
    const res = api.handle(role, "listPending");
    const list = $("pendingList");
    list.replaceChildren();
    if (res.status !== 200) { list.appendChild(el("p", res.error, "hint")); return; }
    if (!res.body.items.length) list.appendChild(el("p", "No pending requests.", "hint"));
    res.body.items.forEach((r) => {
      const row = el("div", null, "req");
      const info = el("div");
      info.appendChild(el("strong", r.name));
      info.appendChild(el("div", `${r.date}  ·  visiting ${r.host}  ·  ${r.id}`, "meta"));
      const actions = el("div", null, "actions");
      const ok = el("button", "Approve", "primary");
      const no = el("button", "Deny", "danger");
      ok.addEventListener("click", () => decide("approve", r.id));
      no.addEventListener("click", () => decide("deny", r.id));
      actions.append(ok, no);
      row.append(info, actions);
      list.appendChild(row);
    });
    renderAudit();
  }

  function decide(action, id) {
    const res = api.handle(role, action, { id });
    if (res.status === 200 && action === "approve") showMsg($("hostMsg"), "ok", `Approved ${id}. Pass code ${res.body.request.passCode} has been issued.`);
    else if (res.status === 200) showMsg($("hostMsg"), "info", `Denied ${id}.`);
    else showMsg($("hostMsg"), "err", res.body ? res.body.errors : res.error);
    renderHost();
  }

  function renderAudit() {
    const res = api.handle(role, "auditLog");
    const body = $("auditTable").querySelector("tbody");
    body.replaceChildren();
    if (res.status !== 200) return;
    res.body.slice(0, 25).forEach((e) => {
      const tr = el("tr", null, e.outcome.includes("403") ? "denied" : "");
      [new Date(e.time).toLocaleTimeString(), e.role, e.action, e.outcome, e.ref].forEach((v) => tr.appendChild(el("td", v)));
      body.appendChild(tr);
    });
  }

  // ---------- Guard ----------
  $("guardForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const res = api.handle(role, "verifyPass", { code: $("guardCode").value });
    const out = $("guardResult");
    out.replaceChildren();
    if (res.status !== 200) { out.className = "verdict invalid"; out.appendChild(el("div", res.error)); return; }
    const v = res.body;
    out.className = "verdict " + (v.valid ? "valid" : "invalid");
    out.appendChild(el("div", v.valid ? "VALID" : "INVALID", "big"));
    out.appendChild(el("div", v.valid ? `Let in: ${v.visitor}, pass for ${v.date}` : v.reason));
  });

  // ---------- Shared ----------
  document.querySelectorAll(".roles button").forEach((b) => b.addEventListener("click", () => setRole(b.dataset.role)));
  $("resetData").addEventListener("click", () => {
    repo.clear();
    if (storage) storage.removeItem(LOG_KEY);
    location.reload();
    ["requestMsg", "statusMsg", "tryMsg", "hostMsg", "guardResult"].forEach((id) => { $(id).replaceChildren(); $(id).className = id === "guardResult" ? "verdict" : "msg"; });
    setRole(role);
  });

  setRole("visitor");
})();
