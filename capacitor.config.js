/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.aquaculture.app',
  appName: 'AquaCulture',
  webDir: 'apps/web/dist',
  bundledWebRuntime: false,
  server: {
    cleartext: false,
  },
};

module.exports = config;
