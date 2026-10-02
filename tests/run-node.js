// Run the same tests from a terminal: node tests/run-node.js
require("../js/repository.js");
require("../js/passService.js");
require("../js/api.js");
const { run } = require("./tests.js");
const { results, passed, total } = run();
results.forEach((r) => console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + r.error}`));
console.log(`\n${passed}/${total} tests passed`);
process.exit(passed === total ? 0 : 1);
