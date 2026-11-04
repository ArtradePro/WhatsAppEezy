import { describe, it, expect } from 'vitest';
import { selectSupportBusiness, higieneSupportReply } from '../src/services/state-machine/business-support';
describe('LCSH shared-number support', () => {
 it('defaults greetings and vague quotes to LCSH', () => {
  expect(selectSupportBusiness('hi')).toBe('lcsh');
  expect(selectSupportBusiness('I want a quote')).toBe('lcsh');
 });
 it('keeps product context for follow-up questions', () => {
  expect(selectSupportBusiness('Do you sell Fungus No More?')).toBe('higiene');
  expect(selectSupportBusiness('What is the price?', 'higiene')).toBe('higiene');
 });
 it('distinguishes building mould and returns to construction explicitly', () => {
  expect(selectSupportBusiness('fungus on my bathroom wall')).toBe('lcsh');
  expect(selectSupportBusiness('LCSH renovations', 'higiene')).toBe('lcsh');
 });
 it('clarifies mixed enquiries without choosing a business', () => {
  expect(selectSupportBusiness('LCSH and Fungus No More')).toBe('clarify');
 });
 it('uses the parent company and avoids quoting unverified prices', () => {
  expect(higieneSupportReply('hi')).toContain('Hygienical (Pty) Ltd T/A Higiene');
  expect(higieneSupportReply('price')).toContain('need confirmation');
  expect(higieneSupportReply('ingredients')).toContain('approved label');
 });
});
