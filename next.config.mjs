/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
      if (isServer) {
        // Exclude chrome-aws-lambda source maps
        config.externals = [...config.externals, /chrome-aws-lambda/];
      }
  
      return config;
    },
  };
  
  export default nextConfig;
  