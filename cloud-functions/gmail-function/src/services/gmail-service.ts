import { google } from 'googleapis';
import { AuditLogger } from '../security/audit-logger.js';

interface SearchEmailsParams {
  search?: {
    from?: string | string[];
    to?: string | string[];
    subject?: string;
    after?: string;
    before?: string;
    hasAttachment?: boolean;
    labels?: string[];
    excludeLabels?: string[];
    includeSpam?: boolean;
    isUnread?: boolean;
  };
  options?: {
    maxResults?: number;
    pageToken?: string;
    format?: 'full' | 'metadata' | 'minimal';
    includeHeaders?: boolean;
    threadedView?: boolean;
    sortOrder?: 'asc' | 'desc';
  };
  messageIds?: string[];
}

interface SendEmailParams {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    name: string;
    content: string;
    mimeType: string;
  }>;
}

interface ManageDraftParams {
  action: 'create' | 'read' | 'update' | 'delete' | 'send';
  draftId?: string;
  data?: SendEmailParams;
}

interface ManageLabelParams {
  action: 'create' | 'read' | 'update' | 'delete' | 'list';
  labelId?: string;
  name?: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
}

interface ManageAttachmentParams {
  action: 'download' | 'upload' | 'delete';
  messageId: string;
  filename: string;
  content?: string;
}

export class GmailService {
  private gmail: any;
  private oauth2Client: any;

