// CommonJS config, read by the composition root.
const { join } = require('node:path');

module.exports = { dataDir: join(__dirname, 'data') };
