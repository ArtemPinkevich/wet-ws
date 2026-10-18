module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'wet-ws-ai',
    ignore: [
      /^\/(src|tests|scripts|out|\.tools|\.cache|\.agents|\.codex|проектные-документы|общие-документы)(\/|$)/,
      /^\/(AGENTS\.md|README\.md|tsconfig\.json|Dockerfile|\.dockerignore|\.gitignore|\.node-version)$/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'linux', 'darwin'],
    },
  ],
};
