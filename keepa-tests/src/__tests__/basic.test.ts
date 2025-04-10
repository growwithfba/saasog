// src/__tests__/basic.test.ts

import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Basic Test Setup', () => {
    it('Jest is working', () => {
        expect(true).toBe(true);
    });
    
    it('Can handle async operations', async () => {
        const result = await Promise.resolve('test');
        expect(result).toBe('test');
    });

    it('TypeScript support is working', () => {
        interface TestInterface {
            name: string;
            value: number;
        }

        const testObj: TestInterface = {
            name: 'test',
            value: 42
        };

        expect(testObj.name).toBe('test');
        expect(testObj.value).toBe(42);
    });
});