const mockSetItemAsync = jest.fn<Promise<void>, [string, string]>();
const mockGetItemAsync = jest.fn<Promise<string | null>, [string]>();
const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
  getItemAsync: (key: string) => mockGetItemAsync(key),
  deleteItemAsync: (key: string) => mockDeleteItemAsync(key),
}));

// Import after jest.mock is registered.
import { guardarToken, leerToken, borrarToken, KEY } from './session-store';

describe('session-store (MOB-01)', () => {
  beforeEach(() => {
    mockSetItemAsync.mockReset().mockResolvedValue(undefined);
    mockGetItemAsync.mockReset().mockResolvedValue(null);
    mockDeleteItemAsync.mockReset().mockResolvedValue(undefined);
  });

  it('exposes the storage key used for the session token', () => {
    expect(KEY).toBe('md_session_token');
  });

  describe('guardarToken', () => {
    it('calls setItemAsync(KEY, token)', async () => {
      await guardarToken('a-token');

      expect(mockSetItemAsync).toHaveBeenCalledWith('md_session_token', 'a-token');
    });
  });

  describe('leerToken', () => {
    it('returns the stored value when present', async () => {
      mockGetItemAsync.mockResolvedValue('stored-token');

      const result = await leerToken();

      expect(result).toBe('stored-token');
      expect(mockGetItemAsync).toHaveBeenCalledWith('md_session_token');
    });

    it('returns null when absent', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const result = await leerToken();

      expect(result).toBeNull();
    });
  });

  describe('borrarToken', () => {
    it('calls deleteItemAsync(KEY)', async () => {
      await borrarToken();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('md_session_token');
    });

    it('is idempotent — calling twice does not throw', async () => {
      await borrarToken();
      await expect(borrarToken()).resolves.toBeUndefined();
    });

    it('never throws across the boundary even if deleteItemAsync rejects', async () => {
      mockDeleteItemAsync.mockRejectedValue(new Error('keychain error'));

      await expect(borrarToken()).resolves.toBeUndefined();
    });
  });
});
