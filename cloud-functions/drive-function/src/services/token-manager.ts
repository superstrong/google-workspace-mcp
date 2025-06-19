import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';

interface TokenData {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

interface UserAccount {
  email: string;
  tokenPath: string;
  lastRefresh: string;
  isValid: boolean;
}

export class TokenManager {
  private secretManager: SecretManagerServiceClient;
  private firestore: Firestore;
  private readonly PROJECT_ID: string;
  private oauth2Client: any;

  constructor() {
    this.secretManager = new SecretManagerServiceClient();
    this.firestore = new Firestore();
    this.PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
    this.initializeOAuth2Client();
  }

  /**
   * Initialize OAuth2 client with credentials from Secret Manager
   */
  private async initializeOAuth2Client(): Promise<void> {
    try {
      // Get OAuth credentials from Secret Manager
      const clientIdSecret = `projects/${this.PROJECT_ID}/secrets/google-client-id/versions/latest`;
      const clientSecretSecret = `projects/${this.PROJECT_ID}/secrets/google-client-secret/versions/latest`;

      const [clientIdVersion] = await this.secretManager.accessSecretVersion({ name: clientIdSecret });
      const [clientSecretVersion] = await this.secretManager.accessSecretVersion({ name: clientSecretSecret });

      const clientId = clientIdVersion.payload?.data?.toString();
      const clientSecret = clientSecretVersion.payload?.data?.toString();

      if (!clientId || !clientSecret) {
        throw new Error('OAuth credentials not found in Secret Manager');
      }

      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000' // Redirect URI for local development
      );

    } catch (error) {
      throw new Error(`Failed to initialize OAuth2 client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a valid access token for the user, refreshing if necessary
   */
  async getValidToken(email: string): Promise<string> {
    try {
      // Get token data from Secret Manager
      const tokenData = await this.getStoredToken(email);
      
      // Check if token is still valid
      if (this.isTokenValid(tokenData)) {
        return tokenData.access_token;
      }

      // Token expired, refresh it
      const refreshedToken = await this.refreshToken(email, tokenData);
      return refreshedToken.access_token;

    } catch (error) {
      throw new Error(`Failed to get valid token for ${email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get stored token data from Secret Manager
   */
  private async getStoredToken(email: string): Promise<TokenData> {
    try {
      const tokenSecretName = `projects/${this.PROJECT_ID}/secrets/user-token-${this.sanitizeEmail(email)}/versions/latest`;
      const [version] = await this.secretManager.accessSecretVersion({ name: tokenSecretName });
      const tokenJson = version.payload?.data?.toString();

      if (!tokenJson) {
        throw new Error(`No token found for user ${email}`);
      }

      return JSON.parse(tokenJson) as TokenData;

    } catch (error) {
      throw new Error(`Failed to retrieve token for ${email}: ${error instanceof Error ? error.message : 'Token not found'}`);
    }
  }

  /**
   * Check if token is still valid (not expired)
   */
  private isTokenValid(tokenData: TokenData): boolean {
    if (!tokenData.expiry_date) {
      return false;
    }

    // Add 5 minute buffer to prevent edge cases
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() < (tokenData.expiry_date - bufferTime);
  }

  /**
   * Refresh an expired token
   */
  private async refreshToken(email: string, tokenData: TokenData): Promise<TokenData> {
    try {
      if (!this.oauth2Client) {
        await this.initializeOAuth2Client();
      }

      // Set the refresh token
      this.oauth2Client.setCredentials({
        refresh_token: tokenData.refresh_token
      });

      // Refresh the token
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      const newTokenData: TokenData = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokenData.refresh_token,
        scope: tokenData.scope,
        token_type: credentials.token_type || 'Bearer',
        expiry_date: credentials.expiry_date!
      };

      // Store the new token
      await this.storeToken(email, newTokenData);

      // Update account status in Firestore
      await this.updateAccountStatus(email, true, 'Token refreshed successfully');

      return newTokenData;

    } catch (error) {
      // Update account status to indicate refresh failure
      await this.updateAccountStatus(email, false, `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to refresh token for ${email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store token data in Secret Manager
   */
  async storeToken(email: string, tokenData: TokenData): Promise<void> {
    try {
      const secretName = `user-token-${this.sanitizeEmail(email)}`;
      const secretPath = `projects/${this.PROJECT_ID}/secrets/${secretName}`;

      // Create secret if it doesn't exist
      try {
        await this.secretManager.createSecret({
          parent: `projects/${this.PROJECT_ID}`,
          secretId: secretName,
          secret: {
            replication: {
              automatic: {}
            }
          }
        });
      } catch (error) {
        // Secret might already exist, which is fine
      }

      // Add new version with token data
      await this.secretManager.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(JSON.stringify(tokenData))
        }
      });

      // Update account record in Firestore
      await this.updateAccountRecord(email, secretName);

    } catch (error) {
      throw new Error(`Failed to store token for ${email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update account record in Firestore
   */
  private async updateAccountRecord(email: string, tokenPath: string): Promise<void> {
    try {
      const accountRef = this.firestore.collection('accounts').doc(this.sanitizeEmail(email));
      
      await accountRef.set({
        email,
        tokenPath,
        lastRefresh: new Date().toISOString(),
        isValid: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });

    } catch (error) {
      console.error(`Failed to update account record for ${email}:`, error);
      // Don't throw here as token storage succeeded
    }
  }

  /**
   * Update account status in Firestore
   */
  private async updateAccountStatus(email: string, isValid: boolean, reason: string): Promise<void> {
    try {
      const accountRef = this.firestore.collection('accounts').doc(this.sanitizeEmail(email));
      
      await accountRef.update({
        isValid,
        lastStatusCheck: new Date().toISOString(),
        statusReason: reason,
        updatedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Failed to update account status for ${email}:`, error);
    }
  }

  /**
   * Remove token and account data
   */
  async removeToken(email: string): Promise<void> {
    try {
      // Delete secret from Secret Manager
      const secretName = `user-token-${this.sanitizeEmail(email)}`;
      const secretPath = `projects/${this.PROJECT_ID}/secrets/${secretName}`;
      
      await this.secretManager.deleteSecret({ name: secretPath });

      // Remove account record from Firestore
      const accountRef = this.firestore.collection('accounts').doc(this.sanitizeEmail(email));
      await accountRef.delete();

    } catch (error) {
      throw new Error(`Failed to remove token for ${email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all user accounts
   */
  async listAccounts(): Promise<UserAccount[]> {
    try {
      const accountsSnapshot = await this.firestore.collection('accounts').get();
      const accounts: UserAccount[] = [];

      accountsSnapshot.forEach(doc => {
        const data = doc.data();
        accounts.push({
          email: data.email,
          tokenPath: data.tokenPath,
          lastRefresh: data.lastRefresh,
          isValid: data.isValid
        });
      });

      return accounts;

    } catch (error) {
      throw new Error(`Failed to list accounts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sanitize email for use as secret/document ID
   */
  private sanitizeEmail(email: string): string {
    return email.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  /**
   * Validate token by making a test API call
   */
  async validateToken(email: string): Promise<boolean> {
    try {
      const token = await this.getValidToken(email);
      
      // Make a simple API call to validate the token
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      this.oauth2Client.setCredentials({ access_token: token });
      
      await oauth2.userinfo.get();
      
      await this.updateAccountStatus(email, true, 'Token validation successful');
      return true;

    } catch (error) {
      await this.updateAccountStatus(email, false, `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
}
