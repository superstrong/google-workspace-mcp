/**
 * Google Apps Script Integration for Google Workspace MCP Cloud Functions
 * 
 * This script demonstrates how to integrate with the serverless MCP functions
 * to trigger AI analysis when workspace events occur.
 */

// Configuration - Update these values for your deployment
const MCP_CONFIG = {
  // Cloud Function URLs (update with your project details)
  gmailFunction: 'https://us-central1-YOUR-PROJECT.cloudfunctions.net/gmail-handler-production',
  calendarFunction: 'https://us-central1-YOUR-PROJECT.cloudfunctions.net/calendar-handler-production',
  driveFunction: 'https://us-central1-YOUR-PROJECT.cloudfunctions.net/drive-handler-production',
  qaDashboard: 'https://us-central1-YOUR-PROJECT.cloudfunctions.net/qa-dashboard',
  
  // Security configuration
  jwtSecret: null, // Will be loaded from Properties Service
  requestSigningSecret: null, // Will be loaded from Properties Service
  
  // User configuration
  userEmail: Session.getActiveUser().getEmail(),
  
  // AI prompts for different scenarios
  prompts: {
    newEmail: 'Analyze this email and suggest appropriate actions. If urgent, prioritize it. If it requires a response, draft a reply.',
    urgentEmail: 'This email appears urgent. Analyze the content and suggest immediate actions.',
    meetingRequest: 'This is a meeting request. Check my calendar for conflicts and suggest response.',
    attachmentReceived: 'This email has attachments. Analyze the content and attachments for action items.',
    calendarEvent: 'Handle this calendar event. Check for conflicts, prepare agenda items, and notify relevant participants.',
    meetingReminder: 'This is a meeting reminder. Prepare talking points and check if all attendees are ready.'
  }
};

/**
 * Initialize the MCP integration
 * Call this once to set up triggers and configuration
 */
function initializeMCPIntegration() {
  try {
    // Load secrets from Properties Service
    loadSecrets();
    
    // Set up Gmail triggers
    setupGmailTriggers();
    
    // Set up Calendar triggers
    setupCalendarTriggers();
    
    // Test connectivity
    testConnectivity();
    
    console.log('✅ MCP Integration initialized successfully');
    
  } catch (error) {
    console.error('❌ Failed to initialize MCP Integration:', error);
    throw error;
  }
}

/**
 * Load secrets from Apps Script Properties Service
 */
function loadSecrets() {
  const properties = PropertiesService.getScriptProperties();
  
  MCP_CONFIG.jwtSecret = properties.getProperty('MCP_JWT_SECRET');
  MCP_CONFIG.requestSigningSecret = properties.getProperty('MCP_REQUEST_SIGNING_SECRET');
  
  if (!MCP_CONFIG.jwtSecret || !MCP_CONFIG.requestSigningSecret) {
    throw new Error('Missing required secrets. Please set MCP_JWT_SECRET and MCP_REQUEST_SIGNING_SECRET in Properties Service.');
  }
}

/**
 * Set up Gmail triggers for email events
 */
function setupGmailTriggers() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onEmailReceived') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new Gmail trigger
  ScriptApp.newTrigger('onEmailReceived')
    .gmail()
    .onReceived()
    .create();
    
  console.log('📧 Gmail triggers configured');
}

/**
 * Set up Calendar triggers for calendar events
 */
function setupCalendarTriggers() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onCalendarEventUpdated') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new Calendar trigger
  ScriptApp.newTrigger('onCalendarEventUpdated')
    .calendar()
    .onEventUpdated()
    .create();
    
  console.log('📅 Calendar triggers configured');
}

/**
 * Handle incoming email events
 */
function onEmailReceived(e) {
  try {
    console.log('📧 Email received, triggering MCP analysis...');
    
    // Get email details
    const email = e.email;
    const subject = email.getSubject();
    const from = email.getFrom();
    const body = email.getPlainBody();
    const attachments = email.getAttachments();
    
    // Determine scenario based on email content
    let scenario = 'newEmail';
    let prompt = MCP_CONFIG.prompts.newEmail;
    
    if (isUrgentEmail(subject, body, from)) {
      scenario = 'urgentEmail';
      prompt = MCP_CONFIG.prompts.urgentEmail;
    } else if (isMeetingRequest(subject, body)) {
      scenario = 'meetingRequest';
      prompt = MCP_CONFIG.prompts.meetingRequest;
    } else if (attachments.length > 0) {
      scenario = 'attachmentReceived';
      prompt = MCP_CONFIG.prompts.attachmentReceived;
    }
    
    // Call MCP function
    const response = callMCPFunction('gmail', 'search', {
      search: { 
        from: from,
        subject: subject
      },
      options: { maxResults: 1 }
    }, {
      isSimulation: false,
      scenario: scenario,
      testPrompt: prompt
    });
    
    console.log('✅ MCP Analysis completed:', response);
    
    // Process the AI response
    processEmailAnalysis(email, response, scenario);
    
  } catch (error) {
    console.error('❌ Error processing email:', error);
  }
}

