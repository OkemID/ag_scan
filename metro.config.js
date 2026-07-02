const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// m4a is not in Metro's default asset list
config.resolver.assetExts.push('m4a');

module.exports = config;
