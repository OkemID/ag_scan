const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const model = path.join(
  root,
  'modules',
  'ag-scan-inference',
  'android',
  'src',
  'main',
  'assets',
  'person.tflite',
);

const sourceFiles = [
  path.join(root, 'App.jsx'),
  path.join(root, 'hooks', 'useScanner.js'),
  path.join(root, 'utils', 'onDeviceInference.js'),
];

let failed = false;

if (!fs.existsSync(model)) {
  console.error('✗ Missing person.tflite. Run scripts/prepare-person-model.ps1');
  failed = true;
} else {
  const sizeMb = fs.statSync(model).size / (1024 * 1024);
  console.log(`✓ person.tflite found (${sizeMb.toFixed(2)} MB)`);
}

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/https?:\/\//i.test(text) || /SERVER_URL|pingServer|\/scan\b/.test(text)) {
    console.error(`✗ Network/backend reference found in ${path.relative(root, file)}`);
    failed = true;
  }
}

if (!failed) {
  console.log('✓ No backend dependency found in the active scan path.');
  console.log('✓ Source is ready for Android prebuild.');
}

process.exit(failed ? 1 : 0);