/**
 * Handle calendar event updates
 */
function onCalendarEventUpdated(e) {
  try {
    console.log('📅 Calendar event updated, triggering MCP analysis...');
    
    // Get event details
    const calendarId = e.calendarId;
    const eventId = e.eventId;
    
    // Get the actual event
    const calendar = CalendarApp.getCalendarById(calendarId);
    const event = calendar.getEventById(eventId);
    
    if (!event) {
      console.log('Event not found, skipping analysis');
      return;
    }
    
    // Determine scenario
    const now = new Date();
    const eventStart = event.getStartTime();
    const timeDiff = eventStart.getTime() - now.getTime();
    const hoursUntilEvent = timeDiff / (1000 * 60 * 60);
    
    let scenario = 'calendarEvent';
    let prompt = MCP_CONFIG.prompts.calendarEvent;
    
    if (hoursUntilEvent <= 1 && hoursUntilEvent > 0) {
      scenario = 'meetingReminder';
      prompt = MCP_CONFIG.prompts.meetingReminder;
    }
    
    // Call MCP function (when calendar function is available)
    const response = callMCPFunction('calendar', 'list', {
      timeMin: eventStart.toISOString(),
      timeMax: event.getEndTime().toISOString(),
      maxResults: 1
    }, {
      isSimulation: false,
      scenario: scenario,
      testPrompt: prompt
    });
    
    console.log('✅ Calendar Analysis completed:', response);
    
    // Process the AI response
    processCalendarAnalysis(event, response, scenario);
    
  } catch (error) {
    console.error('❌ Error processing calendar event:', error);
  }
}

/**
 * Call MCP Cloud Function with authentication
 */
function callMCPFunction(service, operation, params, metadata = {}) {
  try {
    // Determine function URL
    let functionUrl;
    switch (service) {
      case 'gmail':
        functionUrl = MCP_CONFIG.gmailFunction;
        break;
      case 'calendar':
        functionUrl = MCP_CONFIG.calendarFunction;
        break;
      case 'drive':
        functionUrl = MCP_CONFIG.driveFunction;
        break;
      default:
        throw new Error(`Unknown service: ${service}`);
    }
    
    // Prepare request payload
    const payload = {
      operation: operation,
      email: MCP_CONFIG.userEmail,
      params: params,
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'apps-script',
        ...metadata
      }
    };
    
    // Generate JWT token
    const token = generateJWTToken();
    
    // Generate request signature
    const signature = generateRequestSignature(payload);
    
    // Make request
    const response = UrlFetchApp.fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Request-Signature': signature,
        'Content-Type': 'application/json',
        'User-Agent': 'GoogleAppsScript/1.0',
        'Origin': 'script.google.com'
      },
      payload: JSON.stringify(payload)
    });
    
    if (response.getResponseCode() !== 200) {
      throw new Error(`Function call failed: ${response.getResponseCode()} ${response.getContentText()}`);
    }
    
    return JSON.parse(response.getContentText());
    
  } catch (error) {
    console.error('❌ MCP Function call failed:', error);
    throw error;
  }
}

/**
 * Generate JWT token for authentication
 */
function generateJWTToken() {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const payload = {
    email: MCP_CONFIG.userEmail,
    iss: 'apps-script',
    aud: 'mcp-functions',
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    iat: Math.floor(Date.now() / 1000)
  };
  
  const encodedHeader = Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, '');
  const encodedPayload = Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/, '');
  
  const signatureInput = encodedHeader + '.' + encodedPayload;
  const signature = Utilities.computeHmacSha256Signature(signatureInput, MCP_CONFIG.jwtSecret);
  const encodedSignature = Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');
  
  return signatureInput + '.' + encodedSignature;
}

/**
 * Generate HMAC signature for request integrity
 */
