
const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

const getUniqueIdentifier = () => {
    if (IS_DEV) {
      return 'com.sparkpro.sportygo.dev';
    }
  
    if (IS_PREVIEW) {
      return 'com.sparkpro.sportygo.preview';
    }
  
    return 'com.sparkpro.sportygo';
  };
  
  const getAppName = () => {
    if (IS_DEV) {
      return 'SportyGo (Dev)';
    }
  
    if (IS_PREVIEW) {
      return 'SportyGo (Preview)';
    }
  
    return 'SportyGo';
  };
  
  export default ({ config }) => ({
    ...config,
    name: getAppName(),
    ios: {
      ...config.ios,
      bundleIdentifier: getUniqueIdentifier(),
    },
    android: {
      ...config.android,
      package: getUniqueIdentifier(),
    },
  });
  