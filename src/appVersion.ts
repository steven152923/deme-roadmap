import packageJson from '../package.json';

/**
 * Single UI source of truth for the installed app version.
 * The Windows installer and Electron app metadata also come from package.json.
 */
export const APP_VERSION = packageJson.version;