function generateRequestSignature(payload) {
  const payloadString = JSON.stringify(payload);
  const signature = Utilities.computeHmacSha256Signature(payloadString, MCP_CONFIG.requestSigningSecret);
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');
}

/**
 * Test connectivity to MCP functions
 */
function testConnectivity() {
  try {
    console.log('🔍 Testing MCP connectivity...');
    
    // Test Gmail function
    const gmailTest = callMCPFunction('gmail', 'search', {
      search: { isUnread: false },
      options: { maxResults: 1 }
    });
    
    console.log('✅ Gmail function connectivity: OK');
    
    // Test QA Dashboard
    const qaResponse = UrlFetchApp.fetch(MCP_CONFIG.qaDashboard);
    if (qaResponse.getResponseCode() === 200) {
      console.log('✅ QA Dashboard connectivity: OK');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Connectivity test failed:', error);
    return false;
  }
}

/**
 * Process AI analysis results for emails
 */
function processEmailAnalysis(email, response, scenario) {
  try {
    if (response.status === 'success') {
      console.log(`📧 Email analysis (${scenario}):`, response.data);
      
      // Example: Auto-label urgent emails
      if (scenario === 'urgentEmail') {
        // Add urgent label (implement based on your needs)
        console.log('🚨 Urgent email detected - consider immediate action');
      }
      
      // Example: Auto-respond to meeting requests
      if (scenario === 'meetingRequest') {
        console.log('📅 Meeting request detected - checking calendar availability');
      }
      
    } else {
      console.error('❌ Email analysis failed:', response.error);
    }
  } catch (error) {
    console.error('❌ Error processing email analysis:', error);
  }
}

/**
 * Process AI analysis results for calendar events
 */
function processCalendarAnalysis(event, response, scenario) {
  try {
    if (response.status === 'success') {
      console.log(`📅 Calendar analysis (${scenario}):`, response.data);
      
      // Example: Send meeting reminders
      if (scenario === 'meetingReminder') {
        console.log('⏰ Meeting reminder processed - preparing talking points');
      }
      
    } else {
      console.error('❌ Calendar analysis failed:', response.error);
    }
  } catch (error) {
    console.error('❌ Error processing calendar analysis:', error);
  }
}

/**
 * Utility functions for email classification
 */
function isUrgentEmail(subject, body, from) {
  const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediate'];
  const text = (subject + ' ' + body).toLowerCase();
  return urgentKeywords.some(keyword => text.includes(keyword));
}

function isMeetingRequest(subject, body) {
  const meetingKeywords = ['meeting', 'call', 'conference', 'appointment', 'schedule'];
  const text = (subject + ' ' + body).toLowerCase();
  return meetingKeywords.some(keyword => text.includes(keyword));
}

/**
 * Manual trigger functions for testing
 */
function testEmailTrigger() {
  console.log('🧪 Testing email trigger manually...');
  
  // Simulate an email event
  const mockEmail = {
    getSubject: () => 'Test Email - Urgent Meeting Request',
    getFrom: () => 'test@example.com',
    getPlainBody: () => 'This is a test email for MCP integration.',
    getAttachments: () => []
  };
  
  onEmailReceived({ email: mockEmail });
}

function testCalendarTrigger() {
  console.log('🧪 Testing calendar trigger manually...');
  
  // Get the next upcoming event
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const events = CalendarApp.getEvents(now, tomorrow);
  
  if (events.length > 0) {
    const event = events[0];
    onCalendarEventUpdated({
      calendarId: 'primary',
      eventId: event.getId()
    });
  } else {
    console.log('No upcoming events found for testing');
  }
}

/**
 * Configuration management
 */
function setSecrets() {
  const properties = PropertiesService.getScriptProperties();
  
  // You need to set these values manually
  const jwtSecret = 'your-jwt-secret-here'; // Get from Secret Manager
  const signingSecret = 'your-signing-secret-here'; // Get from Secret Manager
  
  properties.setProperties({
    'MCP_JWT_SECRET': jwtSecret,
    'MCP_REQUEST_SIGNING_SECRET': signingSecret
  });
  
  console.log('✅ Secrets configured');
}

function getSecrets() {
  const properties = PropertiesService.getScriptProperties();
  const secrets = properties.getProperties();
  
  console.log('Current secrets:', Object.keys(secrets));
  return secrets;
}

/**
 * Cleanup function
 */
function cleanupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  
  console.log('🧹 All triggers removed');
}
