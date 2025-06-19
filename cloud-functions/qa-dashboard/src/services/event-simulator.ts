import { google } from 'googleapis';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import jwt from 'jsonwebtoken';

interface SimulationResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata: {
    timestamp: string;
    executionTime: number;
    isSimulation: boolean;
  };
}

export class EventSimulator {
  private secretManager: SecretManagerServiceClient;
  private readonly PROJECT_ID: string;

  constructor() {
    this.secretManager = new SecretManagerServiceClient();
    this.PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id';
  }

  /**
   * Simulate an email event by fetching an existing email and triggering the Gmail function
   */
  async simulateEmailEvent(
    userEmail: string, 
    emailId?: string, 
    testPrompt?: string, 
    scenario?: string
  ): Promise<SimulationResult> {
    const startTime = Date.now();
    
    try {
      // Get user's access token
      const token = await this.getUserToken(userEmail);
      
      // Initialize Gmail API
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: token });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Get email data (either specific email or latest)
      let emailData;
      if (emailId) {
        // Get specific email
        const response = await gmail.users.messages.get({
          userId: 'me',
          id: emailId,
          format: 'full'
        });
        emailData = response.data;
      } else {
        // Get latest email
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 1,
          q: 'in:inbox'
        });
        
        if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
          throw new Error('No emails found in inbox');
        }
        
        const response = await gmail.users.messages.get({
          userId: 'me',
          id: listResponse.data.messages[0].id!,
          format: 'full'
        });
        emailData = response.data;
      }

      // Create test event payload
      const testEvent = {
        type: 'email_received',
        timestamp: new Date().toISOString(),
        data: emailData,
        metadata: {
          isSimulation: true,
          originalEventId: emailData.id,
          testPrompt: testPrompt || 'Analyze this email and suggest actions',
          scenario: scenario || 'new_email'
        }
      };

      // Trigger Gmail function (simulate the event)
      const functionResult = await this.triggerGmailFunction(userEmail, testEvent);

      return {
        success: true,
        data: {
          email: {
            id: emailData.id,
            threadId: emailData.threadId,
            subject: this.extractSubject(emailData),
            from: this.extractFrom(emailData),
            snippet: emailData.snippet
          },
          functionResult
        },
        metadata: {
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startTime,
          isSimulation: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startTime,
          isSimulation: true
        }
      };
    }
  }

  /**
   * Simulate a calendar event
   */
  async simulateCalendarEvent(
    userEmail: string, 
    eventId?: string, 
    testPrompt?: string, 
    scenario?: string
  ): Promise<SimulationResult> {
    const startTime = Date.now();
    
    try {
      // Get user's access token
      const token = await this.getUserToken(userEmail);
      
      // Initialize Calendar API
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: token });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Get calendar event data
      let eventData;
      if (eventId) {
        // Get specific event
        const response = await calendar.events.get({
          calendarId: 'primary',
          eventId: eventId
        });
        eventData = response.data;
      } else {
        // Get latest event
        const listResponse = await calendar.events.list({
          calendarId: 'primary',
          maxResults: 1,
          orderBy: 'startTime',
          singleEvents: true,
          timeMin: new Date().toISOString()
        });
        
        if (!listResponse.data.items || listResponse.data.items.length === 0) {
          throw new Error('No upcoming calendar events found');
        }
        
        eventData = listResponse.data.items[0];
      }

      // Create test event payload
      const testEvent = {
        type: 'calendar_event',
        timestamp: new Date().toISOString(),
        data: eventData,
        metadata: {
          isSimulation: true,
          originalEventId: eventData.id,
          testPrompt: testPrompt || 'Handle this calendar event',
          scenario: scenario || 'meeting_created'
        }
      };

      // Trigger Calendar function (simulate the event)
      const functionResult = await this.triggerCalendarFunction(userEmail, testEvent);

      return {
        success: true,
        data: {
          event: {
            id: eventData.id,
            summary: eventData.summary,
            start: eventData.start,
            end: eventData.end,
            attendees: eventData.attendees?.length || 0
          },
          functionResult
        },
        metadata: {
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startTime,
          isSimulation: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startTime,
          isSimulation: true
        }
      };
    }
  }

  /**
   * Get recent emails for testing
   */
  async getRecentEmails(userEmail: string, maxResults: number = 10): Promise<any[]> {
    try {
      const token = await this.getUserToken(userEmail);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: token });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'in:inbox'
      });

      if (!listResponse.data.messages) {
        return [];
      }

      // Get details for each email
      const emails = await Promise.all(
        listResponse.data.messages.map(async (message) => {
          const response = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date']
          });
          
          return {
            id: response.data.id,
            threadId: response.data.threadId,
            subject: this.extractSubject(response.data),
            from: this.extractFrom(response.data),
            date: this.extractDate(response.data),
            snippet: response.data.snippet
          };
        })
      );

      return emails;

    } catch (error) {
      throw new Error(`Failed to get recent emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recent calendar events for testing
   */
  async getRecentCalendarEvents(userEmail: string, maxResults: number = 10): Promise<any[]> {
    try {
      const token = await this.getUserToken(userEmail);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: token });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const response = await calendar.events.list({
        calendarId: 'primary',
        maxResults,
        orderBy: 'startTime',
        singleEvents: true,
        timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
        timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()  // Next 7 days
      });

      if (!response.data.items) {
        return [];
      }

      return response.data.items.map(event => ({
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        attendees: event.attendees?.length || 0,
        status: event.status,
        location: event.location
      }));

    } catch (error) {
      throw new Error(`Failed to get recent calendar events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Trigger the Gmail Cloud Function with test data
   */
  private async triggerGmailFunction(userEmail: string, testEvent: any): Promise<any> {
    try {
      // Get function URL from environment or construct it
      const functionUrl = this.getGmailFunctionUrl();
      
      // Generate test JWT token
      const testToken = await this.generateTestToken(userEmail);
      
      // Make request to Gmail function
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Request-Signature': 'test-signature', // For development
          'User-Agent': 'GoogleAppsScript/1.0 (QA-Test)'
        },
        body: JSON.stringify({
          operation: 'search',
          email: userEmail,
          params: {
            search: { isUnread: true },
            options: { maxResults: 1 }
          },
          metadata: testEvent.metadata
        })
      });

      if (!response.ok) {
        throw new Error(`Function call failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      return {
        success: false,
        error: `Failed to trigger Gmail function: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Trigger the Calendar Cloud Function with test data
   */
  private async triggerCalendarFunction(userEmail: string, testEvent: any): Promise<any> {
    // For now, return a placeholder since calendar function isn't implemented yet
    return {
      success: true,
      message: 'Calendar function simulation - Coming soon!',
      testEvent
    };
  }

  /**
   * Get user's access token from Secret Manager
   */
  private async getUserToken(userEmail: string): Promise<string> {
    try {
      const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      const secretName = `projects/${this.PROJECT_ID}/secrets/user-token-${sanitizedEmail}/versions/latest`;
      
      const [version] = await this.secretManager.accessSecretVersion({ name: secretName });
      const tokenJson = version.payload?.data?.toString();
      
      if (!tokenJson) {
        throw new Error(`No token found for user ${userEmail}`);
      }
      
      const tokenData = JSON.parse(tokenJson);
      return tokenData.access_token;

    } catch (error) {
      throw new Error(`Failed to get token for ${userEmail}: ${error instanceof Error ? error.message : 'Token not found'}`);
    }
  }

  /**
   * Generate a test JWT token for function authentication
   */
  private async generateTestToken(userEmail: string): Promise<string> {
    try {
      // Get JWT secret from Secret Manager
      const secretName = `projects/${this.PROJECT_ID}/secrets/jwt-secret/versions/latest`;
      const [version] = await this.secretManager.accessSecretVersion({ name: secretName });
      const secret = version.payload?.data?.toString();
      
      if (!secret) {
        throw new Error('JWT secret not found');
      }
      
      // Generate test token
      const payload = {
        email: userEmail,
        iss: 'qa-dashboard',
        aud: 'gmail-function',
        exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
        iat: Math.floor(Date.now() / 1000)
      };
      
      return jwt.sign(payload, secret, { algorithm: 'HS256' });

    } catch (error) {
      throw new Error(`Failed to generate test token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Gmail function URL
   */
  private getGmailFunctionUrl(): string {
    const environment = process.env.ENVIRONMENT || 'staging';
    const region = process.env.REGION || 'us-central1';
    
    // Construct function URL
    return `https://${region}-${this.PROJECT_ID}.cloudfunctions.net/gmail-handler-${environment}`;
  }

  // Helper methods for extracting email data
  private extractSubject(emailData: any): string {
    const headers = emailData.payload?.headers || [];
    const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
    return subjectHeader?.value || 'No Subject';
  }

  private extractFrom(emailData: any): string {
    const headers = emailData.payload?.headers || [];
    const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
    return fromHeader?.value || 'Unknown Sender';
  }

  private extractDate(emailData: any): string {
    const headers = emailData.payload?.headers || [];
    const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');
    return dateHeader?.value || new Date().toISOString();
  }
}
