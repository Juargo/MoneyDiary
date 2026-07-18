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

    // SEC MEDIUM (review finding): a rejected/no-op deleteItemAsync must not
    // silently look like a successful logout while the token is still on
    // the device — verify via re-read and retry once before giving up.
    it('verifies the delete by re-reading, and retries once when the token still persists', async () => {
      mockGetItemAsync.mockResolvedValueOnce('still-there').mockResolvedValueOnce('still-there');

      await borrarToken();

      expect(mockDeleteItemAsync).toHaveBeenCalledTimes(2);
    });

    it('does not retry when the first delete already verifiably cleared the token', async () => {
      mockGetItemAsync.mockResolvedValueOnce(null);

      await borrarToken();

      expect(mockDeleteItemAsync).toHaveBeenCalledTimes(1);
    });

    it('surfaces (warns) rather than silently succeeding when the token persists after the retry', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetItemAsync.mockResolvedValueOnce('still-there').mockResolvedValueOnce('still-there');

      await borrarToken();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does not warn when the retry successfully clears the token', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetItemAsync.mockResolvedValueOnce('still-there').mockResolvedValueOnce(null);

      await borrarToken();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