  constructor(accessToken: string) {
    this.oauth2Client = new google.auth.OAuth2();
    this.oauth2Client.setCredentials({ access_token: accessToken });
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Search emails with advanced filtering
   */
  async searchEmails(params: SearchEmailsParams): Promise<any> {
    try {
      const { search = {}, options = {}, messageIds } = params;
      
      // Build Gmail search query
      let query = '';
      
      if (search.from) {
        const fromList = Array.isArray(search.from) ? search.from : [search.from];
        query += fromList.map(from => `from:${from}`).join(' OR ') + ' ';
      }
      
      if (search.to) {
        const toList = Array.isArray(search.to) ? search.to : [search.to];
        query += toList.map(to => `to:${to}`).join(' OR ') + ' ';
      }
      
      if (search.subject) {
        query += `subject:"${search.subject}" `;
      }
      
      if (search.after) {
        query += `after:${search.after} `;
      }
      
      if (search.before) {
        query += `before:${search.before} `;
      }
      
      if (search.hasAttachment) {
        query += 'has:attachment ';
      }
      
      if (search.labels && search.labels.length > 0) {
        query += search.labels.map(label => `label:${label}`).join(' ') + ' ';
      }
      
      if (search.excludeLabels && search.excludeLabels.length > 0) {
        query += search.excludeLabels.map(label => `-label:${label}`).join(' ') + ' ';
      }
      
      if (search.isUnread) {
        query += 'is:unread ';
      }
      
      if (!search.includeSpam) {
        query += '-in:spam ';
      }

      // If specific message IDs are provided, search for those
      if (messageIds && messageIds.length > 0) {
        query = messageIds.map(id => `rfc822msgid:${id}`).join(' OR ');
      }

      const searchParams: any = {
        userId: 'me',
        q: query.trim(),
        maxResults: options.maxResults || 50,
        pageToken: options.pageToken
      };

      const response = await this.gmail.users.messages.list(searchParams);
      
      if (!response.data.messages) {
        return { messages: [], nextPageToken: null };
      }

      // Get full message details if requested
      const format = options.format || 'full';
      const messages = await Promise.all(
        response.data.messages.map(async (message: any) => {
          const messageResponse = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: format
          });
          return messageResponse.data;
        })
      );

      return {
        messages,
        nextPageToken: response.data.nextPageToken,
        resultSizeEstimate: response.data.resultSizeEstimate
      };

    } catch (error) {
      throw new Error(`Failed to search emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send an email
   */
  async sendEmail(params: SendEmailParams): Promise<any> {
    try {
      const { to, subject, body, cc, bcc, attachments } = params;

      // Build email message
      let message = '';
      message += `To: ${to.join(', ')}\r\n`;
      
      if (cc && cc.length > 0) {
        message += `Cc: ${cc.join(', ')}\r\n`;
      }
      
      if (bcc && bcc.length > 0) {
        message += `Bcc: ${bcc.join(', ')}\r\n`;
      }
      
      message += `Subject: ${subject}\r\n`;
      message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      message += body;

      // Handle attachments if present
      if (attachments && attachments.length > 0) {
        // For simplicity, we'll handle basic attachments
        // In production, you'd want more sophisticated MIME handling
        message += '\r\n\r\n-- Attachments --\r\n';
        attachments.forEach(attachment => {
          message += `Attachment: ${attachment.name} (${attachment.mimeType})\r\n`;
        });
      }

      const encodedMessage = Buffer.from(message).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      return response.data;

    } catch (error) {
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Manage email drafts
   */
  async manageDraft(params: ManageDraftParams): Promise<any> {
    try {
      const { action, draftId, data } = params;

      switch (action) {
        case 'create':
          if (!data) {
            throw new Error('Draft data is required for create action');
          }
          return await this.createDraft(data);

        case 'read':
          if (!draftId) {
            throw new Error('Draft ID is required for read action');
          }
          return await this.getDraft(draftId);

        case 'update':
          if (!draftId || !data) {
            throw new Error('Draft ID and data are required for update action');
          }
          return await this.updateDraft(draftId, data);

        case 'delete':
          if (!draftId) {
            throw new Error('Draft ID is required for delete action');
          }
          return await this.deleteDraft(draftId);

        case 'send':
          if (!draftId) {
            throw new Error('Draft ID is required for send action');
          }
          return await this.sendDraft(draftId);

        default:
          throw new Error(`Invalid draft action: ${action}`);
      }

    } catch (error) {
      throw new Error(`Failed to manage draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Manage Gmail labels
   */
  async manageLabel(params: ManageLabelParams): Promise<any> {
    try {
      const { action, labelId, name, messageListVisibility, labelListVisibility } = params;

      switch (action) {
        case 'list':
          const response = await this.gmail.users.labels.list({ userId: 'me' });
          return response.data;

        case 'create':
          if (!name) {
            throw new Error('Label name is required for create action');
          }
          const createResponse = await this.gmail.users.labels.create({
            userId: 'me',
            requestBody: {
              name,
              messageListVisibility: messageListVisibility || 'show',
              labelListVisibility: labelListVisibility || 'labelShow'
            }
          });
          return createResponse.data;

        case 'read':
          if (!labelId) {
            throw new Error('Label ID is required for read action');
          }
          const readResponse = await this.gmail.users.labels.get({
            userId: 'me',
            id: labelId
          });
          return readResponse.data;

        case 'update':
          if (!labelId) {
            throw new Error('Label ID is required for update action');
          }
          const updateResponse = await this.gmail.users.labels.update({
            userId: 'me',
            id: labelId,
            requestBody: {
              name,
              messageListVisibility,
              labelListVisibility
            }
          });
          return updateResponse.data;

        case 'delete':
          if (!labelId) {
            throw new Error('Label ID is required for delete action');
          }
          await this.gmail.users.labels.delete({
            userId: 'me',
            id: labelId
          });
          return { success: true, message: 'Label deleted successfully' };

        default:
          throw new Error(`Invalid label action: ${action}`);
      }

    } catch (error) {
      throw new Error(`Failed to manage label: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Manage email attachments
   */
  async manageAttachment(params: ManageAttachmentParams): Promise<any> {
    try {
      const { action, messageId, filename } = params;

      switch (action) {
        case 'download':
          return await this.downloadAttachment(messageId, filename);

        case 'upload':
          // Upload would typically be handled during email sending
          throw new Error('Upload action should be handled during email composition');

        case 'delete':
          // Gmail doesn't support deleting individual attachments
          throw new Error('Gmail does not support deleting individual attachments');

        default:
          throw new Error(`Invalid attachment action: ${action}`);
      }

    } catch (error) {
      throw new Error(`Failed to manage attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get Gmail settings
   */
  async getSettings(params: any): Promise<any> {
    try {
      const response = await this.gmail.users.settings.getGeneral({ userId: 'me' });
      return response.data;

    } catch (error) {
      throw new Error(`Failed to get Gmail settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private async createDraft(data: SendEmailParams): Promise<any> {
    const message = this.buildEmailMessage(data);
    const encodedMessage = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage
        }
      }
    });

    return response.data;
  }

  private async getDraft(draftId: string): Promise<any> {
    const response = await this.gmail.users.drafts.get({
      userId: 'me',
      id: draftId
    });
    return response.data;
  }

  private async updateDraft(draftId: string, data: SendEmailParams): Promise<any> {
    const message = this.buildEmailMessage(data);
    const encodedMessage = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.drafts.update({
      userId: 'me',
      id: draftId,
      requestBody: {
        message: {
          raw: encodedMessage
        }
      }
    });

    return response.data;
  }

  private async deleteDraft(draftId: string): Promise<any> {
    await this.gmail.users.drafts.delete({
      userId: 'me',
      id: draftId
    });
    return { success: true, message: 'Draft deleted successfully' };
  }

  private async sendDraft(draftId: string): Promise<any> {
    const response = await this.gmail.users.drafts.send({
      userId: 'me',
      requestBody: {
        id: draftId
      }
    });
    return response.data;
  }

  private async downloadAttachment(messageId: string, filename: string): Promise<any> {
    // Get the message to find the attachment
    const message = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId
    });

    // Find the attachment part
    const attachmentPart = this.findAttachmentPart(message.data, filename);
    if (!attachmentPart) {
      throw new Error(`Attachment ${filename} not found in message ${messageId}`);
    }

    // Download the attachment
    const attachment = await this.gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentPart.body.attachmentId
    });

    return {
      filename: attachmentPart.filename,
      mimeType: attachmentPart.mimeType,
      size: attachmentPart.body.size,
      data: attachment.data.data
    };
  }

  private findAttachmentPart(message: any, filename: string): any {
    const parts = message.payload.parts || [message.payload];
    
    for (const part of parts) {
      if (part.filename === filename && part.body && part.body.attachmentId) {
        return part;
      }
      
      // Recursively search in nested parts
      if (part.parts) {
        const nestedPart = this.findAttachmentPart({ payload: { parts: part.parts } }, filename);
        if (nestedPart) {
          return nestedPart;
        }
      }
    }
    
    return null;
  }

  private buildEmailMessage(data: SendEmailParams): string {
    const { to, subject, body, cc, bcc } = data;
    
    let message = '';
    message += `To: ${to.join(', ')}\r\n`;
    
    if (cc && cc.length > 0) {
      message += `Cc: ${cc.join(', ')}\r\n`;
    }
    
    if (bcc && bcc.length > 0) {
      message += `Bcc: ${bcc.join(', ')}\r\n`;
    }
    
    message += `Subject: ${subject}\r\n`;
    message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
    message += body;
    
    return message;
  }
}
