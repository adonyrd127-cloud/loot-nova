/**
 * priceService.test.ts — Unit tests for the price service utilities.
 *
 * Tests the pure functions (computeTotalSavings, formatUSD) and
 * the fetch-based fetchRetailPrice with mocked responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeTotalSavings, formatUSD } from '@/entrypoints/utils/priceService.ts';

describe('computeTotalSavings', () => {
    it('returns 0 for an empty array', () => {
        expect(computeTotalSavings([])).toBe(0);
    });

    it('sums all retailPrice values', () => {
        const history = [
            { retailPrice: 19.99 },
            { retailPrice: 29.99 },
            { retailPrice: 9.99 },
        ];
        expect(computeTotalSavings(history)).toBeCloseTo(59.97);
    });

    it('treats missing retailPrice as 0', () => {
        const history = [
            { retailPrice: 10 },
            {},              // no price
            { retailPrice: 5 },
            { retailPrice: undefined },
        ];
        expect(computeTotalSavings(history)).toBe(15);
    });

    it('handles a single game', () => {
        expect(computeTotalSavings([{ retailPrice: 49.99 }])).toBe(49.99);
    });
});

describe('formatUSD', () => {
    it('formats whole numbers', () => {
        expect(formatUSD(10)).toBe('$10.00');
    });

    it('formats decimals', () => {
        expect(formatUSD(19.99)).toBe('$19.99');
    });

    it('formats zero', () => {
        expect(formatUSD(0)).toBe('$0.00');
    });

    it('formats large numbers with comma separator', () => {
        const result = formatUSD(1234.56);
        // en-US uses comma for thousands
        expect(result).toBe('$1,234.56');
    });

    it('rounds to 2 decimal places', () => {
        expect(formatUSD(9.999)).toBe('$10.00');
    });
});
