const path = require('path');
const fs = require('fs');

const TEST_DIRS = ['unit', 'integration'];

let passed = 0;
let failed = 0;
const failures = [];

function test(description, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => {
          console.log(`  ✓ ${description}`);
          passed++;
        },
        (err) => {
          console.log(`  ✗ ${description}: ${err.message}`);
          failed++;
          failures.push({ description, error: err.message });
        },
      );
    }
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${description}: ${err.message}`);
    failed++;
    failures.push({ description, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runDirectory(dir) {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) return;

  const files = fs.readdirSync(dirPath).filter(f => f.startsWith('test-') && f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    console.log(`\n${file}:`);
    try {
      const testFn = require(filePath);
      if (typeof testFn === 'function') {
        await testFn({ test, assert, assertEqual });
      }
    } catch (err) {
      console.log(`  ✗ Failed to load: ${err.message}`);
      failed++;
      failures.push({ description: file, error: err.message });
    }
    // Clear module cache so tests are re-run on subsequent invocations
    delete require.cache[require.resolve(filePath)];
  }
}

async function run() {
  console.log('Running tests...\n');

  for (const dir of TEST_DIRS) {
    await runDirectory(dir);
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f.description}: ${f.error}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

run();
