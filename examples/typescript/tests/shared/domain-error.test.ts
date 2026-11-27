import { describe, it, expect } from 'vitest';
import { DomainError } from '@/shared/domain-error';

// The shared kernel is tested on its own: no module is imported here.
class InvalidThing extends DomainError {}

describe('DomainError (shared kernel)', () => {
  it('lets outer layers catch any broken business rule with one type, and keeps the concrete name', () => {
    const error = new InvalidThing('a rule was broken');
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidThing');
    expect(error.message).toBe('a rule was broken');
  });
});
