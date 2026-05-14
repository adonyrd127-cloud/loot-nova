import { describe, it, expect, beforeEach } from 'vitest';
import { extractHeroImage } from './amazonClaimer';

describe('amazonClaimer - extractHeroImage', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    it('should return empty string if no matching image is found', () => {
        document.body.innerHTML = '<div><p>No image here</p></div>';
        expect(extractHeroImage()).toBe('');
    });

    it('should find image by data-a-image-name="heroImage"', () => {
        document.body.innerHTML = '<img data-a-image-name="heroImage" src="https://example.com/hero1.jpg" />';
        expect(extractHeroImage()).toBe('https://example.com/hero1.jpg');
    });

    it('should find image by class containing "HeroImage"', () => {
        document.body.innerHTML = '<img class="some-prefix-HeroImage-suffix" src="https://example.com/hero2.jpg" />';
        expect(extractHeroImage()).toBe('https://example.com/hero2.jpg');
    });

    it('should find image inside a container with class containing "hero"', () => {
        document.body.innerHTML = '<div class="hero-container"><img src="https://example.com/hero3.jpg" /></div>';
        expect(extractHeroImage()).toBe('https://example.com/hero3.jpg');
    });

    it('should find image inside a main element', () => {
        document.body.innerHTML = '<main><img src="https://example.com/main-img.jpg" /></main>';
        expect(extractHeroImage()).toBe('https://example.com/main-img.jpg');
    });

    it('should fallback to data-src if src is a data URI', () => {
        document.body.innerHTML = '<img class="hero-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" data-src="https://example.com/real-hero.jpg" />';
        expect(extractHeroImage()).toBe('https://example.com/real-hero.jpg');
    });

    it('should fallback to data-src if src is empty', () => {
        document.body.innerHTML = '<img class="hero-image" src="" data-src="https://example.com/real-hero2.jpg" />';
        expect(extractHeroImage()).toBe('https://example.com/real-hero2.jpg');
    });

    it('should extract background-image url from element with class containing "hero"', () => {
        // JSDOM doesn't easily compute background images from stylesheets,
        // but inline styles can be read by getComputedStyle in some jsdom versions.
        // We simulate the element having an inline style.
        document.body.innerHTML = '<div class="hero-header" style="background-image: url(\'https://example.com/bg-hero.jpg\')"></div>';
        expect(extractHeroImage()).toBe('https://example.com/bg-hero.jpg');
    });

    it('should ignore background-image if it is a data URI', () => {
        document.body.innerHTML = '<div class="cover-art" style="background-image: url(\'data:image/png;base64,...\')"></div>';
        expect(extractHeroImage()).toBe('');
    });

    it('should extract background-image with double quotes', () => {
        document.body.innerHTML = '<div class="header-bg" style="background-image: url(&quot;https://example.com/bg-quotes.jpg&quot;)"></div>';
        expect(extractHeroImage()).toBe('https://example.com/bg-quotes.jpg');
    });
});
