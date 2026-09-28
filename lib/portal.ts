import { cache } from 'react';
import { readSettings } from './settings';

/** Current portal settings, read once per server render (layout, metadata and page share it). */
export const loadPortal = cache(readSettings);
