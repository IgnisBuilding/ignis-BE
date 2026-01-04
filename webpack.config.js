const path = require('path');

module.exports = function (options, webpack) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  return {
    ...options,
    cache: isDevelopment ? false : options.cache,
    externals: {
      bcrypt: 'commonjs bcrypt',
    },
    resolve: {
      ...options.resolve,
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        ...(options.resolve?.alias || {}),
        '@app/database': path.resolve(__dirname, 'libs/database/src/index.ts'),
        '@app/entities': path.resolve(__dirname, 'libs/database/src/entities'),
      },
    },
  };
};
