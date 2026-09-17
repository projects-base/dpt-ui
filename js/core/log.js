/**
 * Console logging with one prefix, so dashboard chatter is filterable.
 * Its own module because everything depends on it and it depends on nothing.
 */
import { on } from './events.js';

export function log(msg, isError = false) {
  if (isError) {
    console.error(`[DPT] ${msg}`);
  } else {
    console.log(`[DPT] ${msg}`);
  }
}
