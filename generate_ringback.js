const fs = require('fs');

const sampleRate = 8000;
const durationSeconds = 12;
const numSamples = sampleRate * durationSeconds;
const buffer = Buffer.alloc(44 + numSamples * 2);

// WAV Header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + numSamples * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // Subchunk1Size
buffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
buffer.writeUInt16LE(1, 22); // NumChannels
buffer.writeUInt32LE(sampleRate, 24); // SampleRate
buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
buffer.writeUInt16LE(2, 32); // BlockAlign
buffer.writeUInt16LE(16, 34); // BitsPerSample
buffer.write('data', 36);
buffer.writeUInt32LE(numSamples * 2, 40);

// Generate India/UK Ringback pattern: 0.4s ON, 0.2s OFF, 0.4s ON, 2.0s OFF
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const cycleTime = t % 3.0; // 3 seconds total cycle
  const isOn = (cycleTime < 0.4) || (cycleTime >= 0.6 && cycleTime < 1.0);
  
  let sample = 0;
  if (isOn) {
    // Mix 400Hz and 440Hz sine waves
    const val1 = Math.sin(2 * Math.PI * 400 * t);
    const val2 = Math.sin(2 * Math.PI * 440 * t);
    sample = (val1 + val2) / 2 * 16000; // volume
  }
  buffer.writeInt16LE(sample, 44 + i * 2);
}

fs.writeFileSync('public/ringback.wav', buffer);
console.log('Created public/ringback.wav');
