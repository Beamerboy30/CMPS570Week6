# Campus Visitor Pass

A student project, not an official Bay Atlantic University service. A one-page proof of concept for the CMPS 570 team project. Visitors request a campus pass, a host approves or denies it, and the guard checks the pass code at the gate.

**Live page:** _add the GitHub Pages link here_
**Tests:** open `tests/tests.html` on the live site, or run `node tests/run-node.js`

## Architecture

The system is designed as **client–server with a REST API**, layered inside the server. Because the brief allows a browser-only proof, the server layers run inside the page, but they are kept in separate files so the structure matches the design:

| File | Layer | Job |
|---|---|---|
| `js/ui.js` | Presentation (client) | The page. Talks only to the API. |
| `js/api.js` | API boundary (trust boundary) | Checks the role for every action and writes the audit log. |
| `js/passService.js` | Business logic | Validates input, approves or denies, issues and verifies pass codes. |
| `js/repository.js` | Data | Stores requests. A memory version is used for tests, a localStorage version for the page. |

## Security tactics shown

- **Authorize actors:** only the Host role can approve or deny. Any other role gets a 403 (try the "Security check" card on the Visitor tab).
- **Validate input:** names, dates and hosts are checked; bad input is rejected with a clear message.
- **Limit exposure:** the guard only sees valid/invalid, a first name and the date.
- **Audit:** every action, including refused ones, is logged without visitor names.
- **Safe output:** user text is written with `textContent`, so it can never run as code.

## Testability

`tests/tests.js` runs 16 tests with a fake in-memory data store, a fixed clock and a predictable pass-code generator, so no real visitor data is ever needed.

## Run locally

Open `index.html` in a browser. No install needed.
