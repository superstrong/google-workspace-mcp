import { HttpFunction } from '@google-cloud/functions-framework';
import { Request, Response } from 'express';
import { EventSimulator } from './services/event-simulator.js';
import { TestAuthenticator } from './services/test-authenticator.js';

export const qaDashboard: HttpFunction = async (req: Request, res: Response) => {
  try {
    // Handle different routes
    const path = req.path || '/';
    
    switch (path) {
      case '/':
        return await serveDashboard(req, res);
      case '/simulate-email':
        return await handleEmailSimulation(req, res);
      case '/simulate-calendar':
        return await handleCalendarSimulation(req, res);
      case '/test-auth':
        return await handleAuthTest(req, res);
      case '/api/emails':
        return await handleListEmails(req, res);
      case '/api/calendar-events':
        return await handleListCalendarEvents(req, res);
      default:
        res.status(404).json({ error: 'Not found' });
    }
  } catch (error) {
    console.error('QA Dashboard error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

async function serveDashboard(req: Request, res: Response) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Workspace MCP - QA Dashboard</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 30px;
        }
        h1 {
            color: #1a73e8;
            text-align: center;
            margin-bottom: 30px;
        }
        .section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            background: #fafafa;
        }
        .section h2 {
            color: #333;
            margin-top: 0;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }
        input, select, textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        textarea {
            height: 100px;
            resize: vertical;
        }
        button {
            background-color: #1a73e8;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
            margin-bottom: 10px;
        }
        button:hover {
            background-color: #1557b0;
        }
        button.secondary {
            background-color: #5f6368;
        }
        button.secondary:hover {
            background-color: #3c4043;
        }
        .results {
            margin-top: 20px;
            padding: 15px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 400px;
            overflow-y: auto;
        }
        .success {
            border-left: 4px solid #34a853;
            background-color: #e8f5e8;
        }
        .error {
            border-left: 4px solid #ea4335;
            background-color: #fce8e6;
        }
        .loading {
            color: #1a73e8;
            font-style: italic;
        }
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Google Workspace MCP - QA Dashboard</h1>
        
        <div class="section">
            <h2>🔐 Authentication Test</h2>
            <div class="form-group">
                <label for="testEmail">Email Address:</label>
                <input type="email" id="testEmail" placeholder="user@example.com" required>
            </div>
            <button onclick="testAuthentication()">Test Authentication</button>
            <div id="authResults" class="results" style="display: none;"></div>
        </div>

        <div class="grid">
            <div class="section">
                <h2>📧 Email Event Simulation</h2>
                <div class="form-group">
                    <label for="emailId">Email ID (or leave empty for latest):</label>
                    <input type="text" id="emailId" placeholder="Optional: specific email ID">
                </div>
                <div class="form-group">
                    <label for="emailPrompt">Test Prompt:</label>
                    <textarea id="emailPrompt" placeholder="Analyze this email and suggest actions...">Analyze this email and suggest appropriate actions. If it's urgent, prioritize it. If it requires a response, draft a reply.</textarea>
                </div>
                <div class="form-group">
                    <label for="emailScenario">Scenario:</label>
                    <select id="emailScenario">
                        <option value="new_email">New Email Received</option>
                        <option value="urgent_email">Urgent Email</option>
                        <option value="meeting_request">Meeting Request</option>
                        <option value="attachment_received">Email with Attachment</option>
                    </select>
                </div>
                <button onclick="simulateEmailEvent()">Simulate Email Event</button>
                <button class="secondary" onclick="loadRecentEmails()">Load Recent Emails</button>
                <div id="emailResults" class="results" style="display: none;"></div>
            </div>

            <div class="section">
                <h2>📅 Calendar Event Simulation</h2>
                <div class="form-group">
                    <label for="eventId">Calendar Event ID (or leave empty for latest):</label>
                    <input type="text" id="eventId" placeholder="Optional: specific event ID">
                </div>
                <div class="form-group">
                    <label for="calendarScenario">Scenario:</label>
                    <select id="calendarScenario">
                        <option value="meeting_created">Meeting Created</option>
                        <option value="meeting_updated">Meeting Updated</option>
                        <option value="meeting_cancelled">Meeting Cancelled</option>
                        <option value="meeting_reminder">Meeting Reminder</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="calendarPrompt">Test Prompt:</label>
                    <textarea id="calendarPrompt" placeholder="Handle this calendar event...">Handle this calendar event. Check for conflicts, prepare agenda items, and notify relevant participants.</textarea>
                </div>
                <button onclick="simulateCalendarEvent()">Simulate Calendar Event</button>
                <button class="secondary" onclick="loadRecentEvents()">Load Recent Events</button>
                <div id="calendarResults" class="results" style="display: none;"></div>
            </div>
        </div>

        <div class="section">
            <h2>🔧 Function Testing</h2>
            <button onclick="testGmailFunction()">Test Gmail Function</button>
            <button onclick="testCalendarFunction()">Test Calendar Function</button>
            <button onclick="testDriveFunction()">Test Drive Function</button>
            <button class="secondary" onclick="clearAllResults()">Clear All Results</button>
            <div id="functionResults" class="results" style="display: none;"></div>
        </div>
    </div>

    <script>
        // Utility functions
        function showResults(elementId, content, isError = false) {
            const element = document.getElementById(elementId);
            element.style.display = 'block';
            element.className = 'results ' + (isError ? 'error' : 'success');
            element.textContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
        }

        function showLoading(elementId, message = 'Loading...') {
            const element = document.getElementById(elementId);
            element.style.display = 'block';
            element.className = 'results loading';
            element.textContent = message;
        }

        async function makeRequest(url, data = null) {
            const options = {
                method: data ? 'POST' : 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            };
            
            if (data) {
                options.body = JSON.stringify(data);
            }
            
            const response = await fetch(url, options);
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Request failed');
            }
            
            return result;
        }

        // Authentication testing
        async function testAuthentication() {
            const email = document.getElementById('testEmail').value;
            if (!email) {
                showResults('authResults', 'Please enter an email address', true);
                return;
            }

            showLoading('authResults', 'Testing authentication...');
            
            try {
                const result = await makeRequest('/test-auth', { email });
                showResults('authResults', result);
            } catch (error) {
                showResults('authResults', 'Authentication test failed: ' + error.message, true);
            }
        }

        // Email simulation
        async function simulateEmailEvent() {
            const email = document.getElementById('testEmail').value;
            const emailId = document.getElementById('emailId').value;
            const prompt = document.getElementById('emailPrompt').value;
            const scenario = document.getElementById('emailScenario').value;

            if (!email) {
                showResults('emailResults', 'Please enter an email address first', true);
                return;
            }

            showLoading('emailResults', 'Simulating email event...');
            
            try {
                const result = await makeRequest('/simulate-email', {
                    email,
                    emailId: emailId || null,
                    prompt,
                    scenario
                });
                showResults('emailResults', result);
            } catch (error) {
                showResults('emailResults', 'Email simulation failed: ' + error.message, true);
            }
        }

        // Calendar simulation
        async function simulateCalendarEvent() {
            const email = document.getElementById('testEmail').value;
            const eventId = document.getElementById('eventId').value;
            const prompt = document.getElementById('calendarPrompt').value;
            const scenario = document.getElementById('calendarScenario').value;

            if (!email) {
                showResults('calendarResults', 'Please enter an email address first', true);
                return;
            }

            showLoading('calendarResults', 'Simulating calendar event...');
            
            try {
                const result = await makeRequest('/simulate-calendar', {
                    email,
                    eventId: eventId || null,
                    prompt,
                    scenario
                });
                showResults('calendarResults', result);
            } catch (error) {
                showResults('calendarResults', 'Calendar simulation failed: ' + error.message, true);
            }
        }

        // Load recent data
        async function loadRecentEmails() {
            const email = document.getElementById('testEmail').value;
            if (!email) {
                showResults('emailResults', 'Please enter an email address first', true);
                return;
            }

            showLoading('emailResults', 'Loading recent emails...');
            
            try {
                const result = await makeRequest('/api/emails?email=' + encodeURIComponent(email));
                showResults('emailResults', result);
            } catch (error) {
                showResults('emailResults', 'Failed to load emails: ' + error.message, true);
            }
        }

        async function loadRecentEvents() {
            const email = document.getElementById('testEmail').value;
            if (!email) {
                showResults('calendarResults', 'Please enter an email address first', true);
                return;
            }

            showLoading('calendarResults', 'Loading recent calendar events...');
            
            try {
                const result = await makeRequest('/api/calendar-events?email=' + encodeURIComponent(email));
                showResults('calendarResults', result);
            } catch (error) {
                showResults('calendarResults', 'Failed to load calendar events: ' + error.message, true);
            }
        }

        // Function testing
        async function testGmailFunction() {
            showLoading('functionResults', 'Testing Gmail function...');
            
            try {
                // Test basic Gmail function connectivity
                const result = await makeRequest('/test-function', { 
                    function: 'gmail',
                    email: document.getElementById('testEmail').value 
                });
                showResults('functionResults', result);
            } catch (error) {
                showResults('functionResults', 'Gmail function test failed: ' + error.message, true);
            }
        }

        async function testCalendarFunction() {
            showLoading('functionResults', 'Testing Calendar function...');
            showResults('functionResults', 'Calendar function testing - Coming soon!');
        }

        async function testDriveFunction() {
            showLoading('functionResults', 'Testing Drive function...');
            showResults('functionResults', 'Drive function testing - Coming soon!');
        }

        function clearAllResults() {
            const resultElements = document.querySelectorAll('.results');
            resultElements.forEach(element => {
                element.style.display = 'none';
                element.textContent = '';
            });
        }

        // Auto-populate email if available
        window.addEventListener('load', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const email = urlParams.get('email');
            if (email) {
                document.getElementById('testEmail').value = email;
            }
        });
    </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

