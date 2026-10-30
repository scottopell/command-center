import { homedir } from 'node:os';
import path from 'node:path';
export function dataDirectory() { return process.env.COMMAND_CENTER_DATA_DIR || path.join(homedir(), 'Library/Application Support/CommandCenter'); }
export const defaultPort = 19287;
