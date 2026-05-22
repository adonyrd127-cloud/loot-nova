import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStorage, getStorageItem, setStorageItem, setStorageItems, getStorageItems, mergeIntoStorageItem } from './useStorage';
import { StorageValues } from '@/entrypoints/enums/storageValues';
import { storage } from '#imports';

// Mock the imported storage functions
vi.mock('#imports', () => ({
    storage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        getItems: vi.fn(),
        setItems: vi.fn(),
    }
}));

describe('useStorage Hook and Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('useStorage Hook', () => {
        it('should initialize with default value if storage is empty', async () => {
            vi.mocked(storage.getItem).mockResolvedValue(null);

            const { result } = renderHook(() => useStorage('testKey', 'defaultValue'));

            expect(result.current[0]).toBe('defaultValue');

            await waitFor(() => {
                expect(storage.getItem).toHaveBeenCalledWith('local:testKey');
            });

            // Still default value since storage was null
            expect(result.current[0]).toBe('defaultValue');
        });

        it('should initialize with value from storage if it exists', async () => {
            vi.mocked(storage.getItem).mockResolvedValue('storedValue');

            const { result } = renderHook(() => useStorage('testKey', 'defaultValue'));

            // Initial render is default value before useEffect runs
            expect(result.current[0]).toBe('defaultValue');

            await waitFor(() => {
                expect(result.current[0]).toBe('storedValue');
            });

            expect(storage.getItem).toHaveBeenCalledWith('local:testKey');
        });

        it('should update storage when value is changed', async () => {
            vi.mocked(storage.getItem).mockResolvedValue(null);

            const { result } = renderHook(() => useStorage('testKey', 'defaultValue'));

            // Wait for initialization to complete
            await waitFor(() => {
                expect(storage.getItem).toHaveBeenCalledWith('local:testKey');
            });

            act(() => {
                const setValue = result.current[1];
                setValue('newValue');
            });

            await waitFor(() => {
                expect(storage.setItem).toHaveBeenCalledWith('local:testKey', 'newValue');
            });
        });
    });

    describe('Storage Utility Functions', () => {
        it('getStorageItem should call storage.getItem', async () => {
            vi.mocked(storage.getItem).mockResolvedValue('testVal');
            const res = await getStorageItem('myKey');
            expect(storage.getItem).toHaveBeenCalledWith('local:myKey');
            expect(res).toBe('testVal');
        });

        it('setStorageItem should call storage.setItem', async () => {
            await setStorageItem('myKey', 'myVal');
            expect(storage.setItem).toHaveBeenCalledWith('local:myKey', 'myVal');
        });

        it('setStorageItems should map and call storage.setItems', async () => {
            await setStorageItems({ key1: 'val1', key2: 'val2' });
            expect(storage.setItems).toHaveBeenCalledWith([
                { key: 'local:key1', value: 'val1' },
                { key: 'local:key2', value: 'val2' }
            ]);
        });

        it('getStorageItems should map keys, call getItems and return mapped object', async () => {
            vi.mocked(storage.getItems).mockResolvedValue([
                { key: 'local:key1', value: 'val1' },
                { key: 'local:key2', value: 'val2' }
            ]);
            const res = await getStorageItems(['key1', 'key2']);
            expect(storage.getItems).toHaveBeenCalledWith(['local:key1', 'local:key2']);
            expect(res).toEqual({ key1: 'val1', key2: 'val2' });
        });

        describe('mergeIntoStorageItem', () => {
            it('should initialize array if value is null', async () => {
                vi.mocked(storage.getItem).mockResolvedValue(null);
                await mergeIntoStorageItem('list', 'item1');
                expect(storage.setItem).toHaveBeenCalledWith('local:list', ['item1']);
            });

            it('should concat array if value is array', async () => {
                vi.mocked(storage.getItem).mockResolvedValue(['item1']);
                await mergeIntoStorageItem('list', 'item2');
                expect(storage.setItem).toHaveBeenCalledWith('local:list', ['item1', 'item2']);
            });

            it('should concat string if value is string', async () => {
                vi.mocked(storage.getItem).mockResolvedValue('hello');
                await mergeIntoStorageItem('str', ' world');
                expect(storage.setItem).toHaveBeenCalledWith('local:str', 'hello world');
            });

            it('should add number if value is number', async () => {
                vi.mocked(storage.getItem).mockResolvedValue(5);
                await mergeIntoStorageItem('num', 3);
                expect(storage.setItem).toHaveBeenCalledWith('local:num', 8);
            });

            it('should throw error for unsupported types', async () => {
                vi.mocked(storage.getItem).mockResolvedValue({ obj: true });
                await expect(mergeIntoStorageItem('obj', 'val')).rejects.toThrow('mergeIntoStorageItem: Unsupported data type for appending.');
            });
        });
    });
});
