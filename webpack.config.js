const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isDevelopment = process.env.NODE_ENV !== 'production';

// Common configuration for both main and renderer
const commonConfig = {
  mode: isDevelopment ? 'development' : 'production',
  devtool: isDevelopment ? 'eval-source-map' : 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@mcp': path.resolve(__dirname, 'src/mcp'),
      '@auth': path.resolve(__dirname, 'src/auth'),
      '@llm': path.resolve(__dirname, 'src/llm'),
      '@types': path.resolve(__dirname, 'src/types')
    }  },  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpg|jpeg|gif|ico|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]'
        }
      },
      // Handle ESM modules that might be problematic
      {
        test: /\.m?js$/,
        type: 'javascript/auto',
        resolve: {
          fullySpecified: false
        }
      }
    ]
  }
};

// Main process configuration
const mainConfig = {
  ...commonConfig,
  target: 'electron-main',
  entry: './src/main/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js'
  },
  externals: {
    'electron': 'commonjs2 electron'
  },
  node: {
    __dirname: false,
    __filename: false
  }
};

// Renderer process configuration
const rendererConfig = {
  ...commonConfig,
  target: 'electron-renderer',
  entry: './src/renderer/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js'
  },  resolve: {
    ...commonConfig.resolve,
    fallback: {
      // Provide Node.js polyfills for browser environment
      "path": require.resolve("path-browserify"),
      "fs": false,
      "os": require.resolve("os-browserify/browser"),
      "crypto": false, // Not used in renderer - main process uses native Node.js crypto
      "stream": require.resolve("stream-browserify"),
      "util": require.resolve("util"),
      "buffer": require.resolve("buffer"),
      "process": require.resolve("process/browser"),
      "vm": false,
      "constants": false,
      "assert": require.resolve("assert"),
      "url": require.resolve("url"),
      "querystring": require.resolve("querystring-es3"),
      "worker_threads": false,
      "child_process": false,
      "module": false
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html'
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: './src/preload.js',
          to: 'preload.js'
        },
        {
          from: './src/index.css',
          to: 'index.css'
        },
        {
          from: './assets',
          to: 'assets'
        }
      ]
    }),
    // Provide global variables for Node.js compatibility
    new (require('webpack')).ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    })
  ],
  externals: {
    'electron': 'commonjs2 electron'
  }
};

// Preload script configuration
const preloadConfig = {
  ...commonConfig,
  target: 'electron-preload',
  entry: './src/preload.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'preload.js'
  },
  externals: {
    'electron': 'commonjs2 electron'
  }
};

module.exports = [mainConfig, rendererConfig, preloadConfig];