async function handleEmailSimulation(req: Request, res: Response) {
  try {
    const { email, emailId, prompt, scenario } = req.body;
    
    const simulator = new EventSimulator();
    const result = await simulator.simulateEmailEvent(email, emailId, prompt, scenario);
    
    res.json({
      success: true,
      simulation: {
        type: 'email',
        scenario,
        timestamp: new Date().toISOString()
      },
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleCalendarSimulation(req: Request, res: Response) {
  try {
    const { email, eventId, prompt, scenario } = req.body;
    
    const simulator = new EventSimulator();
    const result = await simulator.simulateCalendarEvent(email, eventId, prompt, scenario);
    
    res.json({
      success: true,
      simulation: {
        type: 'calendar',
        scenario,
        timestamp: new Date().toISOString()
      },
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleAuthTest(req: Request, res: Response) {
  try {
    const { email } = req.body;
    
    const authenticator = new TestAuthenticator();
    const result = await authenticator.testAuthentication(email);
    
    res.json({
      success: true,
      authentication: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleListEmails(req: Request, res: Response) {
  try {
    const email = req.query.email as string;
    
    const simulator = new EventSimulator();
    const result = await simulator.getRecentEmails(email);
    
    res.json({
      success: true,
      emails: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleListCalendarEvents(req: Request, res: Response) {
  try {
    const email = req.query.email as string;
    
    const simulator = new EventSimulator();
    const result = await simulator.getRecentCalendarEvents(email);
    
    res.json({
      success: true,
      events: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
