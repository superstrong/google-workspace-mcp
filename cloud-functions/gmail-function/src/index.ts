import { HttpFunction } from '@google-cloud/functions-framework';
import { Request, Response } from 'express';
import { SecurityMiddleware } from './security/auth-middleware.js';
import { GmailService } from './services/gmail-service.js';
import { TokenManager } from './services/token-manager.js';
import { AuditLogger } from './security/audit-logger.js';

interface GmailRequest {
  operation: 'search' | 'send' | 'draft' | 'label' | 'attachment' | 'settings';
  email: string;
  params: any;
  metadata?: {
    isSimulation?: boolean;
    originalEventId?: string;
    testPrompt?: string;
  };
}

interface SecurityContext {
  email: string;
  sourceIP: string;
  userAgent: string;
  timestamp: string;
}

export const gmailHandler: HttpFunction = async (req: Request, res: Response) => {
  const startTime = Date.now();
  let securityContext: SecurityContext | null = null;

  try {
    // Security Layer 1: Authentication & Authorization
    securityContext = await SecurityMiddleware.authenticate(req);
    
    // Security Layer 2: Request Validation
    const gmailRequest = await SecurityMiddleware.validateRequest(req.body as GmailRequest);
    
    // Security Layer 3: Rate Limiting (handled by Cloud Functions automatically)
    
    // Audit logging
    await AuditLogger.logRequest(securityContext, gmailRequest.operation, 'STARTED');

    // Get authenticated token
    const tokenManager = new TokenManager();
    const token = await tokenManager.getValidToken(gmailRequest.email);

    // Initialize Gmail service
    const gmailService = new GmailService(token);

    // Route to appropriate handler
    let result;
    switch (gmailRequest.operation) {
      case 'search':
        result = await gmailService.searchEmails(gmailRequest.params);
        break;
      case 'send':
        result = await gmailService.sendEmail(gmailRequest.params);
        break;
      case 'draft':
        result = await gmailService.manageDraft(gmailRequest.params);
        break;
      case 'label':
        result = await gmailService.manageLabel(gmailRequest.params);
        break;
      case 'attachment':
        result = await gmailService.manageAttachment(gmailRequest.params);
        break;
      case 'settings':
        result = await gmailService.getSettings(gmailRequest.params);
        break;
      default:
        throw new Error(`Unsupported operation: ${gmailRequest.operation}`);
    }

    // Security Layer 4: Response Sanitization
    const sanitizedResult = await SecurityMiddleware.sanitizeResponse(result, securityContext);

    // Audit logging
    await AuditLogger.logRequest(securityContext, gmailRequest.operation, 'SUCCESS', {
      executionTime: Date.now() - startTime
    });

    res.status(200).json({
      status: 'success',
      data: sanitizedResult,
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    // Security audit logging
    if (securityContext) {
      await AuditLogger.logRequest(securityContext, 'unknown', 'ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime
      });
    }

    // Error response
    const statusCode = error instanceof Error && error.message.includes('Unauthorized') ? 403 : 500;
    res.status(statusCode).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};
