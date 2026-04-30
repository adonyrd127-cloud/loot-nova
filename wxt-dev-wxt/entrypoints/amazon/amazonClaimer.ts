/**
 * amazonClaimer.ts — Claim button interaction and hero image extraction.
 *
 * Extracted from amazon.content.ts to improve maintainability.
 * Contains: findClaimButton, extractHeroImage, pollForGameLinks.
 */

import { waitForElement } from '@/entrypoints/utils/helpers.ts';
import { wait } from '@/entrypoints/utils/helpers.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_WAIT_MS = 20_000;
const CARD_POLL_MS = 600;

// ── Claim button ──────────────────────────────────────────────────────────────

/**
 * Finds the primary "Obtener juego" / "Get game" / "Claim" button
 * on the game detail page.
 */
export async function findClaimButton(): Promise<HTMLButtonElement | null> {
    // 1. Most reliable — Amazon's own test attribute (lang-independent)
    const byTarget = await waitForElement(document, 'button[data-a-target="buy-box_button"]', 800, 12) as HTMLButtonElement | null;
    if (byTarget && !byTarget.disabled) return byTarget;

    // 2. Try to find by text content (bilingual)
    const allBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const byText = allBtns.find(b =>
        !b.disabled &&
        /obtener juego|get game|reclamar|claim game|claim/i.test(b.textContent?.trim() ?? '')
    );
    if (byText) return byText;

    // 3. Try Twitch-style primary button
    const byClass = await waitForElement(
        document,
        'button.tw-core-button--primary:not([disabled]), button[class*="Button-primary"]:not([disabled])',
        800, 6
    ) as HTMLButtonElement | null;
    if (byClass) return byClass;

    return null;
}

// ── Hero image extraction ─────────────────────────────────────────────────────

/** Extracts the hero/cover image from the Amazon Luna game detail page */
export function extractHeroImage(): string {
    const selectors = [
        'img[data-a-image-name="heroImage"]',
        'img[class*="HeroImage"]',
        'img[class*="hero-image"]',
        '[class*="hero"] img',
        '[class*="Hero"] img',
        '[class*="cover"] img',
        '[class*="Cover"] img',
        '[class*="thumbnail"] img',
        '[class*="Thumbnail"] img',
        'main img',
    ];
    for (const sel of selectors) {
        const img = document.querySelector<HTMLImageElement>(sel);
        if (img) {
            const src = img.getAttribute('src') || img.src || '';
            if (src && !src.startsWith('data:image')) return src;
            const dataSrc = img.getAttribute('data-src');
            if (dataSrc && !dataSrc.startsWith('data:image')) return dataSrc;
        }
    }
    const allEls = document.querySelectorAll('[class*="hero" i], [class*="cover" i], [class*="header" i]');
    for (const el of Array.from(allEls)) {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none' && bg.startsWith('url(')) {
            const match = bg.match(/url\(["']?(.*?)["']?\)/);
            if (match && match[1] && !match[1].startsWith('data:image')) return match[1];
        }
    }
    return '';
}

// ── Game link polling ─────────────────────────────────────────────────────────

/**
 * Polls the DOM until we find anchor elements that point to claim
 * detail pages. Used as a secondary/fallback check.
 */
export async function pollForGameLinks(): Promise<HTMLAnchorElement[] | null> {
    const deadline = Date.now() + CARD_WAIT_MS;
    while (Date.now() < deadline) {
        const byHref = Array.from(
            document.querySelectorAll<HTMLAnchorElement>('a[href*="/claims/"][href*="/dp/"]')
        ).filter(a => !a.href.includes('/claims/home'));

        if (byHref.length > 0) {
            await wait(2000);
            return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/claims/"][href*="/dp/"]'))
                .filter(a => !a.href.includes('/claims/home'));
        }

        const byTarget = Array.from(
            document.querySelectorAll('[data-a-target="item-card"] a[href]')
        ) as HTMLAnchorElement[];
        if (byTarget.length > 0) return byTarget;

        await wait(CARD_POLL_MS);
    }
    return null;
}
