/**
 * Last file in the suite: prints the check → pass/skip/fail table against the
 * shared registry once every project suite has finished.
 */
import { afterAll, it } from 'bun:test';
import { printSummaryNow } from './helpers';

afterAll(printSummaryNow);

it('prints the e2e-full summary', () => {});
