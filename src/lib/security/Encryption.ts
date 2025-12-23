export class EncryptionManager {
    private static ALGORITHM = 'AES-GCM';
    private static KEY_USAGE: KeyUsage[] = ['encrypt', 'decrypt'];

    /**
     * Generates a new random key for the session/user.
     * In a real app, this would be derived from a password or stored securely.
     */
    static async generateKey(): Promise<CryptoKey> {
        return window.crypto.subtle.generateKey(
            {
                name: this.ALGORITHM,
                length: 256,
            },
            true,
            this.KEY_USAGE
        );
    }

    /**
     * Exports key to base64 string for storage (e.g. in localStorage)
     */
    static async exportKey(key: CryptoKey): Promise<string> {
        const exported = await window.crypto.subtle.exportKey('jwk', key);
        return JSON.stringify(exported);
    }

    /**
     * Imports key from base64 string
     */
    static async importKey(keyStr: string): Promise<CryptoKey> {
        const jwk = JSON.parse(keyStr);
        return window.crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: this.ALGORITHM },
            true,
            this.KEY_USAGE
        );
    }

    /**
     * Encrypts data object. Returns format: { iv, data }
     */
    static async encrypt(data: any, key: CryptoKey): Promise<{ iv: number[]; data: number[] }> {
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedContent = await window.crypto.subtle.encrypt(
            {
                name: this.ALGORITHM,
                iv: iv,
            },
            key,
            encoded
        );

        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encryptedContent)),
        };
    }

    /**
     * Decrypts data object.
     */
    static async decrypt(encrypted: { iv: number[]; data: number[] }, key: CryptoKey): Promise<any> {
        const iv = new Uint8Array(encrypted.iv);
        const data = new Uint8Array(encrypted.data);

        const decryptedContent = await window.crypto.subtle.decrypt(
            {
                name: this.ALGORITHM,
                iv: iv,
            },
            key,
            data
        );

        const decoded = new TextDecoder().decode(decryptedContent);
        return JSON.parse(decoded);
    }
}
