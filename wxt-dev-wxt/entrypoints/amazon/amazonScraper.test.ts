import { describe, it, expect, beforeEach } from 'vitest';
import { detectLogin } from './amazonScraper';

describe('amazonScraper', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('detectLogin', () => {
    it('should return false if sign in button is present', () => {
      document.body.innerHTML = '<a href="#">Sign in</a>';
      expect(detectLogin()).toBe(false);
    });

    it('should return true if avatar image is present', () => {
      document.body.innerHTML = '<img class="user-avatar" src="avatar.jpg" />';
      expect(detectLogin()).toBe(true);
    });
    
    it('should return false if "iniciar sesión" is present', () => {
      document.body.innerHTML = '<button>Iniciar sesión</button>';
      expect(detectLogin()).toBe(false);
    });
    
    it('should return true if account dropdown is present', () => {
      document.body.innerHTML = '<div data-a-target="navbar-account-menu"></div>';
      expect(detectLogin()).toBe(true);
    });
  });
});
