import { describe, it, expect } from 'vitest';
import { sanitizeGameTitle, sanitizeUrl } from './sanitize';

describe('sanitize.ts', () => {
  describe('sanitizeGameTitle', () => {
    it('should return a normal title as is', () => {
      const title = 'Super Mario Bros.';
      expect(sanitizeGameTitle(title)).toBe(title);
    });

    it('should strip HTML and script characters', () => {
      const title = 'Game <script>alert("xss")</script> & "More"';
      // < > " ' & are removed
      // <script> -> script
      // alert("xss") -> alert(xss)
      // </script> -> /script
      // & -> empty
      // "More" -> More
      expect(sanitizeGameTitle(title)).toBe('Game scriptalert(xss)/script  More');
    });

    it('should remove control characters', () => {
      const title = 'Game\x00Title\x1F';
      expect(sanitizeGameTitle(title)).toBe('GameTitle');
    });

    it('should trim leading and trailing whitespace', () => {
      const title = '   Game Title   ';
      expect(sanitizeGameTitle(title)).toBe('Game Title');
    });

    it('should limit length to 200 characters', () => {
      const longTitle = 'A'.repeat(250);
      const sanitized = sanitizeGameTitle(longTitle);
      expect(sanitized.length).toBe(200);
      expect(sanitized).toBe('A'.repeat(200));
    });

    it('should handle exactly 200 characters correctly', () => {
      const exactly200 = 'B'.repeat(200);
      expect(sanitizeGameTitle(exactly200).length).toBe(200);
      expect(sanitizeGameTitle(exactly200)).toBe(exactly200);
    });

    it('should return an empty string for empty input', () => {
      expect(sanitizeGameTitle('')).toBe('');
    });

    it('should return an empty string for all-whitespace input', () => {
      expect(sanitizeGameTitle('   \t\n   ')).toBe('');
    });

    it('should gracefully handle null or undefined input', () => {
      // @ts-ignore
      expect(sanitizeGameTitle(null)).toBe('');
      // @ts-ignore
      expect(sanitizeGameTitle(undefined)).toBe('');
    });
  });

  describe('sanitizeUrl', () => {
    it('should return valid https URLs', () => {
      const url = 'https://example.com/path?query=1';
      expect(sanitizeUrl(url)).toBe('https://example.com/path?query=1');
    });

    it('should return valid http URLs', () => {
      const url = 'http://example.com';
      expect(sanitizeUrl(url)).toBe('http://example.com/');
    });

    it('should trim whitespace from URLs', () => {
      const url = '   https://example.com   ';
      expect(sanitizeUrl(url)).toBe('https://example.com/');
    });

    it('should return an empty string for non-http/https protocols', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('data:text/html,<html>')).toBe('');
      expect(sanitizeUrl('ftp://example.com')).toBe('');
      expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('should return an empty string for invalid URLs', () => {
      expect(sanitizeUrl('not-a-url')).toBe('');
      expect(sanitizeUrl('https://')).toBe('');
    });

    it('should return an empty string for empty input', () => {
      expect(sanitizeUrl('')).toBe('');
      // @ts-ignore
      expect(sanitizeUrl(null)).toBe('');
      // @ts-ignore
      expect(sanitizeUrl(undefined)).toBe('');
    });
  });
});
