/**
 * Run every test file in one process.
 *
 * `node --test tests/*.test.js` is the usual command, but some constrained
 * Windows environments deny the test runner's child-process spawn. Importing
 * the files keeps Node's own test runner/reporting and works in both modes.
 */
import './detection.test.js'
import './engine.test.js'
import './engine-extra.test.js'
import './plugin.test.js'
