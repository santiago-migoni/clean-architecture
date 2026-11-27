// Shared kernel: pure and minimal, imports nothing from the project.
let counter = 0;
export const newId = (prefix: string): string => `${prefix}-${++counter}`;
