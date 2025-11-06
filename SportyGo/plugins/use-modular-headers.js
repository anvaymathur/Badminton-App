// plugins/use-modular-headers.js
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withUseModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (!contents.includes('use_modular_headers!')) {
        if (contents.includes('use_frameworks!')) {
          contents = contents.replace(
            /use_frameworks!.*\n/,
            (match) => `${match}use_modular_headers!\n`
          );
        } else {
          contents = `use_modular_headers!\n${contents}`;
        }
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);
};
