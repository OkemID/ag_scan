const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(
  root,
  'modules',
  'ag-scan-inference',
  'android',
  'src',
  'main',
  'assets',
);

const models = [
  {
    name: 'life_jacket.tflite',
    required: true,
    purpose: 'wear/not-wear detector',
  },
  {
    name: 'person.tflite',
    required: false,
    purpose: 'no-person fallback',
  },
];

const sourceFiles = [
  path.join(root, 'App.jsx'),
  path.join(root, 'hooks', 'useScanner.js'),
  path.join(root, 'utils', 'onDeviceInference.js'),
];

let failed = false;

for (const model of models) {
  const modelPath = path.join(assetsDir, model.name);
  if (!fs.existsSync(modelPath)) {
    const marker = model.required ? '✗' : '⚠';
    console[model.required ? 'error' : 'warn'](
      `${marker} Missing ${model.name} (${model.purpose})`,
    );
    if (model.required) failed = true;
    continue;
  }

  const sizeMb = fs.statSync(modelPath).size / (1024 * 1024);
  console.log(`✓ ${model.name} found (${sizeMb.toFixed(2)} MB) — ${model.purpose}`);
}

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/https?:\/\//i.test(text) || /SERVER_URL|pingServer|\/scan\b/.test(text)) {
    console.error(`✗ Network/backend reference found in ${path.relative(root, file)}`);
    failed = true;
  }
}

const detectorPath = path.join(
  root,
  'modules',
  'ag-scan-inference',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'agscaninference',
  'OnDeviceSafetyDetector.kt',
);
const detectorText = fs.readFileSync(detectorPath, 'utf8');

if (!detectorText.includes('life_jacket.tflite')) {
  console.error('✗ Native detector is not configured to load life_jacket.tflite.');
  failed = true;
}
if (/analyseSafetyColours|COLOUR_CHECK_PASSED/.test(detectorText)) {
  console.error('✗ Legacy HSV verdict logic is still active.');
  failed = true;
}

if (!failed) {
  console.log('✓ Wear/not-wear model is the active decision path.');
  console.log('✓ No backend dependency found in the active scan path.');
  console.log('✓ Source is ready for Android prebuild or EAS Build.');
}

process.exit(failed ? 1 : 0);
