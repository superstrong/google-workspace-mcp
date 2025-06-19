import { HttpFunction } from '@google-cloud/functions-framework';
import { Request, Response } from 'express';
import { SecurityMiddleware } from './auth-middleware.js';
import { CalendarService } from './services/calendar-service.js';
import { AuditLogger } from './audit-logger.js';

interface CalendarRequest {
  operation: 'list' | 'get' | 'create' | 'manage' | 'delete';
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

export const calendarHandler: HttpFunction = async (req: Request, res: Response) => {
  const startTime = Date.now();
  let securityContext: SecurityContext | null = null;

  try {
    // Security Layer 1: Authentication & Authorization
    securityContext = await SecurityMiddleware.authenticate(req);
    
    // Security Layer 2: Request Validation
    const calendarRequest = await SecurityMiddleware.validateRequest(req.body as CalendarRequest);
    
    // Audit logging
    await AuditLogger.logRequest(securityContext, calendarRequest.operation, 'STARTED');

    // For now, use a placeholder token - in production this would come from token management
    const token = 'placeholder_token';

    // Initialize Calendar service
    const calendarService = new CalendarService(token);

    // Route to appropriate handler
    let result;
    switch (calendarRequest.operation) {
      case 'list':
        result = await calendarService.listEvents(calendarRequest.params);
        break;
      case 'get':
        if (!calendarRequest.params.eventId) {
          throw new Error('Event ID is required for get operation');
        }
        result = await calendarService.getEvent(calendarRequest.params.eventId);
        break;
      case 'create':
        result = await calendarService.createEvent(calendarRequest.params);
        break;
      case 'manage':
        result = await calendarService.manageEvent(calendarRequest.params);
        break;
      case 'delete':
        if (!calendarRequest.params.eventId) {
          throw new Error('Event ID is required for delete operation');
        }
        result = await calendarService.deleteEvent(
          calendarRequest.params.eventId,
          calendarRequest.params.sendUpdates
        );
        break;
      default:
        throw new Error(`Unsupported operation: ${calendarRequest.operation}`);
    }

    // Security Layer 4: Response Sanitization
    const sanitizedResult = await SecurityMiddleware.sanitizeResponse(result, securityContext);

    // Audit logging
    await AuditLogger.logRequest(securityContext, calendarRequest.operation, 'SUCCESS', {
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
