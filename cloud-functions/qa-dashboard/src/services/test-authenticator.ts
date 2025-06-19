import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Firestore } from '@google-cloud/firestore';

interface AuthTestResult {
  email: string;
  tokenExists: boolean;
  tokenValid: boolean;
  accountStatus: string;
  lastRefresh?: string;
  error?: string;
}

export class TestAuthenticator {
  private secretManager: SecretManagerServiceClient;
  private firestore: Firestore;
  private readonly PROJECT_ID: string;

  constructor() {
    this.secretManager = new SecretManagerServiceClient();
    this.firestore = new Firestore();
    this.PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
  }

  /**
   * Test authentication status for a user
   */
  async testAuthentication(email: string): Promise<AuthTestResult> {
    try {
      const result: AuthTestResult = {
        email,
        tokenExists: false,
        tokenValid: false,
        accountStatus: 'unknown'
      };

      // Check if token exists in Secret Manager
      try {
        const tokenData = await this.getStoredToken(email);
        result.tokenExists = true;
        
        // Check if token is still valid (not expired)
        result.tokenValid = this.isTokenValid(tokenData);
        
      } catch (error) {
        result.tokenExists = false;
        result.error = `Token not found: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      // Check account status in Firestore
      try {
        const accountData = await this.getAccountStatus(email);
        if (accountData) {
          result.accountStatus = accountData.isValid ? 'active' : 'inactive';
          result.lastRefresh = accountData.lastRefresh;
        } else {
          result.accountStatus = 'not_found';
        }
      } catch (error) {
        result.accountStatus = 'error';
        result.error = (result.error || '') + ` Account check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      return result;

    } catch (error) {
      return {
        email,
        tokenExists: false,
        tokenValid: false,
        accountStatus: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get stored token data from Secret Manager
   */
  private async getStoredToken(email: string): Promise<any> {
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const secretName = `projects/${this.PROJECT_ID}/secrets/user-token-${sanitizedEmail}/versions/latest`;
    
    const [version] = await this.secretManager.accessSecretVersion({ name: secretName });
    const tokenJson = version.payload?.data?.toString();
    
    if (!tokenJson) {
      throw new Error(`No token found for user ${email}`);
    }
    
    return JSON.parse(tokenJson);
  }

  /**
   * Check if token is still valid (not expired)
   */
  private isTokenValid(tokenData: any): boolean {
    if (!tokenData.expiry_date) {
      return false;
    }
    
    // Add 5 minute buffer to prevent edge cases
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() < (tokenData.expiry_date - bufferTime);
  }

  /**
   * Get account status from Firestore
   */
  private async getAccountStatus(email: string): Promise<any> {
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const accountRef = this.firestore.collection('accounts').doc(sanitizedEmail);
    
    const doc = await accountRef.get();
    if (!doc.exists) {
      return null;
    }
    
    return doc.data();
  }

  /**
   * Test function connectivity
   */
  async testFunctionConnectivity(functionName: string, userEmail: string): Promise<any> {
    try {
      const environment = process.env.ENVIRONMENT || 'staging';
      const region = process.env.REGION || 'us-central1';
      
      let functionUrl: string;
      switch (functionName) {
        case 'gmail':
          functionUrl = `https://${region}-${this.PROJECT_ID}.cloudfunctions.net/gmail-handler-${environment}`;
          break;
        case 'calendar':
          functionUrl = `https://${region}-${this.PROJECT_ID}.cloudfunctions.net/calendar-handler-${environment}`;
          break;
        case 'drive':
          functionUrl = `https://${region}-${this.PROJECT_ID}.cloudfunctions.net/drive-handler-${environment}`;
          break;
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }

      // Make a simple health check request
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'QA-Dashboard/1.0'
        },
        body: JSON.stringify({
          operation: 'health-check',
          email: userEmail
        })
      });

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: functionUrl,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate test data for development
   */
  async generateTestData(email: string): Promise<any> {
    return {
      testEmails: [
        {
          id: 'test-email-1',
          subject: 'Test Email - Urgent Meeting Request',
          from: 'manager@example.com',
          snippet: 'We need to schedule an urgent meeting to discuss the project timeline...',
          scenario: 'urgent_email'
        },
        {
          id: 'test-email-2',
          subject: 'Test Email - Weekly Report',
          from: 'team@example.com',
          snippet: 'Please find attached the weekly progress report...',
          scenario: 'attachment_received'
        }
      ],
      testEvents: [
        {
          id: 'test-event-1',
          summary: 'Test Meeting - Project Review',
          start: { dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
          end: { dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() },
          scenario: 'meeting_created'
        },
        {
          id: 'test-event-2',
          summary: 'Test Meeting - Team Standup',
          start: { dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
          end: { dateTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() },
          scenario: 'meeting_reminder'
        }
      ],
      generatedAt: new Date().toISOString(),
      userEmail: email
    };
  }
}
