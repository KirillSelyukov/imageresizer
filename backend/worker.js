const { parentPort } = require('worker_threads');
const sharp = require('sharp');

parentPort.on('message', async ({ jobId, inputPath, outputPath, scale }) => {
  try {
    const image = sharp(inputPath);
    const meta = await image.metadata();

    const newWidth = Math.max(1, Math.round(meta.width * scale / 100));
    const newHeight = Math.max(1, Math.round(meta.height * scale / 100));

    await image.resize(newWidth, newHeight).toFile(outputPath);

    parentPort.postMessage({ jobId, success: true });
  } catch (err) {
    parentPort.postMessage({ jobId, success: false, error: err.message });
  }
});
