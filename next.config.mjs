// next.config.js or next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
      if (isServer) {
        // Exclude source maps for chrome-aws-lambda
        config.externals = [...config.externals, /chrome-aws-lambda/];
        
        // Include the necessary dependencies for Chromium
        const modifiedRules = config.module.rules.map(rule => {
          if (rule.oneOf) {
            rule.oneOf.forEach((oneOf) => {
              if (!Array.isArray(oneOf.use)) return;
              oneOf.use.forEach((moduleLoader) => {
                if (
                  moduleLoader.loader.includes("css-loader") &&
                  moduleLoader.options.modules
                ) {
                  moduleLoader.options.modules.auto = () => true;
                }
              });
            });
          }
          return rule;
        });
  
        config.module.rules = modifiedRules;
      }
  
      return config;
    },
  };
  
  export default nextConfig;
  